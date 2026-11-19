import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { importExternal } from './deps.mjs'
import * as hostPlugin from '../index.js'
import { buildSignedHeaders } from '../src/host/crypto.js'

const { Context } = await importExternal('@deepseek-ai/cordis')

const tempDir = mkdtempSync(join(tmpdir(), 'dsh-sandbox-mesh-'))

try {
  // -------------------------------------------------------------------------
  // Part 1: Cordis Host plugin route registration & clean disposal
  // -------------------------------------------------------------------------
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

    const storagePath = join(tempDir, 'plugin-host.json')
    const homeDir = join(tempDir, 'home-host')
    const dshHome = join(homeDir, '.dsh')
    const fiber = ctx.plugin(hostPlugin, {
      storagePath,
      homeDir,
      dshHome,
      slug: 'alice',
      ownerName: 'Alice Zhang',
      ownerEmail: 'alice@example.com',
      publicOrigin: 'https://dock.example.com',
      disableServer: true,
    })
    await fiber.inertia
    await new Promise((r) => setTimeout(r, 20))

    for (const ep of [
      hostPlugin.STATE_ENDPOINT,
      hostPlugin.PROFILE_ENDPOINT,
      hostPlugin.FILES_ENDPOINT,
      hostPlugin.PAIR_CODE_ENDPOINT,
      hostPlugin.PAIR_CLAIM_ENDPOINT,
      hostPlugin.GROUP_CREATE_ENDPOINT,
      hostPlugin.GROUP_INVITE_ENDPOINT,
      hostPlugin.GROUP_MODERATE_ENDPOINT,
      hostPlugin.GROUP_REMOVE_ENDPOINT,
      hostPlugin.GROUP_LEAVE_ENDPOINT,
      hostPlugin.NEW_TOPIC_ENDPOINT,
      hostPlugin.SEND_ENDPOINT,
      hostPlugin.SEND_FILE_ENDPOINT,
      hostPlugin.MARK_READ_ENDPOINT,
      hostPlugin.PEER_REMOVE_ENDPOINT,
      hostPlugin.PEER_PING_ENDPOINT,
      hostPlugin.ROOM_REMOVE_ENDPOINT,
    ]) {
      assert.ok(routes.has(ep), `Expected route ${ep} to be registered`)
    }

    // Verify Agent CLI & Skill were provisioned automatically (including unpair, ping, group-leave)
    const cliText = readFileSync(join(homeDir, '.local', 'bin', 'sandbox-peer'), 'utf8')
    assert.ok(cliText.includes('unpair <slug>'))
    assert.ok(cliText.includes('ping <slug>'))
    assert.ok(cliText.includes('group-leave <roomId>'))
    assert.ok(existsSync(join(dshHome, 'skills', 'sandbox-peer', 'SKILL.md')))

    // Verify workspace file search endpoint for `#` autocomplete
    writeFileSync(join(homeDir, 'schema.json'), '{"openapi":"3.1.0"}\n', 'utf8')
    const filesRes = await routes.get(hostPlugin.FILES_ENDPOINT).fetch(
      new Request('http://localhost/api/sandbox-mesh.files?q=schema'),
    )
    assert.equal(filesRes.status, 200)
    const filesJson = await filesRes.json()
    assert.equal(filesJson.ok, true)
    assert.ok(filesJson.files.some((f) => f.relativePath === 'schema.json'))

    // Verify STATE_ENDPOINT and PAIR_CODE_ENDPOINT
    const stateRes = await routes.get(hostPlugin.STATE_ENDPOINT).fetch(
      new Request('http://localhost/api/sandbox-mesh.state'),
    )
    assert.equal(stateRes.status, 200)
    const stateJson = await stateRes.json()
    assert.equal(stateJson.ok, true)
    assert.equal(stateJson.state.self.slug, 'alice')
    assert.equal(stateJson.state.self.endpointUrl, 'https://dock.example.com/s/alice/p/4090')

    const codeRes = await routes.get(hostPlugin.PAIR_CODE_ENDPOINT).fetch(
      new Request('http://localhost/api/sandbox-mesh.pair-code', { method: 'POST' }),
    )
    const codeJson = await codeRes.json()
    assert.equal(codeJson.ok, true)
    assert.ok(codeJson.invite.shortCode.startsWith('alice.'))
    assert.ok(codeJson.invite.inviteUri.startsWith('https://dock.example.com/s/alice/p/4090#pair=alice.'))

    await ctx.fiber.dispose()
    assert.equal(routes.size, 0, 'All routes must unregister on plugin dispose')
  }

  // -------------------------------------------------------------------------
  // Part 2: Live 3-Sandbox Mesh over simulated Traefik gateway
  // -------------------------------------------------------------------------
  {
    const nodes = new Map()

    const traefikFetch = async (url, init = {}) => {
      const parsed = new URL(url)
      const match = parsed.pathname.match(/^\/s\/([a-z0-9_-]+)\/p\/\d+(\/.*)$/i)
      assert.ok(match, `Expected Traefik subpath URL, got: ${url}`)
      const targetSlug = match[1].toLowerCase()
      const subPath = match[2]
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
      return new Response(JSON.stringify(result.body), {
        status: result.status,
        headers: { 'content-type': 'application/json' },
      })
    }

    const createSandboxNode = (slug, ownerName) => {
      const nodeDir = join(tempDir, `node-${slug}`)
      const svc = hostPlugin.createMeshService({
        config: {
          storagePath: join(nodeDir, 'mesh.json'),
          homeDir: nodeDir,
          inboxDir: join(nodeDir, 'mesh-inbox'),
          slug,
          ownerName,
          ownerEmail: `${slug}@example.com`,
          publicOrigin: 'https://mesh.example.com',
          port: 4090,
          maxAgentHops: 3,
        },
        fetchImpl: traefikFetch,
      })
      nodes.set(slug, svc)
      return { svc, nodeDir }
    }

    const { svc: alice, nodeDir: aliceDir } = createSandboxNode('alice', 'Alice')
    const { svc: bob, nodeDir: bobDir } = createSandboxNode('bob', 'Bob')
    const { svc: charlie, nodeDir: charlieDir } = createSandboxNode('charlie', 'Charlie')

    // 1. Set node specialty profiles (like Remote Subagents) & Pair Alice <-> Bob
    await alice.updateProfile({
      role: 'Frontend UI Specialist',
      description: 'Owns React 19 UI components and client state',
    })
    await bob.updateProfile({
      role: 'Backend & DB Specialist',
      description: 'Owns FastAPI endpoints, SQLite schema, and auth',
    })

    const inviteForBob = alice.store.createPairCode()
    const claimBob = await bob.claimPairInvite(inviteForBob.inviteUri)
    assert.equal(claimBob.ok, true)
    assert.equal(claimBob.peer.slug, 'alice')
    assert.equal(claimBob.peer.role, 'Frontend UI Specialist')
    assert.equal(alice.store.getPeer('bob').role, 'Backend & DB Specialist')
    assert.equal(claimBob.room.id, 'pair:alice:bob')

    // Updating Bob's profile after pairing automatically syncs to Alice over /mesh/profile-sync
    await bob.updateProfile({
      role: 'Core Backend Architect',
      description: 'Owns FastAPI, Traefik gateway, and SQLite migrations',
    })
    assert.equal(alice.store.getPeer('bob').role, 'Core Backend Architect')

    // Reusing a consumed one-time pair code must fail
    const reuseAttempt = await charlie.claimPairInvite(inviteForBob.shortCode)
    assert.equal(reuseAttempt.ok, false)

    // 2. Pair Alice <-> Charlie using short code (same gateway)
    const inviteForCharlie = alice.store.createPairCode()
    const claimCharlie = await charlie.claimPairInvite(inviteForCharlie.shortCode)
    assert.equal(claimCharlie.ok, true)
    assert.equal(claimCharlie.peer.slug, 'alice')
    assert.equal(claimCharlie.room.id, 'pair:alice:charlie')

    // 3. Forged / unsigned request to /mesh/message is rejected with 401
    {
      const unsignedRes = await bob.handleIncomingMeshHttp(
        'POST',
        '/mesh/message',
        { 'content-type': 'application/json' },
        JSON.stringify({ message: { id: 'forged', roomId: 'pair:alice:bob', text: 'hack' } }),
      )
      assert.equal(unsignedRes.status, 401)

      const badHmacHeaders = buildSignedHeaders({
        method: 'POST',
        path: '/mesh/message',
        body: '{}',
        secret: 'wrong-secret',
        fromSlug: 'alice',
      })
      const badHmacRes = await bob.handleIncomingMeshHttp('POST', '/mesh/message', badHmacHeaders, '{}')
      assert.equal(badHmacRes.status, 401)
    }

    // 4. Replay attack (reusing identical nonce + signature) is rejected with 401
    {
      const sharedSecret = alice.store.getPeer('bob').sharedSecret
      const pingHeaders = buildSignedHeaders({
        method: 'POST',
        path: '/mesh/ping',
        body: '{}',
        secret: sharedSecret,
        fromSlug: 'alice',
        nonce: 'unique-nonce-123456',
      })
      const firstPing = await bob.handleIncomingMeshHttp('POST', '/mesh/ping', pingHeaders, '{}')
      assert.equal(firstPing.status, 200)

      const replayedPing = await bob.handleIncomingMeshHttp('POST', '/mesh/ping', pingHeaders, '{}')
      assert.equal(replayedPing.status, 401)
      assert.match(replayedPing.body.error, /Replayed/i)
    }

    // 5. 1-on-1 Chat + @bob-agent Wake + Hop Anti-Loop Guard
    {
      const send1 = await alice.sendMessage({
        roomId: 'pair:alice:bob',
        text: 'Hey @bob-agent please inspect the build error',
        actor: 'human',
      })
      assert.equal(send1.ok, true)
      assert.equal(send1.message.kind, 'task', '@bob-agent mention should auto-promote kind to task')
      assert.deepEqual(send1.delivery.deliveredTo, ['bob'])

      const bobInbox = bob.store.getAgentInbox({ ack: true })
      assert.equal(bobInbox.length, 1)
      assert.equal(bobInbox[0].text, 'Hey @bob-agent please inspect the build error')
      assert.equal(bob.store.getAgentInbox({ ack: false }).length, 0)

      const agentReplyAtCap = await bob.sendMessage({
        roomId: 'pair:alice:bob',
        text: '@alice-agent Here is my 3rd hop response',
        kind: 'task',
        actor: 'agent',
        hop: 3,
      })
      assert.equal(agentReplyAtCap.ok, true)
      const aliceMsgs = alice.store.getSnapshot().messages['pair:alice:bob']
      const lastAliceMsg = aliceMsgs[aliceMsgs.length - 1]
      assert.equal(lastAliceMsg.hop, 3)
      assert.equal(lastAliceMsg.wakeAgent, false)

      const overHop = await alice.sendMessage({
        roomId: 'pair:alice:bob',
        text: '@bob-agent loop forever',
        kind: 'task',
        actor: 'agent',
        hop: 4,
      })
      assert.equal(overHop.ok, false)
      assert.equal(overHop.status, 429)
    }

    // 6. Decentralized Multi-Sandbox Group & Unified `#file` inline transfer
    {
      const grpRes = await alice.createGroup({
        name: 'Core Platform Group',
        memberSlugs: ['bob', 'charlie'],
      })
      assert.equal(grpRes.ok, true)
      const groupId = grpRes.room.id
      assert.deepEqual(grpRes.sync.deliveredTo.sort(), ['bob', 'charlie'])

      const charlieGroupMsg = await charlie.sendMessage({
        roomId: groupId,
        text: 'Hello everyone from Charlie Agent!',
        actor: 'agent',
        hop: 1,
      })
      assert.equal(charlieGroupMsg.ok, true)
      assert.deepEqual(charlieGroupMsg.delivery.deliveredTo.sort(), ['alice', 'bob'])

      // 7. Unified `#api-spec.md` syntax inside sendMessage transfers the file automatically!
      const sampleFile = join(aliceDir, 'api-spec.md')
      writeFileSync(sampleFile, '# OpenAPI Spec v1\nEndpoint: /s/<slug>/p/4090\n', 'utf8')
      const unifiedSend = await alice.sendMessage({
        roomId: groupId,
        text: 'Please review #api-spec.md @bob-agent',
        actor: 'human',
      })
      assert.equal(unifiedSend.ok, true)

      for (const peerDir of [bobDir, charlieDir]) {
        const receivedFile = join(peerDir, 'mesh-inbox', groupId, 'api-spec.md')
        assert.ok(existsSync(receivedFile), `Expected shared file at ${receivedFile}`)
        assert.equal(readFileSync(receivedFile, 'utf8'), '# OpenAPI Spec v1\nEndpoint: /s/<slug>/p/4090\n')
      }
    }

    // 8. Local CLI endpoint security
    {
      const blockedProxy = await alice.handleIncomingMeshHttp(
        'POST',
        '/local/cli',
        {
          authorization: `Bearer ${alice.localToken}`,
          'x-forwarded-prefix': '/s/alice/p/4090',
        },
        JSON.stringify({ action: 'status' }),
      )
      assert.equal(blockedProxy.status, 403)

      const validCli = await alice.handleIncomingMeshHttp(
        'POST',
        '/local/cli',
        { authorization: `Bearer ${alice.localToken}` },
        JSON.stringify({ action: 'status' }),
      )
      assert.equal(validCli.status, 200)
      assert.equal(validCli.body.ok, true)
      assert.equal(validCli.body.self.slug, 'alice')
    }

    // 9. Native Harness Runtime Bridge (ctx.tools + sessionController + agent.followup -> auto-reply back to room)
    {
      const bobCtx = new Context()
      const registeredTools = []
      const createdSessions = []
      const followupMessages = []
      const sessionEvents = []

      bobCtx.provide('tools', {
        register(toolDef) {
          registeredTools.push(toolDef)
          return () => {}
        },
      })
      bobCtx.provide('agents', {
        withoutInitiator: (fn) => fn(),
      })
      bobCtx.provide('sessions', {
        flush: async () => true,
      })

      const mockBobAgent = {
        id: 'session-mesh-bob',
        session: {
          id: 'session-mesh-bob',
          snapshotEvents: () => [...sessionEvents],
        },
        followup(userMsg) {
          followupMessages.push(userMsg)
          // Simulate Bob calling mesh_share_file mid-turn; this file message must NOT suppress Bob's final text reply!
          const midTurnFile = join(bobDir, 'midturn-report.txt')
          writeFileSync(midTurnFile, 'ok\n', 'utf8')
          void bob.sendFile({
            roomId: 'pair:alice:bob',
            filePath: midTurnFile,
            text: 'attachment',
            actor: 'agent',
          })
          // Simulate Bob's Harness LLM producing an assistant reply during the turn
          sessionEvents.push({
            seq: sessionEvents.length + 1,
            type: 'assistant/message',
            data: {
              message: {
                content: [{ type: 'text', text: 'Auto-reply from Bob native Harness Agent: task completed!' }],
              },
            },
          })
          sessionEvents.push({
            seq: sessionEvents.length + 1,
            type: 'turn/end',
            data: { turn: 1, reason: { kind: 'completed' } },
          })
        },
        whenIdle: async () => {},
      }

      bobCtx.provide('sessionController', {
        async create(spec) {
          createdSessions.push(spec)
        },
        async resolveAgent() {
          if (createdSessions.length === 0) {
            return { error: new Error('not created yet') }
          }
          return { agent: mockBobAgent }
        },
      })

      const { wireHarnessRuntime } = await import('../src/host/harness-bridge.js')
      let registeredSkillProvider = null
      let skillInvalidations = 0
      bobCtx.provide('skills', {
        registerProvider(provider, onControl) {
          registeredSkillProvider = provider
          onControl?.({
            invalidate() {
              skillInvalidations += 1
            },
          })
          return () => { registeredSkillProvider = null }
        },
      })
      wireHarnessRuntime(bobCtx, bob)
      await new Promise((r) => setTimeout(r, 30))

      // Verify dynamic Skill Provider advertises connected peers & roles in description, and full specialty in get()
      assert.ok(registeredSkillProvider, 'Expected skills.registerProvider to be registered')
      const skillCandidates = await registeredSkillProvider.list({})
      assert.equal(skillCandidates.length, 1)
      assert.equal(skillCandidates[0].name, 'sandbox-peer')
      assert.ok(skillCandidates[0].description.includes('@alice (Frontend UI Specialist)'))

      const fullSkillDef = await registeredSkillProvider.get(skillCandidates[0], {})
      assert.ok(fullSkillDef.content.includes('Owns React 19 UI components and client state'))

      // Updating profile invalidates skill catalog so Agent always discovers fresh peer specialties
      await bob.updateProfile({ role: 'Updated Backend Lead', description: 'Updated desc' })
      assert.ok(skillInvalidations >= 1)

      // Verify native Harness tools mesh_list_peers, mesh_ask_peer, mesh_discuss_group, mesh_send_message & mesh_share_file were registered
      assert.ok(registeredTools.some((t) => t.name === 'mesh_list_peers'))
      assert.ok(registeredTools.some((t) => t.name === 'mesh_ask_peer'))
      assert.ok(registeredTools.some((t) => t.name === 'mesh_discuss_group'))
      assert.ok(registeredTools.some((t) => t.name === 'mesh_send_message'))
      assert.ok(registeredTools.some((t) => t.name === 'mesh_share_file'))

      // Now Alice sends "@bob Please run healthcheck" (clean @<slug>, no -agent suffix needed!) -> Bob's Harness Agent wakes up, runs turn, and replies back to Alice!
      await alice.sendMessage({
        roomId: 'pair:alice:bob',
        text: '@bob Please run healthcheck',
        actor: 'human',
      })
      await new Promise((r) => setTimeout(r, 60))

      assert.equal(createdSessions.length, 1, 'Expected Bob sessionController to create a Mesh session')
      assert.equal(followupMessages.length, 1, 'Expected Bob agent.followup() to be called with incoming mesh prompt')

      const aliceRoomMsgs = alice.store.getSnapshot().messages['pair:alice:bob']
      const bobAutoReply = aliceRoomMsgs.find(
        (m) => m.sender?.slug === 'bob' && m.sender?.actor === 'agent' && m.text.includes('Auto-reply from Bob native Harness Agent'),
      )
      assert.ok(bobAutoReply, 'Expected Bob Harness Agent assistant reply to be delivered back to Alice room')
      assert.equal(bobAutoReply.hop, 1)

      await bobCtx.fiber.dispose()
    }

    // 10. LLM-Controlled Group Moderator + Per-Container Topic Context Isolation
    {
      const wakeLog = []
      alice.setAgentWakeHandler(({ room, message }) => {
        wakeLog.push({ node: 'alice', wakeReason: message.wakeReason, threadId: message.threadId, text: message.text })
      })
      bob.setAgentWakeHandler(({ room, message }) => {
        wakeLog.push({ node: 'bob', wakeReason: message.wakeReason, threadId: message.threadId, text: message.text })
        void bob.sendMessage({
          roomId: room.id,
          threadId: message.threadId,
          phase: 'turn',
          mentionsOverride: [],
          text: 'Bob Agent: SQLite migrations & FastAPI health endpoint are clean.',
          actor: 'agent',
          hop: 1,
        })
      })
      charlie.setAgentWakeHandler(({ room, message }) => {
        wakeLog.push({ node: 'charlie', wakeReason: message.wakeReason, threadId: message.threadId, text: message.text })
      })

      const grpRes = await alice.createGroup({
        name: 'Team Sync',
        memberSlugs: ['bob', 'charlie'],
        moderatorSlug: 'alice',
      })
      assert.equal(grpRes.ok, true)
      assert.equal(grpRes.room.moderatorSlug, 'alice')
      const initialThread = grpRes.room.activeThreadId
      assert.ok(initialThread.startsWith('thr_'))

      // Un-targeted human message in group wakes ONLY Moderator (alice), never bob/charlie!
      wakeLog.length = 0
      await bob.sendMessage({
        roomId: grpRes.room.id,
        text: 'Please investigate API 500 error',
        actor: 'human',
      })
      await new Promise((r) => setTimeout(r, 30))
      assert.deepEqual(
        wakeLog.map((w) => ({ node: w.node, wakeReason: w.wakeReason, threadId: w.threadId })),
        [{ node: 'alice', wakeReason: 'group-moderator-duty', threadId: initialThread }],
        'Untargeted group message must wake ONLY the Moderator LLM',
      )

      // Moderator LLM selectively calls ONLY @bob inside the group thread; @charlie stays silent
      wakeLog.length = 0
      await alice.sendMessage({
        roomId: grpRes.room.id,
        threadId: initialThread,
        phase: 'turn',
        mentionsOverride: ['bob'],
        text: '@bob Check backend logs for the 500 error',
        kind: 'task',
        actor: 'agent',
        hop: 1,
      })
      await new Promise((r) => setTimeout(r, 40))
      assert.deepEqual(
        wakeLog.map((w) => w.node),
        ['bob'],
        'Targeted call from Moderator must wake ONLY the called member (@bob), not @charlie or @alice',
      )

      // Start a New Topic -> rotates activeThreadId across peers & completely isolates prompt + Harness Session context!
      const rotRes = await alice.startNewTopic({ roomId: grpRes.room.id })
      assert.equal(rotRes.ok, true)
      assert.equal(rotRes.alreadyFresh, false)
      assert.notEqual(rotRes.threadId, initialThread)
      assert.equal(bob.store.getRoom(grpRes.room.id).activeThreadId, rotRes.threadId)

      // Calling startNewTopic again immediately while active thread has 0 new messages must be a no-op!
      const dupRotRes = await alice.startNewTopic({ roomId: grpRes.room.id })
      assert.equal(dupRotRes.ok, true)
      assert.equal(dupRotRes.alreadyFresh, true)
      assert.equal(dupRotRes.threadId, rotRes.threadId)

      const { buildAgentWakePrompt } = await import('../src/host/harness-bridge.js')
      const freshTopicPrompt = buildAgentWakePrompt({
        self: bob.store.getSelf(),
        room: bob.store.getRoom(grpRes.room.id),
        message: {
          id: 'msg_probe_new_topic',
          threadId: rotRes.threadId,
          sender: { slug: 'alice', ownerName: 'Alice', actor: 'agent' },
          text: 'Fresh topic question',
        },
        recentMessages: bob.store.getSnapshot().messages[grpRes.room.id] || [],
      })
      assert.ok(
        !freshTopicPrompt.includes('Please investigate API 500 error'),
        'Old topic messages must NOT leak into new topic prompt context',
      )

      // Wire native tools on alice & test LLM Moderator dynamic tool flow (mesh_discuss_group + mesh_ask_peer)
      const aliceCtx = new Context()
      const aliceTools = new Map()
      aliceCtx.provide('tools', {
        register(toolDef) {
          aliceTools.set(toolDef.name, toolDef)
          return () => { aliceTools.delete(toolDef.name) }
        },
      })
      const { wireHarnessRuntime } = await import('../src/host/harness-bridge.js')
      wireHarnessRuntime(aliceCtx, alice)
      await new Promise((r) => setTimeout(r, 30))

      const discussTool = aliceTools.get('mesh_discuss_group')
      const askTool = aliceTools.get('mesh_ask_peer')
      assert.ok(discussTool && askTool)

      const grpPrep = await discussTool.execute({
        roomId: grpRes.room.id,
        topic: 'Verify DB schema cleanly',
        threadId: rotRes.threadId,
      })
      assert.equal(grpPrep.ok, true)
      assert.equal(grpPrep.isLocalModerator, true)
      assert.equal(grpPrep.moderatorSlug, 'alice')
      assert.ok(grpPrep.members.some((m) => m.slug === 'bob'))

      wakeLog.length = 0
      const bobReply = await askTool.execute({
        roomId: grpRes.room.id,
        threadId: rotRes.threadId,
        targetSlug: 'bob',
        question: 'Please confirm DB migrations (even if mentioning @charlie in prose, do NOT wake charlie)',
        timeoutSeconds: 5,
      })
      assert.equal(bobReply.ok, true)
      assert.equal(bobReply.repliedBy, 'bob')
      assert.equal(bobReply.threadId, rotRes.threadId)
      assert.deepEqual(wakeLog.map((w) => w.node), ['bob'])

      // Live preparing/responding indicator propagation & anti-spoof check
      alice.setAgentActivity({
        roomId: grpRes.room.id,
        slug: 'alice',
        ownerName: 'Alice',
        stage: 'coordinating',
        isModerator: true,
        broadcast: true,
      })
      assert.equal(alice.getStateSnapshot().activeStatuses[grpRes.room.id]?.[0]?.stage, 'coordinating')
      await new Promise((r) => setTimeout(r, 40))
      assert.equal(
        bob.getStateSnapshot().activeStatuses[grpRes.room.id]?.[0]?.slug,
        'alice',
        'Remote peer should receive live Moderator activity over HMAC /mesh/status',
      )
      alice.clearAgentActivity({ roomId: grpRes.room.id, slug: 'alice', broadcast: true })
      await new Promise((r) => setTimeout(r, 40))
      assert.equal(alice.getStateSnapshot().activeStatuses[grpRes.room.id], undefined)
      assert.equal(bob.getStateSnapshot().activeStatuses[grpRes.room.id], undefined)

      // Spoof attempt on /mesh/status (claiming wrong slug) must be rejected with 403
      const { buildSignedHeaders } = await import('../src/host/crypto.js')
      const spoofPayload = JSON.stringify({ roomId: grpRes.room.id, slug: 'charlie', stage: 'answering' })
      const spoofRes = await alice.handleIncomingMeshHttp(
        'POST',
        '/mesh/status',
        buildSignedHeaders({
          method: 'POST',
          path: '/mesh/status',
          body: spoofPayload,
          secret: alice.store.getRoom(grpRes.room.id).groupSecret,
          fromSlug: 'bob',
          groupId: grpRes.room.id,
        }),
        spoofPayload,
      )
      assert.equal(spoofRes.status, 403)

      await aliceCtx.fiber.dispose()
    }

    // 11. End-to-End Group Multi-Sandbox Configuration Dispatch (Moderator LLM decides & delegates to all members)
    {
      const { wireHarnessRuntime } = await import('../src/host/harness-bridge.js')
      const nodeFollowups = { alice: [], bob: [], charlie: [] }
      const nodeTools = {}
      const wakeCounts = { alice: 0, bob: 0, charlie: 0 }

      async function mountMockNodeRuntime(slug, nodeSvc, onRun) {
        const nodeCtx = new Context()
        const toolsMap = new Map()
        const events = []
        let created = false

        nodeCtx.provide('tools', {
          register(toolDef) {
            toolsMap.set(toolDef.name, toolDef)
            return () => { toolsMap.delete(toolDef.name) }
          },
        })
        nodeCtx.provide('agents', { withoutInitiator: (fn) => fn() })
        nodeCtx.provide('sessions', { flush: async () => true })
        nodeCtx.provide('sessionController', {
          async create() { created = true },
          async resolveAgent() {
            if (!created) return { error: new Error('not created') }
            return {
              agent: {
                id: `session-mesh-${slug}`,
                session: {
                  id: `session-mesh-${slug}`,
                  snapshotEvents: () => [...events],
                },
                followup(userMsg) {
                  wakeCounts[slug] += 1
                  nodeFollowups[slug].push(userMsg)
                  const promptText = userMsg?.content?.[0]?.text || ''
                  const runPromise = Promise.resolve(onRun({ promptText, toolsMap, events })).then((replyText) => {
                    events.push({
                      seq: events.length + 1,
                      type: 'assistant/message',
                      data: { message: { content: [{ type: 'text', text: replyText }] } },
                    })
                    events.push({
                      seq: events.length + 1,
                      type: 'turn/end',
                      data: { turn: events.length, reason: { kind: 'completed' } },
                    })
                  })
                  this._pending = runPromise
                },
                async whenIdle() {
                  await this._pending
                },
              },
            }
          },
        })

        wireHarnessRuntime(nodeCtx, nodeSvc)
        await new Promise((r) => setTimeout(r, 30))
        nodeTools[slug] = toolsMap
        return nodeCtx
      }

      const grpRoomId = alice.store.getSnapshot().rooms.find((r) => r.type === 'group')?.id
      assert.ok(grpRoomId, 'Expected created group room for dispatch test')
      const aliceModCtx = await mountMockNodeRuntime('alice', alice, async ({ promptText, toolsMap }) => {
        assert.ok(promptText.includes('MODERATOR ROLE'))
        assert.ok(promptText.includes('needs actions/config/checks executed inside another sandbox container'))
        // At start of Moderator duty, neither bob nor charlie has been woken yet
        assert.equal(wakeCounts.bob, 0)
        assert.equal(wakeCounts.charlie, 0)

        // Moderator executes configuration locally on alice
        writeFileSync(join(aliceDir, '.sandbox-mesh-probe.conf'), 'ROLE=moderator\nSANDBOX=alice\n', 'utf8')

        // Moderator autonomously chooses to call bob and charlie sequentially via mesh_ask_peer
        const askTool = toolsMap.get('mesh_ask_peer')
        const tid = alice.store.getRoom(grpRoomId).activeThreadId
        const bobRes = await askTool.execute({
          roomId: grpRoomId,
          threadId: tid,
          targetSlug: 'bob',
          question: 'Configure .sandbox-mesh-probe.conf in your sandbox with SANDBOX=bob and report verification.',
          timeoutSeconds: 5,
        })
        assert.equal(bobRes.ok, true)
        assert.equal(bobRes.repliedBy, 'bob')
        assert.ok(!String(bobRes.reply || '').includes('Agent Error'), `Unexpected bob error: ${bobRes.reply}`)

        const charlieRes = await askTool.execute({
          roomId: grpRoomId,
          threadId: tid,
          targetSlug: 'charlie',
          question: 'Configure .sandbox-mesh-probe.conf in your sandbox with SANDBOX=charlie and report verification.',
          timeoutSeconds: 5,
        })
        assert.equal(charlieRes.ok, true)
        assert.equal(charlieRes.repliedBy, 'charlie')
        assert.ok(!String(charlieRes.reply || '').includes('Agent Error'), `Unexpected charlie error: ${charlieRes.reply}`)

        return `All 3 sandboxes configured: alice (OK), bob (${bobRes.reply}), charlie (${charlieRes.reply}).`
      })

      const bobPeerCtx = await mountMockNodeRuntime('bob', bob, async ({ promptText }) => {
        assert.ok(promptText.includes('CALLED BY GROUP MODERATOR:'))
        assert.equal(alice.getStateSnapshot().activeStatuses[grpRoomId]?.some((s) => s.stage === 'waiting_peer' && s.detail === 'bob'), true)
        writeFileSync(join(bobDir, '.sandbox-mesh-probe.conf'), 'ROLE=member\nSANDBOX=bob\n', 'utf8')
        return 'bob configured .sandbox-mesh-probe.conf cleanly'
      })

      const charliePeerCtx = await mountMockNodeRuntime('charlie', charlie, async ({ promptText }) => {
        assert.ok(promptText.includes('CALLED BY GROUP MODERATOR:'))
        writeFileSync(join(charlieDir, '.sandbox-mesh-probe.conf'), 'ROLE=member\nSANDBOX=charlie\n', 'utf8')
        return 'charlie configured .sandbox-mesh-probe.conf cleanly'
      })

      const cfgTopic = await alice.startNewTopic({ roomId: grpRoomId })
      assert.equal(cfgTopic.ok, true)

      await alice.sendMessage({
        roomId: grpRoomId,
        text: 'Please configure .sandbox-mesh-probe.conf on every sandbox (including moderator) and verify',
        actor: 'human',
      })

      // Wait until Moderator finishes orchestrating both peers and posts summary
      const waitEnd = Date.now() + 3000
      let finalSummary = null
      while (Date.now() < waitEnd) {
        const msgs = charlie.store.getSnapshot().messages[grpRoomId] || []
        finalSummary = msgs.find(
          (m) => m.threadId === cfgTopic.threadId && m.sender?.slug === 'alice' && m.sender?.actor === 'agent' && m.phase !== 'turn',
        )
        if (finalSummary && !alice.getStateSnapshot().activeStatuses[grpRoomId]) break
        await new Promise((r) => setTimeout(r, 25))
      }

      assert.ok(finalSummary, 'Expected Moderator summary message to be delivered to all group members')
      assert.ok(finalSummary.text.includes('All 3 sandboxes configured'))
      assert.equal(wakeCounts.alice, 1)
      assert.equal(wakeCounts.bob, 1)
      assert.equal(wakeCounts.charlie, 1)

      assert.ok(readFileSync(join(aliceDir, '.sandbox-mesh-probe.conf'), 'utf8').includes('SANDBOX=alice'))
      assert.ok(readFileSync(join(bobDir, '.sandbox-mesh-probe.conf'), 'utf8').includes('SANDBOX=bob'))
      assert.ok(readFileSync(join(charlieDir, '.sandbox-mesh-probe.conf'), 'utf8').includes('SANDBOX=charlie'))
      assert.ok(bob.store.getRoomAgentSessionId(grpRoomId, cfgTopic.threadId))
      assert.ok(charlie.store.getRoomAgentSessionId(grpRoomId, cfgTopic.threadId))
      assert.equal(alice.getStateSnapshot().activeStatuses[grpRoomId], undefined)

      await aliceModCtx.fiber.dispose()
      await bobPeerCtx.fiber.dispose()
      await charliePeerCtx.fiber.dispose()
    }

    // 12. Peer Ping, Group Leave & Browser-Origin Loopback Upgrade
    {
      const pingOnline = await alice.pingPeer({ slug: 'bob' })
      assert.equal(pingOnline.ok, true)
      assert.equal(pingOnline.reachable, true)
      assert.equal(pingOnline.status, 'online')

      // Charlie leaves Core Platform Group -> Alice (creator) rotates groupSecret & removes Charlie
      const coreGrp = alice.store.getSnapshot().rooms.find((r) => r.name === 'Core Platform Group')
      assert.ok(coreGrp)
      const oldSec = alice.store.getRoom(coreGrp.id).groupSecret
      const leaveRes = await charlie.leaveGroup({ roomId: coreGrp.id })
      assert.equal(leaveRes.ok, true)
      assert.equal(charlie.store.getRoom(coreGrp.id), null)
      assert.equal(alice.store.getRoom(coreGrp.id).members.some((m) => m.slug === 'charlie'), false)
      assert.notEqual(alice.store.getRoom(coreGrp.id).groupSecret, oldSec)

      // Loopback SANDBOX_PUBLIC_ORIGIN upgrades cleanly from forwarded Host/Origin header and persists across headerless updates
      const { createMeshStore } = await import('../src/host/store.js')
      const lanStore = createMeshStore({
        filePath: join(tempDir, 'lan-store.json'),
        config: { slug: 'lan1' },
        env: { SANDBOX_PUBLIC_ORIGIN: 'http://localhost:9000' },
      })
      lanStore.updateSelf({ origin: 'http://192.168.1.50:9000' })
      assert.equal(lanStore.getSelf().endpointUrl, 'http://192.168.1.50:9000/s/lan1/p/4090')
      lanStore.updateSelf(null, 4090)
      assert.equal(lanStore.getSelf().endpointUrl, 'http://192.168.1.50:9000/s/lan1/p/4090')
    }
  }

  console.log('host-live ok')
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
