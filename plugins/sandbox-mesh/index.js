import { createServer } from 'node:http'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import {
  canStartNewTopic,
  DEFAULT_MAX_FILE_BYTES,
  DEFAULT_MESH_PORT,
  extractFileReferences,
  extractMentions,
  parsePairInvite,
  sanitizeSlug,
} from './src/shared/protocol.js'
import {
  buildSignedHeaders,
  constantTimeEqualString,
  createRateLimiter,
  createReplayGuard,
  generateRandomHex,
  sha256Hex,
  verifySignedRequest,
} from './src/host/crypto.js'
import { createMeshStore, resolveStoragePath } from './src/host/store.js'
import { installAgentBridge, syncSkillFile } from './src/host/agent-bridge.js'
import { wireHarnessRuntime } from './src/host/harness-bridge.js'

export const name = 'sandbox-mesh'

export const STATE_ENDPOINT = '/api/sandbox-mesh.state'
export const PROFILE_ENDPOINT = '/api/sandbox-mesh.profile'
export const FILES_ENDPOINT = '/api/sandbox-mesh.files'
export const PAIR_CODE_ENDPOINT = '/api/sandbox-mesh.pair-code'
export const PAIR_CLAIM_ENDPOINT = '/api/sandbox-mesh.pair-claim'
export const GROUP_CREATE_ENDPOINT = '/api/sandbox-mesh.group-create'
export const GROUP_INVITE_ENDPOINT = '/api/sandbox-mesh.group-invite'
export const GROUP_MODERATE_ENDPOINT = '/api/sandbox-mesh.group-moderate'
export const NEW_TOPIC_ENDPOINT = '/api/sandbox-mesh.new-topic'
export const SEND_ENDPOINT = '/api/sandbox-mesh.send'
export const SEND_FILE_ENDPOINT = '/api/sandbox-mesh.send-file'
export const MARK_READ_ENDPOINT = '/api/sandbox-mesh.mark-read'
export const PEER_REMOVE_ENDPOINT = '/api/sandbox-mesh.peer-remove'

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

async function parseJsonRequest(request) {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function safeFileName(rawName) {
  const base = basename(String(rawName || 'file.bin').trim())
  const cleaned = base.replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, '_').trim()
  if (!cleaned || cleaned === '.' || cleaned === '..') return 'shared-file.bin'
  return cleaned.slice(0, 180)
}

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  '.cache',
  '.npm',
  '.npm-global',
  '.pnpm-store',
  '.venv',
  'venv',
  '__pycache__',
])

export function searchWorkspaceFiles(rootDir, query = '', limit = 40) {
  if (!rootDir || !existsSync(rootDir)) return []
  const rawQuery = String(query || '').trim().replace(/^#/, '')
  const isAbsQuery = rawQuery.startsWith('/')
  const baseRoot = isAbsQuery ? '/' : rootDir
  const needle = rawQuery.toLowerCase()

  let startDir = baseRoot
  let subNeedle = needle
  const lastSlash = rawQuery.lastIndexOf('/')
  if (lastSlash >= 0) {
    const dirPart = rawQuery.slice(0, lastSlash + 1)
    const candidateDir = isAbsQuery ? resolve(dirPart) : resolve(rootDir, dirPart)
    if (existsSync(candidateDir)) {
      try {
        if (statSync(candidateDir).isDirectory()) {
          startDir = candidateDir
          subNeedle = rawQuery.slice(lastSlash + 1).toLowerCase()
        }
      } catch {}
    }
  }

  const queue = [{ dir: startDir, depth: 0 }]
  const results = []
  let visited = 0
  const maxDepth = isAbsQuery && startDir === '/' ? 2 : 5

  while (queue.length > 0 && results.length < limit && visited < 2500) {
    const { dir: current, depth } = queue.shift()
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? 1 : -1
      return a.name.localeCompare(b.name)
    })

    for (const entry of entries) {
      if (results.length >= limit || visited >= 2500) break
      visited += 1
      const entryName = entry.name
      if (entry.isDirectory() && IGNORED_DIRS.has(entryName)) continue

      const fullPath = join(current, entryName)
      const relPath = isAbsQuery
        ? fullPath.split(sep).join('/')
        : relative(rootDir, fullPath).split(sep).join('/')

      const matchTarget = startDir !== baseRoot ? entryName.toLowerCase() : relPath.toLowerCase()
      const matches = !subNeedle || matchTarget.includes(subNeedle) || entryName.toLowerCase().includes(subNeedle)

      if (entry.isDirectory()) {
        if (depth < maxDepth) {
          queue.push({ dir: fullPath, depth: depth + 1 })
        }
        if (matches) {
          results.push({
            name: entryName,
            relativePath: relPath.endsWith('/') ? relPath : `${relPath}/`,
            path: fullPath,
            type: 'directory',
            size: 0,
          })
        }
      } else if (entry.isFile()) {
        if (matches) {
          let size = 0
          try {
            size = statSync(fullPath).size
          } catch {}
          results.push({
            name: entryName,
            relativePath: relPath,
            path: fullPath,
            type: 'file',
            size,
          })
        }
      }
    }
  }

  results.sort((a, b) => {
    const aHidden = a.relativePath.startsWith('.') || a.relativePath.includes('/.')
    const bHidden = b.relativePath.startsWith('.') || b.relativePath.includes('/.')
    if (aHidden !== bHidden && !needle.startsWith('.')) return aHidden ? 1 : -1
    if (a.type !== b.type) return a.type === 'file' ? -1 : 1
    return a.relativePath.localeCompare(b.relativePath)
  })

  return results.slice(0, limit)
}

export function buildCandidateBaseUrls(endpointUrl, targetSlug = '', env = process.env) {
  const candidates = []
  const add = (url) => {
    const clean = typeof url === 'string' ? url.trim().replace(/\/+$/, '') : ''
    if (clean && !candidates.includes(clean)) candidates.push(clean)
  }

  add(endpointUrl)

  const slug = sanitizeSlug(targetSlug)
  const portMatch = String(endpointUrl || '').match(/\/p\/(\d+)$/)
  const meshPort = portMatch ? portMatch[1] : String(env.DSH_MESH_PORT || DEFAULT_MESH_PORT)

  if (slug) {
    const internalGw = String(env.DSH_GATEWAY_INTERNAL_URL || 'http://dsh-gateway:9000').trim().replace(/\/+$/, '')
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/s\//i.test(String(endpointUrl || ''))) {
      add(`${internalGw}/s/${slug}/p/${meshPort}`)
      add(`http://dsh-sbx-${slug}:8080/p/${meshPort}`)
    } else {
      add(`http://dsh-sbx-${slug}:8080/p/${meshPort}`)
    }
  }

  return candidates
}

