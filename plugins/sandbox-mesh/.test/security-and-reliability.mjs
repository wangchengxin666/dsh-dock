import assert from 'node:assert/strict'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { importExternal } from './deps.mjs'
import * as hostPlugin from '../index.js'
import { buildSignedHeaders } from '../src/host/crypto.js'
import { wireHarnessRuntime } from '../src/host/harness-bridge.js'
import { createMeshController } from '../src/client/mesh-controller.js'

const { Context } = await importExternal('@deepseek-ai/cordis')

const tempDir = mkdtempSync(join(tmpdir(), 'dsh-mesh-sec-'))

try {
  // Helper: in-memory Traefik router with optional simulated dead/slow peers + HTTP wire capture
  const nodes = new Map()
  const downPeers = new Set()
  const wireCaptures = []

  const meshFetch = async (url, init = {}) => {
    const parsed = new URL(url)
    const match = parsed.pathname.match(/^\/s\/([a-z0-9_-]+)\/p\/\d+(\/.*)$/i)
    assert.ok(match, `Expected Traefik subpath URL, got: ${url}`)
    const targetSlug = match[1].toLowerCase()
    const subPath = match[2]

    if (downPeers.has(targetSlug)) {
      return await new Promise((_resolve, reject) => {
        if (init.signal?.aborted) {
          reject(new Error('Aborted'))
          return
        }
        init.signal?.addEventListener?.('abort', () => reject(new Error('Request timed out')), { once: true })
      })
    }

    const targetNode = nodes.get(targetSlug)
    if (!targetNode) {
      return new Response(JSON.stringify({ ok: false, error: 'Bad Gateway' }), { status: 502 })
    }
    const headersObj = {}
    if (init.headers) {
      for (const [k, v] of Object.entries(init.headers)) {
        headersObj[k.toLowerCase()] = v
      }
    }
    const result = await targetNode.handleIncomingMeshHttp(
      init.method || 'GET',
      subPath,
      headersObj,
      init.body || '',
    )
    wireCaptures.push({ targetSlug, subPath, reqBody: init.body, resStatus: result.status, resBody: result.body })
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { 'content-type': 'application/json' },
    })
  }

  const makeNode = (slug, extraConfig = {}) => {
    const dir = join(tempDir, `node-${slug}`)
    mkdirSync(dir, { recursive: true })
    const svc = hostPlugin.createMeshService({
      config: {
        storagePath: join(dir, '.dsh', 'mesh.json'),
        homeDir: dir,
        inboxDir: join(dir, 'mesh-inbox'),
        slug,
        ownerName: slug.toUpperCase(),
        ownerEmail: `${slug}@example.com`,
        publicOrigin: 'https://mesh.example.com',
        port: 4090,
        maxAgentHops: 3,
        requestTimeoutMs: 250,
        ...extraConfig,
      },
      fetchImpl: meshFetch,
    })
    nodes.set(slug, svc)
    return { svc, dir }
  }

  const { svc: alice, dir: aliceDir } = makeNode('alice')
  const { svc: bob, dir: bobDir } = makeNode('bob')
  const { svc: charlie, dir: charlieDir } = makeNode('charlie')

  // ---------------------------------------------------------------------------
  // 1. P0-7: X25519 ECDH pairing (sharedSecret never crosses the wire) + 0600 file perms
  // ---------------------------------------------------------------------------
  {
    wireCaptures.length = 0
    const invBob = alice.store.createPairCode()
    const resBob = await bob.claimPairInvite(invBob.inviteUri)
    assert.equal(resBob.ok, true)

    const invCharlie = alice.store.createPairCode()
    const resCharlie = await charlie.claimPairInvite(invCharlie.shortCode)
    assert.equal(resCharlie.ok, true)

    const pairWire = wireCaptures.filter((c) => c.subPath === '/pair/claim')
    assert.equal(pairWire.length, 2)
    for (const entry of pairWire) {
      assert.ok(entry.resBody.hostPublicKey, 'ECDH pairing must return hostPublicKey')
      assert.equal(entry.resBody.sharedSecret, undefined, 'sharedSecret must NEVER be transmitted over HTTP')
    }
    assert.equal(alice.store.getPeer('bob').sharedSecret, bob.store.getPeer('alice').sharedSecret)

    if (process.platform !== 'win32') {
      const mode = statSync(alice.store.filePath).mode & 0o777
      assert.equal(mode, 0o600, 'State file containing secrets must be 0600')
    }
  }

  // ---------------------------------------------------------------------------
  // 2. P0-1 & P0-2: Spoofed sender/room, header tampering, and groupSecret impersonation blocked
  // ---------------------------------------------------------------------------
  {
    const grpRes = await alice.createGroup({
      name: 'Sec Group',
      memberSlugs: ['bob', 'charlie'],
      moderatorSlug: 'alice',
    })
    assert.equal(grpRes.ok, true)
    const groupId = grpRes.room.id
    const groupSecret = alice.store.getRoom(groupId).groupSecret

    // 2a. Paired peer Bob cannot post into pair:alice:bob pretending to be charlie
    const spoofSenderBody = JSON.stringify({
      message: {
        id: 'spoof_sender_1',
        roomId: 'pair:alice:bob',
        sender: { slug: 'charlie', actor: 'human' },
        text: 'forged sender',
      },
    })
    const spoofSenderRes = await alice.handleIncomingMeshHttp(
      'POST',
      '/mesh/message',
      buildSignedHeaders({
        method: 'POST',
        path: '/mesh/message',
        body: spoofSenderBody,
        secret: bob.store.getPeer('alice').sharedSecret,
        fromSlug: 'bob',
      }),
      spoofSenderBody,
    )
    assert.equal(spoofSenderRes.status, 403)

    // 2b. Bob cannot write into Alice<->Charlie's pair room
    const crossRoomBody = JSON.stringify({
      message: {
        id: 'cross_room_1',
        roomId: 'pair:alice:charlie',
        sender: { slug: 'bob', actor: 'human' },
        text: 'cross room injection',
      },
    })
    const crossRoomRes = await alice.handleIncomingMeshHttp(
      'POST',
      '/mesh/message',
      buildSignedHeaders({
        method: 'POST',
        path: '/mesh/message',
        body: crossRoomBody,
        secret: bob.store.getPeer('alice').sharedSecret,
        fromSlug: 'bob',
      }),
      crossRoomBody,
    )
    assert.equal(crossRoomRes.status, 403)

    // 2c. Charlie (group member) tries to impersonate Bob via groupSecret to hijack Bob's profile endpointUrl on Alice
    const hijackProfileBody = JSON.stringify({
      peerProfile: {
        slug: 'bob',
        ownerName: 'Evil Bob',
        endpointUrl: 'https://evil.example.com/s/bob/p/4090',
      },
    })
    const hijackRes = await alice.handleIncomingMeshHttp(
      'POST',
      '/mesh/profile-sync',
      buildSignedHeaders({
        method: 'POST',
        path: '/mesh/profile-sync',
        body: hijackProfileBody,
        secret: groupSecret,
        fromSlug: 'bob',
        groupId,
      }),
      hijackProfileBody,
    )
    assert.equal(hijackRes.status, 403)
    assert.equal(alice.store.getPeer('bob').endpointUrl, 'https://mesh.example.com/s/bob/p/4090')

    // 2d. Charlie tries to spoof Bob in /mesh/message on Alice using groupSecret
    const impersonateBody = JSON.stringify({
      message: {
        id: 'impersonate_bob_1',
        roomId: groupId,
        sender: { slug: 'bob', actor: 'human' },
        text: 'Fake command from Bob',
      },
    })
    const impersonateRes = await alice.handleIncomingMeshHttp(
      'POST',
      '/mesh/message',
      buildSignedHeaders({
        method: 'POST',
        path: '/mesh/message',
        body: impersonateBody,
        secret: groupSecret,
        fromSlug: 'bob',
        groupId,
      }),
      impersonateBody,
    )
    assert.equal(impersonateRes.status, 403)

    // 2e. v2 signature binds x-mesh-from and x-mesh-group headers (tampering fails with 401)
    const msgBody = JSON.stringify({ message: { id: 'hdr_tamper', roomId: groupId, text: 'hi' } })
    const headers = buildSignedHeaders({
      method: 'POST',
      path: '/mesh/message',
      body: msgBody,
      secret: groupSecret,
      fromSlug: 'charlie',
      groupId,
    })
    headers['x-mesh-from'] = 'bob'
    const tamperRes = await bob.handleIncomingMeshHttp('POST', '/mesh/message', headers, msgBody)
    assert.equal(tamperRes.status, 401)

    // 2f. Spoofing attachment.savedPath inside /mesh/message is stripped
    const fakeAttBody = JSON.stringify({
      message: {
        id: 'fake_att_1',
        roomId: 'pair:alice:bob',
        sender: { slug: 'bob', actor: 'human' },
        kind: 'file',
        text: 'check this',
        attachment: { name: 'x.txt', savedPath: '/etc/shadow', sourcePath: '/etc/passwd' },
      },
    })
    const fakeAttRes = await alice.handleIncomingMeshHttp(
      'POST',
      '/mesh/message',
      buildSignedHeaders({
        method: 'POST',
        path: '/mesh/message',
        body: fakeAttBody,
        secret: bob.store.getPeer('alice').sharedSecret,
        fromSlug: 'bob',
      }),
      fakeAttBody,
    )
    assert.equal(fakeAttRes.status, 200)
    const storedFake = alice.store.getSnapshot().messages['pair:alice:bob'].find((m) => m.id === 'fake_att_1')
    assert.equal(storedFake.attachment?.savedPath, undefined)
    assert.equal(storedFake.attachment?.sourcePath, undefined)

    // -------------------------------------------------------------------------
    // 3. P0-3: Group metadata tampering blocked + removeFromGroup rotates groupSecret
    // -------------------------------------------------------------------------
    const takeoverBody = JSON.stringify({
      group: {
        id: groupId,
        type: 'group',
        name: 'Hijacked Group',
        groupSecret: 'attacker-chosen-secret-0000000000',
        createdBy: 'bob',
        moderatorSlug: 'bob',
        members: [
          { slug: 'alice', endpointUrl: 'https://mesh.example.com/s/alice/p/4090' },
          { slug: 'bob', endpointUrl: 'https://mesh.example.com/s/bob/p/4090' },
          { slug: 'charlie', endpointUrl: 'https://evil.example.com/s/charlie/p/4090' },
        ],
      },
    })
    const takeoverRes = await alice.handleIncomingMeshHttp(
      'POST',
      '/mesh/group-sync',
      buildSignedHeaders({
        method: 'POST',
        path: '/mesh/group-sync',
        body: takeoverBody,
        secret: bob.store.getPeer('alice').sharedSecret,
        fromSlug: 'bob',
      }),
      takeoverBody,
    )
    assert.equal(takeoverRes.status, 200)
    const aliceGroupAfter = alice.store.getRoom(groupId)
    assert.equal(aliceGroupAfter.createdBy, 'alice', 'Non-creator must not overwrite createdBy')
    assert.equal(aliceGroupAfter.moderatorSlug, 'alice', 'Non-moderator must not hijack moderatorSlug')
    assert.equal(aliceGroupAfter.groupSecret, groupSecret, 'Non-creator must not replace groupSecret')
    assert.equal(
      aliceGroupAfter.members.find((m) => m.slug === 'charlie')?.endpointUrl,
      'https://mesh.example.com/s/charlie/p/4090',
      'Existing member endpointUrl must not be overwritten by remote group-sync',
    )

    // Creator Alice removes Charlie -> groupSecret rotates on both Alice and Bob
    const kickRes = await alice.removeFromGroup({ roomId: groupId, slug: 'charlie' })
    assert.equal(kickRes.ok, true)
    const rotatedSecret = alice.store.getRoom(groupId).groupSecret
    assert.notEqual(rotatedSecret, groupSecret)
    assert.equal(bob.store.getRoom(groupId).groupSecret, rotatedSecret)
    assert.equal(bob.store.getRoom(groupId).members.some((m) => m.slug === 'charlie'), false)

    // Removed Charlie's old groupSecret can no longer message Bob
    const kickedBody = JSON.stringify({
      message: { id: 'kicked_1', roomId: groupId, sender: { slug: 'charlie', actor: 'human' }, text: 'still here' },
    })
    const kickedRes = await bob.handleIncomingMeshHttp(
      'POST',
      '/mesh/message',
      buildSignedHeaders({
        method: 'POST',
        path: '/mesh/message',
        body: kickedBody,
        secret: groupSecret,
        fromSlug: 'charlie',
        groupId,
      }),
      kickedBody,
    )
    assert.equal(kickedRes.status, 401)
  }

  // ---------------------------------------------------------------------------
  // 4. P0-4 & P1-8: File confinement, agent prose #file suppression, privacy, no overwrite
  // ---------------------------------------------------------------------------
  {
    const outsideFile = join(tempDir, 'outside-secret.txt')
    writeFileSync(outsideFile, 'TOP SECRET', 'utf8')
    writeFileSync(join(aliceDir, '.env'), 'API_KEY=secret', 'utf8')
    writeFileSync(join(aliceDir, 'report.txt'), 'first report', 'utf8')

    // Outside workspace blocked for both human and agent
    const outsideSend = await alice.sendFile({ roomId: 'pair:alice:bob', filePath: outsideFile, actor: 'human' })
    assert.equal(outsideSend.ok, false)
    assert.equal(outsideSend.status, 403)

    // Symlink escaping workspace blocked
    if (process.platform !== 'win32') {
      symlinkSync(outsideFile, join(aliceDir, 'escape-link.txt'))
      const symRes = await alice.sendFile({ roomId: 'pair:alice:bob', filePath: 'escape-link.txt', actor: 'human' })
      assert.equal(symRes.ok, false)
      assert.equal(symRes.status, 403)
    }

    // Secret-like basename (.env) blocked for agent
    const agentEnvRes = await alice.sendFile({ roomId: 'pair:alice:bob', filePath: '.env', actor: 'agent' })
    assert.equal(agentEnvRes.ok, false)
    assert.equal(agentEnvRes.status, 403)

    // Agent prose containing `#report.txt` must NOT auto-attach or exfiltrate files
    wireCaptures.length = 0
    await alice.sendMessage({
      roomId: 'pair:alice:bob',
      text: 'I inspected #report.txt and #.env locally.',
      actor: 'agent',
      hop: 1,
    })
    assert.equal(
      wireCaptures.some((c) => c.subPath === '/mesh/file-offer'),
      false,
      'Agent prose containing #file must never trigger implicit file-offer',
    )

    // searchWorkspaceFiles refuses outside paths
    assert.deepEqual(hostPlugin.searchWorkspaceFiles(aliceDir, '/etc/'), [])

    // Duplicate filenames in inbox do not overwrite (`report.txt` -> `report-1.txt`) + wire strips sourcePath / savedPath
    wireCaptures.length = 0
    const f1 = await alice.sendFile({ roomId: 'pair:alice:bob', filePath: 'report.txt', actor: 'human' })
    assert.equal(f1.ok, true)
    writeFileSync(join(aliceDir, 'report.txt'), 'second report', 'utf8')
    const f2 = await alice.sendFile({ roomId: 'pair:alice:bob', filePath: 'report.txt', actor: 'human' })
    assert.equal(f2.ok, true)

    const inboxDir = join(bobDir, 'mesh-inbox', 'pair_alice_bob')
    assert.equal(readFileSync(join(inboxDir, 'report.txt'), 'utf8'), 'first report')
    assert.equal(readFileSync(join(inboxDir, 'report-1.txt'), 'utf8'), 'second report')

    const offerCapture = wireCaptures.find((c) => c.subPath === '/mesh/file-offer')
    assert.ok(offerCapture)
    const sentWireMsg = JSON.parse(offerCapture.reqBody).message
    assert.equal(sentWireMsg.attachment.sourcePath, undefined, 'sourcePath must not leak over wire')
    assert.equal(offerCapture.resBody.savedPath, undefined, 'receiver savedPath must not leak in HTTP response')
  }

  // ---------------------------------------------------------------------------
  // 5. P0-6 & P1-6 & P1-7: Hop lock enforcement, per-thread wake serialization, single-msg ack
  // ---------------------------------------------------------------------------
  {
    const bobCtx = new Context()
    const bobTools = new Map()
    let concurrent = 0
    let maxConcurrent = 0
    let turnIndex = 0
    const bobEvents = []
    let created = false

    bobCtx.provide('tools', {
      register(def) {
        bobTools.set(def.name, def)
        return () => { bobTools.delete(def.name) }
      },
    })
    bobCtx.provide('agents', { withoutInitiator: (fn) => fn() })
    bobCtx.provide('sessions', { flush: async () => true })
    bobCtx.provide('sessionController', {
      async create() { created = true },
      async resolveAgent() {
        if (!created) return { error: new Error('not created') }
        return {
          agent: {
            id: 'session-mesh-bob-sec',
            session: { id: 'session-mesh-bob-sec', snapshotEvents: () => [...bobEvents] },
            followup(userMsg) {
              const runIdx = ++turnIndex
              concurrent += 1
              if (concurrent > maxConcurrent) maxConcurrent = concurrent
              const prompt = userMsg.content[0].text
              this._p = (async () => {
                await new Promise((r) => setTimeout(r, 35))
                if (prompt.includes('TRY_HOP_BYPASS')) {
                  // Even if LLM calls mesh_ask_peer at hop 3 (maxAgentHops=3), it must fail fast without hanging
                  const askRes = await bobTools.get('mesh_ask_peer').execute({
                    roomId: 'pair:alice:bob',
                    targetSlug: 'alice',
                    question: 'loop',
                    timeoutSeconds: 30,
                  })
                  assert.equal(askRes.ok, false)
                  assert.match(askRes.error, /hop limit/i)

                  // And mesh_send_message must inherit active turn hop (3), never reset to 1
                  const sendRes = await bobTools.get('mesh_send_message').execute({
                    roomId: 'pair:alice:bob',
                    text: 'final answer at hop 3',
                  })
                  assert.equal(sendRes.ok, true)
                }
                bobEvents.push({
                  seq: bobEvents.length + 1,
                  type: 'assistant/message',
                  data: { message: { content: [{ type: 'text', text: `reply-${runIdx}` }] } },
                })
                bobEvents.push({
                  seq: bobEvents.length + 1,
                  type: 'turn/end',
                  data: { reason: { kind: 'completed' } },
                })
              })().finally(() => {
                concurrent -= 1
              })
            },
            async whenIdle() {
              await this._p
            },
          },
        }
      },
    })

    wireHarnessRuntime(bobCtx, bob)
    await new Promise((r) => setTimeout(r, 25))

    // Fire two wakes simultaneously on the same thread -> must execute sequentially (maxConcurrent === 1)
    await Promise.all([
      alice.sendMessage({ roomId: 'pair:alice:bob', text: '@bob concurrent 1', actor: 'human' }),
      alice.sendMessage({ roomId: 'pair:alice:bob', text: '@bob concurrent 2', actor: 'human' }),
    ])
    await new Promise((r) => setTimeout(r, 150))
    assert.equal(maxConcurrent, 1, 'Same-thread wakes must be serialized')

    // Send at hop 2 -> Bob wakes at nextHop=3 -> cannot reset hop via mesh_ask_peer or mesh_send_message
    const t0 = Date.now()
    await alice.sendMessage({
      roomId: 'pair:alice:bob',
      text: '@bob TRY_HOP_BYPASS',
      actor: 'agent',
      hop: 2,
    })
    await new Promise((r) => setTimeout(r, 120))
    assert.ok(Date.now() - t0 < 2000, 'Hop-capped mesh_ask_peer must fail fast instead of blocking')
    const bobFinal = bob.store.getSnapshot().messages['pair:alice:bob']
      .find((m) => m.text === 'final answer at hop 3')
    assert.ok(bobFinal)
    assert.equal(bobFinal.hop, 3, 'mesh_send_message must preserve turn hop 3')

    await bobCtx.fiber.dispose()
  }

  // ---------------------------------------------------------------------------
  // 6. P1-1 & P1-5: Real HTTP server base64 10 MiB math, 413 on overflow, clean dispose
  // ---------------------------------------------------------------------------
  {
    assert.ok(hostPlugin.maxMeshBodyBytes(10 * 1024 * 1024) > Math.ceil((10 * 1024 * 1024 * 4) / 3))

    const smallFileMax = 64 * 1024
    const { svc: httpSvc, dir: httpDir } = makeNode('httptest', { maxFileBytes: smallFileMax })
    const serverHandle = await hostPlugin.startMeshHttpServer(httpSvc, { port: 0 })
    assert.ok(serverHandle.port > 0)

    try {
      // Exact maxFileBytes file (64 KiB -> ~87 KiB base64, exceeds raw maxFileBytes but fits maxMeshBodyBytes)
      const exactBuf = Buffer.alloc(smallFileMax, 0x61)
      const inv = httpSvc.store.createPairCode()
      const token = inv.shortCode.split('.').slice(1).join('.')
      const pairRes = await fetch(`http://127.0.0.1:${serverHandle.port}/pair/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          peerKey: 'legacy-test-key',
          peerProfile: { slug: 'alice', ownerName: 'Alice' },
        }),
      })
      const pairJson = await pairRes.json()
      assert.equal(pairRes.status, 200)

      const offerBody = JSON.stringify({
        message: { id: 'http_exact_file', roomId: 'pair:alice:httptest', sender: { slug: 'alice', actor: 'human' } },
        fileName: 'exact.bin',
        contentBase64: exactBuf.toString('base64'),
      })
      const okFileRes = await fetch(`http://127.0.0.1:${serverHandle.port}/mesh/file-offer`, {
        method: 'POST',
        headers: buildSignedHeaders({
          method: 'POST',
          path: '/mesh/file-offer',
          body: offerBody,
          secret: pairJson.sharedSecret,
          fromSlug: 'alice',
        }),
        body: offerBody,
      })
      assert.equal(okFileRes.status, 200)
      assert.ok(existsSync(join(httpDir, 'mesh-inbox', 'pair_alice_httptest', 'exact.bin')))

      // Over body limit returns HTTP 413 JSON cleanly (not ECONNRESET)
      const hugeBody = 'x'.repeat(hostPlugin.maxMeshBodyBytes(smallFileMax) + 4096)
      const tooBigRes = await fetch(`http://127.0.0.1:${serverHandle.port}/mesh/message`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: hugeBody,
      })
      assert.equal(tooBigRes.status, 413)
      const tooBigJson = await tooBigRes.json()
      assert.equal(tooBigJson.ok, false)
    } finally {
      await serverHandle.close()
    }
  }

  // ---------------------------------------------------------------------------
  // 7. P1-2 & P1-3: Timeout + parallel delivery + secret-free outbox backoff & recovery
  // ---------------------------------------------------------------------------
  {
    const { svc: dead } = makeNode('deadpeer')
    const invDead = alice.store.createPairCode()
    assert.equal((await dead.claimPairInvite(invDead.shortCode)).ok, true)

    const mixGrp = await alice.createGroup({
      name: 'Timeout Resilience',
      memberSlugs: ['bob', 'deadpeer'],
    })
    assert.equal(mixGrp.ok, true)

    downPeers.add('deadpeer')
    const tStart = Date.now()
    const msgRes = await alice.sendMessage({
      roomId: mixGrp.room.id,
      text: 'Hello live bob even while deadpeer hangs',
      actor: 'human',
    })
    assert.equal(msgRes.ok, true)
    assert.ok(Date.now() - tStart < 1500, 'Parallel delivery + timeout must not stall behind deadpeer')
    assert.deepEqual(msgRes.delivery.deliveredTo, ['bob'])
    assert.deepEqual(msgRes.delivery.pendingPeers, ['deadpeer'])

    const outbox = alice.store.listOutbox()
    assert.ok(outbox.length >= 1)
    assert.equal(outbox[0].secret, undefined, 'Outbox must not duplicate secrets on disk')

    // Bring deadpeer back and flush with force
    downPeers.delete('deadpeer')
    const flushed = await alice.flushOutbox({ force: true })
    assert.ok(flushed.flushed >= 1)
    assert.equal(alice.store.listOutbox().length, 0)
  }

  // ---------------------------------------------------------------------------
  // 8. P2-2: Incremental `?rev=` state polling skips unchanged serialization & notifications
  // ---------------------------------------------------------------------------
  {
    const ctx = new Context()
    const routes = new Map()
    ctx.provide('connection', {
      fetch: {
        register(route) {
          routes.set(route.path, route)
          return () => { routes.delete(route.path) }
        },
      },
    })
    const home = join(tempDir, 'rev-home')
    const fiber = ctx.plugin(hostPlugin, {
      storagePath: join(home, '.dsh', 'mesh.json'),
      homeDir: home,
      dshHome: join(home, '.dsh'),
      slug: 'revnode',
      disableServer: true,
    })
    await fiber.inertia
    await new Promise((r) => setTimeout(r, 20))

    const stateRoute = routes.get(hostPlugin.STATE_ENDPOINT)
    let notifyCount = 0
    const controller = createMeshController({
      fetchImpl: (url, opts) => stateRoute.fetch(new Request(`http://localhost/${url}`, opts)),
    })
    controller.subscribe(() => { notifyCount += 1 })

    await controller.syncFromHost()
    assert.equal(notifyCount, 1)
    await controller.syncFromHost()
    assert.equal(notifyCount, 1, 'Unchanged ?rev= sync must not re-notify UI subscribers')

    // Mutate state on host -> next sync picks up new revision
    const codeRoute = routes.get(hostPlugin.PAIR_CODE_ENDPOINT)
    await codeRoute.fetch(new Request('http://localhost/api/sandbox-mesh.pair-code', { method: 'POST' }))
    await controller.syncFromHost()
    assert.equal(notifyCount, 2)
    assert.ok(controller.getSnapshot().state.activeInvite)

    controller.dispose()
    await ctx.fiber.dispose()
  }

  // ---------------------------------------------------------------------------
  // 9. Best-Practice Mutual Unpair, Scope Security, Group Key Rotation & Re-Pair
  // ---------------------------------------------------------------------------
  {
    const { svc: uAlice, dir: uAliceDir } = makeNode('ualice', {
      dshHome: join(tempDir, 'node-ualice', '.dsh'),
    })
    const { svc: uBob, dir: uBobDir } = makeNode('ubob', {
      dshHome: join(tempDir, 'node-ubob', '.dsh'),
    })
    const { svc: uCharlie } = makeNode('ucharlie')

    const invB = uAlice.store.createPairCode()
    assert.equal((await uBob.claimPairInvite(invB.shortCode)).ok, true)
    const invC = uAlice.store.createPairCode()
    assert.equal((await uCharlie.claimPairInvite(invC.shortCode)).ok, true)
    const invBC = uBob.store.createPairCode()
    assert.equal((await uCharlie.claimPairInvite(invBC.shortCode)).ok, true)

    // Create a group owned by uAlice with [uBob, uCharlie]
    const grp = await uAlice.createGroup({
      name: 'Owned Trust Group',
      memberSlugs: ['ubob', 'ucharlie'],
      moderatorSlug: 'ubob',
    })
    assert.equal(grp.ok, true)
    const grpId = grp.room.id
    const preUnpairGroupSecret = uAlice.store.getRoom(grpId).groupSecret

    // Group-scoped /mesh/unpair MUST be rejected (403) so 3rd parties cannot spoof unpair
    const spoofUnpairBody = JSON.stringify({ slug: 'ualice' })
    const spoofUnpairRes = await uBob.handleIncomingMeshHttp(
      'POST',
      '/mesh/unpair',
      buildSignedHeaders({
        method: 'POST',
        path: '/mesh/unpair',
        body: spoofUnpairBody,
        secret: preUnpairGroupSecret,
        fromSlug: 'ualice',
        groupId: grpId,
      }),
      spoofUnpairBody,
    )
    assert.equal(spoofUnpairRes.status, 403, 'groupSecret must never authorize /mesh/unpair')
    assert.ok(uBob.store.getPeer('ualice'), 'Peer must remain paired after rejected spoofed unpair')

    // Track skill catalog invalidations on both sides
    let aliceInvalidations = 0
    let bobInvalidations = 0
    uAlice.setHasRuntimeSkillProvider(true)
    uBob.setHasRuntimeSkillProvider(true)
    uAlice.setCatalogChangeHandler(() => { aliceInvalidations += 1 })
    uBob.setCatalogChangeHandler(() => { bobInvalidations += 1 })

    // uAlice unpairs uBob (online) -> notifies uBob, rotates group key on uAlice & uCharlie, updates catalogs
    const unpairRes = await uAlice.unpairPeer({ slug: 'ubob' })
    assert.equal(unpairRes.ok, true)
    assert.equal(unpairRes.remoteNotified, true)
    assert.ok(unpairRes.updatedGroups.includes(grpId))
    assert.ok(aliceInvalidations >= 1)
    assert.ok(bobInvalidations >= 1)

    // Initiator uAlice wiped uBob & pair room, removed uBob from owned group, rotated groupSecret & reset moderator
    assert.equal(uAlice.store.getPeer('ubob'), null)
    assert.equal(uAlice.store.getRoom('pair:ualice:ubob'), null)
    const aliceGroupAfter = uAlice.store.getRoom(grpId)
    assert.equal(aliceGroupAfter.members.some((m) => m.slug === 'ubob'), false)
    assert.equal(aliceGroupAfter.moderatorSlug, 'ualice')
    assert.notEqual(aliceGroupAfter.groupSecret, preUnpairGroupSecret)
    assert.equal(uCharlie.store.getRoom(grpId).groupSecret, aliceGroupAfter.groupSecret)

    // Receiver uBob immediately revoked uAlice's sharedSecret, kept disconnected pair room with notice, and disconnected uAlice's group
    assert.equal(uBob.store.getPeer('ualice'), null)
    const bobPairRoom = uBob.store.getRoom('pair:ualice:ubob')
    assert.ok(bobPairRoom)
    assert.equal(bobPairRoom.unpaired, true)
    assert.equal(bobPairRoom.unpairedBy, 'ualice')
    assert.equal(uBob.store.getRoom(grpId).unpaired, true)
    assert.equal(uBob.store.getRoom(grpId).groupSecret, '')

    // Sending into disconnected room fails cleanly (409) instead of hanging/queuing
    const sendInUnpaired = await uBob.sendMessage({
      roomId: 'pair:ualice:ubob',
      text: 'Hello after unpair',
      actor: 'human',
    })
    assert.equal(sendInUnpaired.ok, false)
    assert.equal(sendInUnpaired.status, 409)

    // uBob's old pairwise & group credentials can no longer hit uAlice
    const postUnpairPing = await uAlice.handleIncomingMeshHttp(
      'POST',
      '/mesh/ping',
      buildSignedHeaders({
        method: 'POST',
        path: '/mesh/ping',
        body: '{}',
        secret: preUnpairGroupSecret,
        fromSlug: 'ubob',
        groupId: grpId,
      }),
      '{}',
    )
    assert.equal(postUnpairPing.status, 401)

    // Offline unpair resilience: uBob unpairs uCharlie while uCharlie is offline -> local revocation succeeds cleanly
    downPeers.add('ucharlie')
    const offlineUnpair = await uBob.unpairPeer({ slug: 'ucharlie' })
    assert.equal(offlineUnpair.ok, true)
    assert.equal(offlineUnpair.remoteNotified, false)
    assert.equal(uBob.store.getPeer('ucharlie'), null)
    downPeers.delete('ucharlie')

    // When uCharlie comes back online and pings uBob, uCharlie detects 401 -> status 'unpaired-by-peer'
    const detectRes = await uCharlie.pingPeer({ slug: 'ubob' })
    assert.equal(detectRes.ok, true)
    assert.equal(detectRes.reachable, false)
    assert.equal(detectRes.status, 'unpaired-by-peer')
    assert.equal(uCharlie.store.getPeer('ubob').status, 'unpaired-by-peer')

    // Re-pairing uAlice <-> uBob restores pair room, clears unpaired flag, and isolates new threadId
    const oldPairThread = bobPairRoom.activeThreadId
    const reInv = uAlice.store.createPairCode()
    const rePair = await uBob.claimPairInvite(reInv.shortCode)
    assert.equal(rePair.ok, true)
    assert.equal(uBob.store.getRoom('pair:ualice:ubob').unpaired, false)
    assert.notEqual(uBob.store.getRoom('pair:ualice:ubob').activeThreadId, oldPairThread)

    // Also verify removeRoom cleans up an unpaired room cleanly
    const cleanUnpair = await uCharlie.removeRoom({ roomId: 'pair:ubob:ucharlie' })
    assert.equal(cleanUnpair.ok, true)
    assert.equal(uCharlie.store.getRoom('pair:ubob:ucharlie'), null)
  }

  console.log('security-and-reliability ok')
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