function buildGroupRoomMeta(room) {
  if (!room || room.type !== 'group') return null
  return {
    id: room.id,
    type: 'group',
    name: room.name,
    groupSecret: room.groupSecret,
    createdBy: room.createdBy,
    moderatorSlug: room.moderatorSlug || room.createdBy || '',
    activeThreadId: room.activeThreadId || '',
    createdAt: room.createdAt,
    members: room.members,
  }
}

export function createMeshService({
  config = {},
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const storagePath = resolveStoragePath(config, env)
  const store = createMeshStore({ filePath: storagePath, config, env })
  const replayGuard = createReplayGuard()
  const pairLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    maxAttempts: Number(config.pairRateLimit) > 0 ? Number(config.pairRateLimit) : 5,
  })
  const localToken = String(config.localToken || generateRandomHex(24))
  const homeDir = String(config.homeDir || env.HOME || '').trim() || homedir()
  const inboxDir = String(config.inboxDir || join(homeDir, 'mesh-inbox'))
  const AGENT_STATUS_TTL_MS = 150 * 1000
  const activityMap = new Map()
  const peerStatusSeqMap = new Map()
  let localStatusSeq = 0
  let agentWakeHandler = typeof config.onAgentWake === 'function' ? config.onAgentWake : null
  let catalogChangeHandler = null

  function pruneActivity(nowMs = Date.now()) {
    for (const [key, entry] of activityMap.entries()) {
      if (!entry || entry.expiresAt <= nowMs) {
        activityMap.delete(key)
      }
    }
  }

  function getActiveStatuses(nowMs = Date.now()) {
    pruneActivity(nowMs)
    const grouped = {}
    for (const entry of activityMap.values()) {
      if (!grouped[entry.roomId]) grouped[entry.roomId] = []
      grouped[entry.roomId].push({
        roomId: entry.roomId,
        slug: entry.slug,
        ownerName: entry.ownerName,
        stage: entry.stage,
        detail: entry.detail,
        isModerator: entry.isModerator,
        updatedAt: entry.updatedAt,
      })
    }
    for (const list of Object.values(grouped)) {
      list.sort((a, b) => a.updatedAt - b.updatedAt)
    }
    return grouped
  }

  function getStateSnapshot() {
    return {
      ...store.getSnapshot(),
      activeStatuses: getActiveStatuses(),
    }
  }

  async function broadcastActivityToRoom(roomId, payload) {
    const self = store.getSelf()
    const room = store.getRoom(roomId)
    if (!room || !Array.isArray(room.members)) return
    const recipients = room.members.filter((m) => m.slug !== self.slug)
    await Promise.all(
      recipients.map(async (member) => {
        const peer = store.getPeer(member.slug)
        const secret = room.type === 'group'
          ? (room.groupSecret || peer?.sharedSecret)
          : peer?.sharedSecret
        const endpointUrl = peer?.endpointUrl || member.endpointUrl
        if (!secret || !endpointUrl) return
        try {
          await postToPeer({
            targetSlug: member.slug,
            endpointUrl,
            path: '/mesh/status',
            payload,
            secret,
            groupId: room.type === 'group' ? room.id : '',
          })
        } catch {}
      }),
    )
  }

  function setAgentActivity({
    roomId,
    slug,
    ownerName = '',
    stage = 'preparing',
    detail = '',
    isModerator = false,
    broadcast = true,
    ttlMs = AGENT_STATUS_TTL_MS,
  } = {}) {
    const cleanRoomId = String(roomId || '').trim()
    const cleanSlug = sanitizeSlug(slug)
    if (!cleanRoomId || !cleanSlug) return null
    const nowMs = Date.now()
    const key = `${cleanRoomId}:${cleanSlug}`
    const seq = ++localStatusSeq
    const entry = {
      roomId: cleanRoomId,
      slug: cleanSlug,
      ownerName: String(ownerName || cleanSlug).trim() || cleanSlug,
      stage: String(stage || 'preparing'),
      detail: String(detail || ''),
      isModerator: Boolean(isModerator),
      updatedAt: nowMs,
      expiresAt: nowMs + Math.max(5000, Number(ttlMs) || AGENT_STATUS_TTL_MS),
    }
    activityMap.set(key, entry)
    if (broadcast) {
      void broadcastActivityToRoom(cleanRoomId, {
        action: 'set',
        seq,
        roomId: cleanRoomId,
        slug: cleanSlug,
        ownerName: entry.ownerName,
        stage: entry.stage,
        detail: entry.detail,
        isModerator: entry.isModerator,
      })
    }
    return entry
  }

  function clearAgentActivity({ roomId, slug, broadcast = true } = {}) {
    const cleanRoomId = String(roomId || '').trim()
    const cleanSlug = sanitizeSlug(slug)
    if (!cleanRoomId || !cleanSlug) return false
    const existed = activityMap.delete(`${cleanRoomId}:${cleanSlug}`)
    const seq = ++localStatusSeq
    if (broadcast) {
      void broadcastActivityToRoom(cleanRoomId, {
        action: 'clear',
        seq,
        roomId: cleanRoomId,
        slug: cleanSlug,
      })
    }
    return existed
  }

  function setAgentWakeHandler(fn) {
    agentWakeHandler = typeof fn === 'function' ? fn : null
  }

  function setCatalogChangeHandler(fn) {
    catalogChangeHandler = typeof fn === 'function' ? fn : null
  }

  function notifyCatalogChanged() {
    syncSkillFile({ config, env, snapshot: store.getSnapshot() })
    if (typeof catalogChangeHandler === 'function') {
      try { catalogChangeHandler() } catch {}
    }
  }

  function maybeDispatchAgentWake(roomId, message, duplicate, wakeInfo) {
    if (duplicate || !wakeInfo?.wake || typeof agentWakeHandler !== 'function') return
    const room = store.getRoom(roomId)
    if (!room) return
    store.getAgentInbox({ ack: true, roomId })
    agentWakeHandler({
      room,
      message,
      nextHop: wakeInfo.nextHop || 1,
    })
  }

  function resolveWorkspaceFilePath(rawRef) {
    const trimmed = String(rawRef || '').trim().replace(/^#/, '')
    if (!trimmed) return ''
    if (isAbsolute(trimmed)) return resolve(trimmed)
    return resolve(homeDir, trimmed)
  }

  async function postToPeer({
    targetSlug,
    endpointUrl,
    path,
    payload,
    secret,
    groupId = '',
    signed = true,
  }) {
    const body = JSON.stringify(payload)
    const self = store.getSelf()
    const headers = signed
      ? buildSignedHeaders({
          method: 'POST',
          path,
          body,
          secret,
          fromSlug: self.slug,
          groupId,
        })
      : { 'content-type': 'application/json; charset=utf-8' }

    const candidates = buildCandidateBaseUrls(endpointUrl, targetSlug, env)
    let lastError = 'No reachable endpoint'

    for (const baseUrl of candidates) {
      const fullUrl = `${baseUrl}${path}`
      try {
        const res = await fetchImpl(fullUrl, {
          method: 'POST',
          headers,
          body,
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok && data.ok !== false) {
          return { ok: true, data, usedBaseUrl: baseUrl }
        }
        lastError = data.error || `HTTP ${res.status}`
        if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 429) {
          return { ok: false, status: res.status, error: lastError }
        }
      } catch (err) {
        lastError = err?.message || String(err)
      }
    }

    return { ok: false, status: 502, error: lastError }
  }

  async function claimPairInvite(rawInvite, headers = null) {
    store.updateSelf(headers)
    const self = store.getSelf()
    const parsed = parsePairInvite(rawInvite, self.publicOrigin, self.meshPort)
    if (!parsed) {
      return { ok: false, status: 400, error: 'Invalid pair code or URI format' }
    }
    if (parsed.slug === self.slug) {
      return { ok: false, status: 400, error: 'Cannot pair a sandbox with itself' }
    }

    const peerKey = generateRandomHex(32)
    const result = await postToPeer({
      targetSlug: parsed.slug,
      endpointUrl: parsed.endpointUrl,
      path: '/pair/claim',
      signed: false,
      payload: {
        token: parsed.token,
        peerKey,
        peerProfile: {
          slug: self.slug,
          ownerName: self.ownerName,
          ownerEmail: self.ownerEmail,
          role: self.role || '',
          description: self.description || '',
          endpointUrl: self.endpointUrl,
        },
      },
    })

    if (!result.ok) {
      return {
        ok: false,
        status: result.status || 502,
        error: result.error || `Could not reach sandbox "${parsed.slug}"`,
      }
    }

    const remoteData = result.data
    const remotePeerProfile = {
      ...remoteData.peer,
      endpointUrl: remoteData.peer?.endpointUrl || result.usedBaseUrl || parsed.endpointUrl,
    }
    const { peer, room } = store.upsertPairedPeer({
      peerProfile: remotePeerProfile,
      sharedSecret: remoteData.sharedSecret,
    })

    store.recordMessage({
      roomId: room.id,
      sender: { slug: self.slug, ownerName: self.ownerName, ownerEmail: self.ownerEmail, actor: 'system' },
      kind: 'system',
      text: `Paired with ${peer.ownerName} (${peer.slug}) via Traefik mesh.`,
    })
    notifyCatalogChanged()

    return { ok: true, peer, room, state: getStateSnapshot() }
  }

  async function broadcastGroupSync(room, targetSlugs = null) {
    const self = store.getSelf()
    const fullRoom = store.getRoom(room.id)
    if (!fullRoom || fullRoom.type !== 'group') return { deliveredTo: [], pendingPeers: [] }

    const recipients = fullRoom.members.filter((m) => {
      if (m.slug === self.slug) return false
      if (Array.isArray(targetSlugs) && targetSlugs.length > 0) {
        return targetSlugs.includes(m.slug)
      }
      return true
    })

    const deliveredTo = []
    const pendingPeers = []
    const syncPayload = {
      group: buildGroupRoomMeta(fullRoom),
    }

    for (const member of recipients) {
      const peer = store.getPeer(member.slug)
      const secret = peer?.sharedSecret || fullRoom.groupSecret
      const endpointUrl = peer?.endpointUrl || member.endpointUrl
      if (!secret || !endpointUrl) {
        pendingPeers.push(member.slug)
        continue
      }
      const res = await postToPeer({
        targetSlug: member.slug,
        endpointUrl,
        path: '/mesh/group-sync',
        payload: syncPayload,
        secret,
        groupId: fullRoom.id,
      })
      if (res.ok) {
        deliveredTo.push(member.slug)
      } else {
        pendingPeers.push(member.slug)
        store.enqueueOutbox({
          targetSlug: member.slug,
          endpointUrl,
          path: '/mesh/group-sync',
          payload: syncPayload,
          secret,
          groupId: fullRoom.id,
        })
      }
    }

    return { deliveredTo, pendingPeers }
  }

  async function createGroup({
    name,
    memberSlugs = [],
    moderatorSlug = '',
    headers = null,
  }) {
    store.updateSelf(headers)
    let room
    try {
      room = store.createGroupRoom({
        name,
        memberSlugs,
        moderatorSlug,
      })
    } catch (err) {
      return { ok: false, status: 400, error: err?.message || String(err) }
    }
    const syncResult = await broadcastGroupSync(room)
    const self = store.getSelf()
    store.recordMessage({
      roomId: room.id,
      threadId: room.activeThreadId || '',
      sender: { slug: self.slug, ownerName: self.ownerName, ownerEmail: self.ownerEmail, actor: 'system' },
      kind: 'system',
      text: `Created group "${room.name}" (Moderator: @${room.moderatorSlug}) with ${room.members.map((m) => m.slug).join(', ')}.`,
      delivery: syncResult,
    })
    notifyCatalogChanged()
    return { ok: true, room, sync: syncResult, state: getStateSnapshot() }
  }

  async function inviteToGroup({ roomId, memberSlugs = [], headers = null }) {
    store.updateSelf(headers)
    let room
    try {
      room = store.addMembersToGroup(roomId, memberSlugs)
    } catch (err) {
      return { ok: false, status: 400, error: err?.message || String(err) }
    }
    const syncResult = await broadcastGroupSync(room)
    const self = store.getSelf()
    await sendMessage({
      roomId: room.id,
      text: `${self.ownerName} (${self.slug}) invited ${memberSlugs.join(', ')} to the group.`,
      kind: 'system',
      actor: 'system',
    })
    return { ok: true, room, sync: syncResult, state: getStateSnapshot() }
  }

  async function updateGroupModeration({
    roomId,
    moderatorSlug,
    headers = null,
  }) {
    store.updateSelf(headers)
    let room
    try {
      room = store.updateGroupModeration(roomId, {
        moderatorSlug,
      })
    } catch (err) {
      return { ok: false, status: 400, error: err?.message || String(err) }
    }
    const syncResult = await broadcastGroupSync(room)
    notifyCatalogChanged()
    return { ok: true, room, sync: syncResult, state: getStateSnapshot() }
  }

  async function sendMessage({
    roomId,
    text,
    files = [],
    kind = 'chat',
    actor = 'human',
    hop = 0,
    threadId = '',
    phase = '',
    newTopic = false,
    mentionsOverride = null,
    headers = null,
  }) {
    store.updateSelf(headers)
    const self = store.getSelf()
    const room = store.getRoom(roomId)
    if (!room) {
      return { ok: false, status: 404, error: `Room "${roomId}" does not exist` }
    }
    const cleanText = String(text ?? '').trim()
    const inlineFileRefs = extractFileReferences(cleanText)
    const allFileRefs = [...new Set([
      ...(Array.isArray(files) ? files.map((f) => String(f || '').trim()).filter(Boolean) : []),
      ...inlineFileRefs,
    ])]

    if (!cleanText && allFileRefs.length === 0) {
      return { ok: false, status: 400, error: 'Message text or #file reference is required' }
    }

    if (allFileRefs.length === 1 && cleanText === `#${allFileRefs[0]}`) {
      return sendFile({
        roomId: room.id,
        filePath: resolveWorkspaceFilePath(allFileRefs[0]),
        text: '',
        actor,
        headers,
      })
    }

    const numericHop = typeof hop === 'number' && Number.isFinite(hop) ? Math.max(0, Math.trunc(hop)) : 0
    if (actor === 'agent' && numericHop > store.maxAgentHops) {
      return {
        ok: false,
        status: 429,
        error: `Agent hop limit (${store.maxAgentHops}) exceeded to prevent infinite loops`,
      }
    }

    const mentions = Array.isArray(mentionsOverride)
      ? mentionsOverride
      : (phase === 'turn' && actor === 'agent' ? [] : extractMentions(cleanText))
    const hasAgentMention = mentions.some((m) => m === 'agent' || m.endsWith('-agent'))
    const effectiveKind = ['chat', 'task', 'file', 'system'].includes(kind)
      ? (kind === 'chat' && hasAgentMention ? 'task' : kind)
      : 'chat'

    const { message, duplicate, wakeInfo } = store.recordMessage({
      roomId: room.id,
      threadId: String(threadId || room.activeThreadId || '').trim(),
      phase,
      sender: {
        slug: self.slug,
        ownerName: self.ownerName,
        ownerEmail: self.ownerEmail,
        actor: ['human', 'agent', 'system'].includes(actor) ? actor : 'human',
      },
      kind: effectiveKind,
      text: cleanText || `Shared ${allFileRefs.map((f) => `#${f}`).join(' ')}`,
      mentions,
      hop: numericHop,
    })
    maybeDispatchAgentWake(room.id, message, duplicate, wakeInfo)

    const recipients = (room.members || []).filter((m) => m.slug !== self.slug)
    const deliveredTo = []
    const pendingPeers = []

    for (const member of recipients) {
      const peer = store.getPeer(member.slug)
      const secret = room.type === 'group'
        ? (room.groupSecret || peer?.sharedSecret)
        : peer?.sharedSecret
      const endpointUrl = peer?.endpointUrl || member.endpointUrl
      if (!secret || !endpointUrl) {
        pendingPeers.push(member.slug)
        continue
      }
      const payload = {
        message,
        newTopic: Boolean(newTopic),
        roomMeta: buildGroupRoomMeta(room),
      }
      const res = await postToPeer({
        targetSlug: member.slug,
        endpointUrl,
        path: '/mesh/message',
        payload,
        secret,
        groupId: room.type === 'group' ? room.id : '',
      })
      if (res.ok) {
        deliveredTo.push(member.slug)
      } else {
        pendingPeers.push(member.slug)
        store.enqueueOutbox({
          targetSlug: member.slug,
          endpointUrl,
          path: '/mesh/message',
          payload,
          secret,
          groupId: room.type === 'group' ? room.id : '',
        })
      }
    }

    const updatedMsg = store.updateMessageDelivery(room.id, message.id, {
      deliveredTo,
      pendingPeers,
    })

    for (const refPath of allFileRefs) {
      const resolvedFile = resolveWorkspaceFilePath(refPath)
      if (resolvedFile && existsSync(resolvedFile)) {
        await sendFile({
          roomId: room.id,
          filePath: resolvedFile,
          text: `#${refPath}`,
          actor,
        })
      }
    }

    return {
      ok: true,
      message: updatedMsg || message,
      delivery: { deliveredTo, pendingPeers },
      state: getStateSnapshot(),
    }
  }

  async function startNewTopic({ roomId, headers = null }) {
    store.updateSelf(headers)
    const room = store.getRoom(roomId)
    if (!room) {
      return { ok: false, status: 404, error: `Room "${roomId}" does not exist` }
    }
    const msgs = store.getSnapshot().messages?.[room.id] || []
    if (!canStartNewTopic(room, msgs)) {
      return {
        ok: true,
        alreadyFresh: true,
        roomId: room.id,
        threadId: room.activeThreadId || '',
        state: getStateSnapshot(),
      }
    }
    let rotated
    try {
      rotated = store.rotateRoomThread(roomId)
    } catch (err) {
      return { ok: false, status: 400, error: err?.message || String(err) }
    }
    const sendRes = await sendMessage({
      roomId: rotated.room.id,
      threadId: rotated.threadId,
      newTopic: true,
      text: '─── Started a new conversation topic (fresh Agent context isolated) ───',
      kind: 'system',
      actor: 'system',
      headers,
    })
    return {
      ok: Boolean(sendRes.ok),
      alreadyFresh: false,
      roomId: rotated.room.id,
      threadId: rotated.threadId,
      state: getStateSnapshot(),
      error: sendRes.error || '',
    }
  }

  async function sendFile({
    roomId,
    filePath,
    text = '',
    actor = 'human',
    headers = null,
  }) {
    store.updateSelf(headers)
    const self = store.getSelf()
    const room = store.getRoom(roomId)
    if (!room) {
      return { ok: false, status: 404, error: `Room "${roomId}" does not exist` }
    }
    const cleanPath = String(filePath || '').trim()
    if (!cleanPath) {
      return { ok: false, status: 400, error: 'A local file path is required' }
    }
    const resolvedPath = resolveWorkspaceFilePath(cleanPath)
    let fileStat
    try {
      fileStat = statSync(resolvedPath)
    } catch {
      return { ok: false, status: 404, error: `File not found: ${cleanPath}` }
    }
    if (!fileStat.isFile()) {
      return { ok: false, status: 400, error: `Not a regular file: ${cleanPath}` }
    }
    const maxFileBytes = Number(config.maxFileBytes) > 0 ? Number(config.maxFileBytes) : DEFAULT_MAX_FILE_BYTES
    if (fileStat.size > maxFileBytes) {
      return { ok: false, status: 413, error: `File exceeds ${maxFileBytes} byte limit` }
    }

    const rawBytes = readFileSync(resolvedPath)
    const fileName = safeFileName(basename(resolvedPath))
    const sha256 = sha256Hex(rawBytes)
    const contentBase64 = rawBytes.toString('base64')

    const { message } = store.recordMessage({
      roomId: room.id,
      sender: {
        slug: self.slug,
        ownerName: self.ownerName,
        ownerEmail: self.ownerEmail,
        actor: actor === 'agent' ? 'agent' : 'human',
      },
      kind: 'file',
      text: String(text || `#${fileName}`).trim(),
      attachment: {
        name: fileName,
        size: fileStat.size,
        sha256,
        sourcePath: resolvedPath,
      },
    })

    const recipients = (room.members || []).filter((m) => m.slug !== self.slug)
    const deliveredTo = []
    const pendingPeers = []

    for (const member of recipients) {
      const peer = store.getPeer(member.slug)
      const secret = room.type === 'group'
        ? (room.groupSecret || peer?.sharedSecret)
        : peer?.sharedSecret
      const endpointUrl = peer?.endpointUrl || member.endpointUrl
      if (!secret || !endpointUrl) {
        pendingPeers.push(member.slug)
        continue
      }
      const res = await postToPeer({
        targetSlug: member.slug,
        endpointUrl,
        path: '/mesh/file-offer',
        payload: {
          message,
          fileName,
          contentBase64,
          sha256,
          roomMeta: buildGroupRoomMeta(room),
        },
        secret,
        groupId: room.type === 'group' ? room.id : '',
      })
      if (res.ok) {
        deliveredTo.push(member.slug)
      } else {
        pendingPeers.push(member.slug)
      }
    }

    const updatedMsg = store.updateMessageDelivery(room.id, message.id, {
      deliveredTo,
      pendingPeers,
    })

    return {
      ok: true,
      message: updatedMsg || message,
      delivery: { deliveredTo, pendingPeers },
      state: getStateSnapshot(),
    }
  }

  async function updateProfile({ ownerName, role, description, headers = null }) {
    store.updateSelf(headers)
    const updatedSelf = store.updateSelfProfile({ ownerName, role, description })
    const snap = store.getSnapshot()
    const syncedTo = []
    for (const peerSummary of snap.peers || []) {
      const peer = store.getPeer(peerSummary.slug)
      if (!peer?.sharedSecret || !peer?.endpointUrl) continue
      const res = await postToPeer({
        targetSlug: peer.slug,
        endpointUrl: peer.endpointUrl,
        path: '/mesh/profile-sync',
        payload: {
          peerProfile: {
            slug: updatedSelf.slug,
            ownerName: updatedSelf.ownerName,
            ownerEmail: updatedSelf.ownerEmail,
            role: updatedSelf.role || '',
            description: updatedSelf.description || '',
            endpointUrl: updatedSelf.endpointUrl,
          },
        },
        secret: peer.sharedSecret,
      })
      if (res.ok) syncedTo.push(peer.slug)
    }
    notifyCatalogChanged()
    return { ok: true, self: updatedSelf, syncedTo, state: getStateSnapshot() }
  }

  async function flushOutbox() {
    const items = store.listOutbox()
    if (items.length === 0) return { flushed: 0 }
    const doneIds = []
    for (const item of items) {
      const res = await postToPeer({
        targetSlug: item.targetSlug,
        endpointUrl: item.endpointUrl,
        path: item.path,
        payload: item.payload,
        secret: item.secret,
        groupId: item.groupId || '',
      })
      if (res.ok) {
        doneIds.push(item.id)
      }
    }
    if (doneIds.length > 0) {
      store.removeOutboxItems(doneIds)
    }
    return { flushed: doneIds.length }
  }

  async function handleIncomingMeshHttp(method, urlPath, headers, rawBody) {
    const cleanPath = String(urlPath || '/').split('?')[0]

    // 1. Local CLI endpoint (strictly local loopback with 0600 bearer token; blocked if proxied via Caddy/Traefik)
    if (cleanPath === '/local/cli' && method === 'POST') {
      const forwardedPrefix = headers['x-forwarded-prefix'] || headers['x-forwarded-for']
      if (forwardedPrefix) {
        return { status: 403, body: { ok: false, error: 'Local CLI endpoint is not accessible through reverse proxy' } }
      }
      const auth = String(headers.authorization || '')
      const expectedAuth = `Bearer ${localToken}`
      if (!constantTimeEqualString(auth, expectedAuth)) {
        return { status: 401, body: { ok: false, error: 'Invalid local CLI token' } }
      }
      let body = {}
      try { body = JSON.parse(rawBody || '{}') } catch {}
      const action = body.action
      if (action === 'status') {
        return { status: 200, body: { ok: true, ...store.getSnapshot() } }
      }
      if (action === 'pair-code') {
        const invite = store.createPairCode()
        return { status: 200, body: { ok: true, invite } }
      }
      if (action === 'pair') {
        const res = await claimPairInvite(body.invite)
        return { status: res.status || (res.ok ? 200 : 400), body: res }
      }
      if (action === 'group-create') {
        const res = await createGroup({
          name: body.name,
          memberSlugs: body.memberSlugs,
          moderatorSlug: body.moderatorSlug,
        })
        return { status: res.status || (res.ok ? 200 : 400), body: res }
      }
      if (action === 'group-invite') {
        const res = await inviteToGroup({ roomId: body.roomId, memberSlugs: body.memberSlugs })
        return { status: res.status || (res.ok ? 200 : 400), body: res }
      }
      if (action === 'group-moderate') {
        const res = await updateGroupModeration({
          roomId: body.roomId,
          moderatorSlug: body.moderatorSlug,
        })
        return { status: res.status || (res.ok ? 200 : 400), body: res }
      }
      if (action === 'new-topic') {
        const res = await startNewTopic({ roomId: body.roomId })
        return { status: res.status || (res.ok ? 200 : 400), body: res }
      }
      if (action === 'rooms') {
        return { status: 200, body: { ok: true, rooms: store.getSnapshot().rooms } }
      }
      if (action === 'messages') {
        const snap = store.getSnapshot()
        return { status: 200, body: { ok: true, roomId: body.roomId, messages: snap.messages[body.roomId] || [] } }
      }
      if (action === 'inbox') {
        const inbox = store.getAgentInbox({ ack: Boolean(body.ack), roomId: body.roomId || '' })
        return { status: 200, body: { ok: true, inbox } }
      }
      if (action === 'send') {
        const res = await sendMessage({
          roomId: body.roomId,
          text: body.text,
          kind: body.kind || 'chat',
          actor: body.actor || 'agent',
          hop: Number(body.hop) || 0,
          threadId: body.threadId || '',
        })
        return { status: res.status || (res.ok ? 200 : 400), body: res }
      }
      if (action === 'send-file') {
        const res = await sendFile({
          roomId: body.roomId,
          filePath: body.filePath,
          text: body.text || '',
          actor: body.actor || 'agent',
        })
        return { status: res.status || (res.ok ? 200 : 400), body: res }
      }
      return { status: 400, body: { ok: false, error: `Unknown CLI action: ${action}` } }
    }

    // 2. One-time pair claim endpoint (protected by rate-limiting + 144-bit single-use token)
    if (cleanPath === '/pair/claim' && method === 'POST') {
      const clientKey = String(headers['x-forwarded-for'] || 'global').split(',')[0].trim()
      if (!pairLimiter.allow(clientKey)) {
        return { status: 429, body: { ok: false, error: 'Too many pairing attempts; try again later' } }
      }
      let body = null
      try { body = JSON.parse(rawBody || '{}') } catch {}
      if (!body || typeof body !== 'object') {
        return { status: 400, body: { ok: false, error: 'Invalid JSON body' } }
      }
      const res = store.verifyAndConsumeInvite({
        token: body.token,
        peerKey: body.peerKey,
        peerProfile: body.peerProfile,
      })
      if (!res.ok) {
        return { status: res.status || 401, body: { ok: false, error: res.error } }
      }
      const self = store.getSelf()
      store.recordMessage({
        roomId: res.room.id,
        sender: { slug: self.slug, ownerName: self.ownerName, ownerEmail: self.ownerEmail, actor: 'system' },
        kind: 'system',
        text: `${res.peer.ownerName} (${res.peer.slug}) paired with this sandbox.`,
      })
      notifyCatalogChanged()
      return {
        status: 200,
        body: {
          ok: true,
          peer: self,
          sharedSecret: res.sharedSecret,
          room: res.room,
        },
      }
    }

    // 3. All other /mesh/* routes require HMAC-SHA256 signature + Timestamp + Nonce replay guard
    if (cleanPath.startsWith('/mesh/')) {
      const verified = verifySignedRequest({
        method,
        path: cleanPath,
        headers,
        body: rawBody,
        resolveSecret: ({ fromSlug, groupId }) => store.resolveVerificationSecrets({ fromSlug, groupId }),
        replayGuard,
      })
      if (!verified.ok) {
        return { status: verified.status || 401, body: { ok: false, error: verified.error } }
      }

      if (cleanPath === '/mesh/ping' && (method === 'GET' || method === 'POST')) {
        void flushOutbox()
        return { status: 200, body: { ok: true, peer: store.getSelf() } }
      }

      let body = null
      try { body = JSON.parse(rawBody || '{}') } catch {}
      if (!body || typeof body !== 'object') {
        return { status: 400, body: { ok: false, error: 'Invalid JSON body' } }
      }

      if (cleanPath === '/mesh/profile-sync' && method === 'POST') {
        try {
          if (body.peerProfile && body.peerProfile.slug === verified.fromSlug) {
            const { peer } = store.upsertPairedPeer({
              peerProfile: body.peerProfile,
            })
            notifyCatalogChanged()
            return { status: 200, body: { ok: true, peer } }
          }
          return { status: 400, body: { ok: false, error: 'Invalid peerProfile slug' } }
        } catch (err) {
          return { status: 400, body: { ok: false, error: err?.message || String(err) } }
        }
      }

      if (cleanPath === '/mesh/group-sync' && method === 'POST') {
        try {
          const room = store.upsertGroupRoom(body.group)
          notifyCatalogChanged()
          return { status: 200, body: { ok: true, room } }
        } catch (err) {
          return { status: 400, body: { ok: false, error: err?.message || String(err) } }
        }
      }

      if (cleanPath === '/mesh/status' && method === 'POST') {
        const statusRoomId = String(body.roomId || '').trim()
        const targetSlug = sanitizeSlug(body.slug || verified.fromSlug)
        if (!statusRoomId || !targetSlug) {
          return { status: 400, body: { ok: false, error: 'roomId and slug are required' } }
        }
        if (targetSlug !== verified.fromSlug) {
          return { status: 403, body: { ok: false, error: 'Status slug mismatch' } }
        }
        const room = store.getRoom(statusRoomId)
        if (!room) {
          return { status: 404, body: { ok: false, error: `Unknown room "${statusRoomId}"` } }
        }
        const seqKey = `${statusRoomId}:${targetSlug}`
        const incomingSeq = Number(body.seq)
        if (Number.isFinite(incomingSeq)) {
          const prevSeq = peerStatusSeqMap.get(seqKey) ?? -1
          if (incomingSeq < prevSeq) {
            return { status: 200, body: { ok: true, stale: true } }
          }
          peerStatusSeqMap.set(seqKey, incomingSeq)
        }
        if (body.action === 'clear') {
          clearAgentActivity({ roomId: statusRoomId, slug: targetSlug, broadcast: false })
        } else {
          setAgentActivity({
            roomId: statusRoomId,
            slug: targetSlug,
            ownerName: String(body.ownerName || targetSlug),
            stage: String(body.stage || 'preparing'),
            detail: String(body.detail || ''),
            isModerator: Boolean(body.isModerator),
            broadcast: false,
          })
        }
        return { status: 200, body: { ok: true } }
      }

      if (cleanPath === '/mesh/message' && method === 'POST') {
        try {
          if (body.roomMeta && body.roomMeta.type === 'group') {
            store.upsertGroupRoom(body.roomMeta)
          }
          if (body.newTopic === true && body.message?.roomId && body.message?.threadId) {
            try {
              store.rotateRoomThread(body.message.roomId, { nextThreadId: body.message.threadId })
            } catch {}
          }
          const { message, duplicate, wakeInfo } = store.recordMessage(body.message, { isIncoming: true })
          maybeDispatchAgentWake(message.roomId, message, duplicate, wakeInfo)
          return { status: 200, body: { ok: true, messageId: message.id, duplicate, wakeInfo } }
        } catch (err) {
          return { status: 400, body: { ok: false, error: err?.message || String(err) } }
        }
      }

      if (cleanPath === '/mesh/file-offer' && method === 'POST') {
        try {
          if (body.roomMeta && body.roomMeta.type === 'group') {
            store.upsertGroupRoom(body.roomMeta)
          }
          const msgInput = body.message
          const roomId = String(msgInput?.roomId || '').trim()
          const safeRoomDir = roomId.replace(/[^a-zA-Z0-9_-]/g, '_')
          const fileName = safeFileName(body.fileName || msgInput?.attachment?.name || 'file.bin')
          const fileBytes = Buffer.from(String(body.contentBase64 || ''), 'base64')
          const maxFileBytes = Number(config.maxFileBytes) > 0 ? Number(config.maxFileBytes) : DEFAULT_MAX_FILE_BYTES
          if (fileBytes.byteLength > maxFileBytes) {
            return { status: 413, body: { ok: false, error: 'Shared file exceeds size limit' } }
          }
          const actualSha = sha256Hex(fileBytes)
          if (body.sha256 && body.sha256 !== actualSha) {
            return { status: 400, body: { ok: false, error: 'File SHA-256 integrity mismatch' } }
          }
          const targetDir = join(inboxDir, safeRoomDir)
          mkdirSync(targetDir, { recursive: true })
          const savedPath = join(targetDir, fileName)
          writeFileSync(savedPath, fileBytes)

          const { message, duplicate, wakeInfo } = store.recordMessage(
            {
              ...msgInput,
              kind: 'file',
              attachment: {
                ...(msgInput?.attachment || {}),
                name: fileName,
                size: fileBytes.byteLength,
                sha256: actualSha,
                savedPath,
              },
            },
            { isIncoming: true },
          )
          maybeDispatchAgentWake(message.roomId, message, duplicate, wakeInfo)
          return { status: 200, body: { ok: true, messageId: message.id, savedPath, duplicate } }
        } catch (err) {
          return { status: 400, body: { ok: false, error: err?.message || String(err) } }
        }
      }
    }

    return { status: 404, body: { ok: false, error: `Unknown mesh route: ${cleanPath}` } }
  }

  function listFiles(query = '', limit = 30) {
    return searchWorkspaceFiles(homeDir, query, limit)
  }

  return {
    store,
    localToken,
    homeDir,
    getActiveStatuses,
    getStateSnapshot,
    setAgentActivity,
    clearAgentActivity,
    setAgentWakeHandler,
    setCatalogChangeHandler,
    listFiles,
    updateProfile,
    claimPairInvite,
    createGroup,
    inviteToGroup,
    updateGroupModeration,
    startNewTopic,
    sendMessage,
    sendFile,
    flushOutbox,
    handleIncomingMeshHttp,
  }
}

export function startMeshHttpServer(service, { port = DEFAULT_MESH_PORT, host = '127.0.0.1' } = {}) {
  const server = createServer((req, res) => {
    const chunks = []
    let total = 0
    const cap = DEFAULT_MAX_FILE_BYTES + 2 * 1024 * 1024
    req.on('data', (chunk) => {
      total += chunk.length
      if (total <= cap) {
        chunks.push(chunk)
      } else {
        req.destroy()
      }
    })
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8')
      void service
        .handleIncomingMeshHttp(req.method || 'GET', req.url || '/', req.headers || {}, rawBody)
        .then((result) => {
          res.writeHead(result.status || 200, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
          })
          res.end(JSON.stringify(result.body))
        })
        .catch((err) => {
          res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ ok: false, error: err?.message || 'Internal mesh error' }))
        })
    })
  })

  return new Promise((resolveServer) => {
    server.on('error', () => {
      resolveServer({ server: null, port: Number(port) || DEFAULT_MESH_PORT, close: () => {} })
    })
    server.listen(port, host, () => {
      const addr = server.address()
      const boundPort = typeof addr === 'object' && addr ? addr.port : Number(port) || DEFAULT_MESH_PORT
      service.store.updateSelf(null, boundPort)
      resolveServer({
        server,
        port: boundPort,
        close: () => new Promise((r) => server.close(() => r())),
      })
    })
  })
}

export function apply(ctx, config = {}) {
  const service = createMeshService({ config })
  const desiredPort = config.port !== undefined ? Number(config.port) : DEFAULT_MESH_PORT

  wireHarnessRuntime(ctx, service)

  let serverHandle = null
  if (config.disableServer !== true) {
    void startMeshHttpServer(service, { port: desiredPort }).then((handle) => {
      serverHandle = handle
      installAgentBridge({
        config,
        localToken: service.localToken,
        meshPort: handle.port,
        snapshot: service.store.getSnapshot(),
      })
    })
  } else {
    installAgentBridge({
      config,
      localToken: service.localToken,
      meshPort: desiredPort || DEFAULT_MESH_PORT,
      snapshot: service.store.getSnapshot(),
    })
  }

  ctx.effect(() => () => {
    serverHandle?.close?.()
    serverHandle = null
  }, 'sandbox-mesh: p2p http listener')

  ctx.inject(['connection'], ({ connection }) => {
    const disposers = [
      connection.fetch.register({
        path: STATE_ENDPOINT,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch(request) {
          service.store.updateSelf(request.headers)
          return jsonResponse({ ok: true, state: service.getStateSnapshot() })
        },
      }),
      connection.fetch.register({
        path: PROFILE_ENDPOINT,
        methods: ['POST'],
        requestBody: 'buffered',
        async fetch(request) {
          const body = await parseJsonRequest(request)
          if (!body || typeof body !== 'object') {
            return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400)
          }
          const result = await service.updateProfile({
            ownerName: body.ownerName,
            role: body.role,
            description: body.description,
            headers: request.headers,
          })
          return jsonResponse(result, 200)
        },
      }),
      connection.fetch.register({
        path: FILES_ENDPOINT,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch(request) {
          let q = ''
          try {
            const u = new URL(request.url, 'http://localhost')
            q = u.searchParams.get('q') || ''
          } catch {}
          const files = service.listFiles(q, 40)
          return jsonResponse({ ok: true, files })
        },
      }),
      connection.fetch.register({
        path: PAIR_CODE_ENDPOINT,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch(request) {
          service.store.updateSelf(request.headers)
          const invite = service.store.createPairCode()
          return jsonResponse({ ok: true, invite, state: service.getStateSnapshot() })
        },
      }),
      connection.fetch.register({
        path: PAIR_CLAIM_ENDPOINT,
        methods: ['POST'],
        requestBody: 'buffered',
        async fetch(request) {
          const body = await parseJsonRequest(request)
          if (!body || !body.invite) {
            return jsonResponse({ ok: false, error: 'Pair code or URI is required' }, 400)
          }
          const result = await service.claimPairInvite(body.invite, request.headers)
          return jsonResponse(result, result.ok ? 200 : (result.status || 400))
        },
      }),
      connection.fetch.register({
        path: GROUP_CREATE_ENDPOINT,
        methods: ['POST'],
        requestBody: 'buffered',
        async fetch(request) {
          const body = await parseJsonRequest(request)
          if (!body || !body.name) {
            return jsonResponse({ ok: false, error: 'Group name is required' }, 400)
          }
          const result = await service.createGroup({
            name: body.name,
            memberSlugs: Array.isArray(body.memberSlugs) ? body.memberSlugs : [],
            moderatorSlug: body.moderatorSlug || '',
            headers: request.headers,
          })
          return jsonResponse(result, result.ok ? 200 : (result.status || 400))
        },
      }),
      connection.fetch.register({
        path: GROUP_INVITE_ENDPOINT,
        methods: ['POST'],
        requestBody: 'buffered',
        async fetch(request) {
          const body = await parseJsonRequest(request)
          if (!body || !body.roomId || !Array.isArray(body.memberSlugs)) {
            return jsonResponse({ ok: false, error: 'roomId and memberSlugs are required' }, 400)
          }
          const result = await service.inviteToGroup({
            roomId: body.roomId,
            memberSlugs: body.memberSlugs,
            headers: request.headers,
          })
          return jsonResponse(result, result.ok ? 200 : (result.status || 400))
        },
      }),
      connection.fetch.register({
        path: GROUP_MODERATE_ENDPOINT,
        methods: ['POST'],
        requestBody: 'buffered',
        async fetch(request) {
          const body = await parseJsonRequest(request)
          if (!body || !body.roomId) {
            return jsonResponse({ ok: false, error: 'roomId is required' }, 400)
          }
          const result = await service.updateGroupModeration({
            roomId: body.roomId,
            moderatorSlug: body.moderatorSlug,
            headers: request.headers,
          })
          return jsonResponse(result, result.ok ? 200 : (result.status || 400))
        },
      }),
      connection.fetch.register({
        path: NEW_TOPIC_ENDPOINT,
        methods: ['POST'],
        requestBody: 'buffered',
        async fetch(request) {
          const body = await parseJsonRequest(request)
          if (!body || !body.roomId) {
            return jsonResponse({ ok: false, error: 'roomId is required' }, 400)
          }
          const result = await service.startNewTopic({
            roomId: body.roomId,
            headers: request.headers,
          })
          return jsonResponse(result, result.ok ? 200 : (result.status || 400))
        },
      }),
      connection.fetch.register({
        path: SEND_ENDPOINT,
        methods: ['POST'],
        requestBody: 'buffered',
        async fetch(request) {
          const body = await parseJsonRequest(request)
          if (!body || !body.roomId) {
            return jsonResponse({ ok: false, error: 'roomId is required' }, 400)
          }
          const result = await service.sendMessage({
            roomId: body.roomId,
            text: body.text,
            files: Array.isArray(body.files) ? body.files : [],
            kind: body.kind || 'chat',
            actor: body.actor || 'human',
            hop: Number(body.hop) || 0,
            threadId: body.threadId || '',
            headers: request.headers,
          })
          return jsonResponse(result, result.ok ? 200 : (result.status || 400))
        },
      }),
      connection.fetch.register({
        path: SEND_FILE_ENDPOINT,
        methods: ['POST'],
        requestBody: 'buffered',
        async fetch(request) {
          const body = await parseJsonRequest(request)
          if (!body || !body.roomId || !body.filePath) {
            return jsonResponse({ ok: false, error: 'roomId and filePath are required' }, 400)
          }
          const result = await service.sendFile({
            roomId: body.roomId,
            filePath: body.filePath,
            text: body.text || '',
            actor: body.actor || 'human',
            headers: request.headers,
          })
          return jsonResponse(result, result.ok ? 200 : (result.status || 400))
        },
      }),
      connection.fetch.register({
        path: MARK_READ_ENDPOINT,
        methods: ['POST'],
        requestBody: 'buffered',
        async fetch(request) {
          const body = await parseJsonRequest(request)
          if (body?.roomId) {
            service.store.markRoomRead(body.roomId)
          }
          return jsonResponse({ ok: true, state: service.getStateSnapshot() })
        },
      }),
      connection.fetch.register({
        path: PEER_REMOVE_ENDPOINT,
        methods: ['POST'],
        requestBody: 'buffered',
        async fetch(request) {
          const body = await parseJsonRequest(request)
          if (!body?.slug) {
            return jsonResponse({ ok: false, error: 'Peer slug is required' }, 400)
          }
          service.store.removePeer(body.slug)
          return jsonResponse({ ok: true, state: service.getStateSnapshot() })
        },
      }),
    ]

    ctx.effect(() => () => {
      for (const dispose of disposers) dispose()
    }, 'sandbox-mesh: browser api routes')
  })
}
