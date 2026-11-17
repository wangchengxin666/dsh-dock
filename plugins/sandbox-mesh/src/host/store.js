import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir, hostname } from 'node:os'
import { dirname, join } from 'node:path'
import {
  DEFAULT_MAX_AGENT_HOPS,
  DEFAULT_MAX_MESSAGES_PER_ROOM,
  DEFAULT_MESH_PORT,
  DEFAULT_PAIR_TTL_MS,
  evaluateAgentWake,
  extractMentions,
  formatPairInvite,
  normalizeEndpointUrl,
  pairRoomId,
  sanitizeSlug,
} from '../shared/protocol.js'
import {
  constantTimeEqualString,
  deriveSharedSecret,
  generateInviteToken,
  generateRandomHex,
} from './crypto.js'

function readHeader(headers, key) {
  if (!headers) return ''
  if (typeof headers.get === 'function') {
    return String(headers.get(key) || '').trim()
  }
  const lower = key.toLowerCase()
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower && v != null) {
      return String(Array.isArray(v) ? v[0] : v).trim()
    }
  }
  return ''
}

function decodeHeaderValue(raw) {
  if (!raw) return ''
  try {
    return decodeURIComponent(raw).trim()
  } catch {
    return raw.trim()
  }
}

function readSandboxInfoFile(homeDir) {
  const infoPath = join(homeDir, '.dsh-sandbox', 'info.json')
  if (!existsSync(infoPath)) return {}
  try {
    return JSON.parse(readFileSync(infoPath, 'utf8')) || {}
  } catch {
    return {}
  }
}

export function resolveSelfIdentity({
  config = {},
  env = process.env,
  headers = null,
  actualPort = null,
} = {}) {
  const home = String(env.HOME || '').trim() || homedir()
  const info = readSandboxInfoFile(home)
  const basePath = String(
    config.basePath
    || env.SANDBOX_BASE_PATH
    || info.base_path
    || '',
  ).trim().replace(/\/+$/, '')

  const slugFromBase = basePath.match(/\/s\/([^/?#]+)/)?.[1] || ''
  const slugFromMount = String(env.DSH_MOUNT || '').match(/\/s\/([^/?#]+)/)?.[1] || ''
  const hostName = String(env.HOSTNAME || hostname() || '').trim()
  const slugFromHost = hostName.startsWith('dsh-sbx-') ? hostName.slice('dsh-sbx-'.length) : hostName

  const slug = sanitizeSlug(
    config.slug
    || env.SANDBOX_SLUG
    || slugFromBase
    || slugFromMount
    || slugFromHost
    || 'sandbox',
  ) || 'sandbox'

  const ownerEmail = (
    readHeader(headers, 'x-sandbox-owner')
    || readHeader(headers, 'x-auth-request-email')
    || readHeader(headers, 'x-forwarded-user')
    || String(config.ownerEmail || env.DSH_OWNER_EMAIL || '').trim()
  ).toLowerCase()

  const ownerName = (
    decodeHeaderValue(readHeader(headers, 'x-sandbox-owner-name'))
    || decodeHeaderValue(readHeader(headers, 'x-auth-request-name'))
    || String(config.ownerName || env.DSH_OWNER_NAME || '').trim()
    || (ownerEmail ? ownerEmail.split('@')[0] : slug)
  )

  const meshPort = Number(actualPort || config.port || env.DSH_MESH_PORT || DEFAULT_MESH_PORT)
  const publicOrigin = String(
    config.publicOrigin
    || env.SANDBOX_PUBLIC_ORIGIN
    || info.public_origin
    || 'http://localhost:9000',
  ).trim().replace(/\/+$/, '')

  const effectiveBasePath = basePath || `/s/${slug}`
  const endpointUrl = String(
    config.endpointUrl
    || `${publicOrigin}${effectiveBasePath}/p/${meshPort}`,
  ).trim().replace(/\/+$/, '')

  return {
    slug,
    ownerName,
    ownerEmail,
    publicOrigin,
    basePath: effectiveBasePath,
    meshPort,
    endpointUrl,
  }
}

export function resolveStoragePath(config = {}, env = process.env) {
  if (typeof config?.storagePath === 'string' && config.storagePath.trim()) {
    return config.storagePath.trim()
  }
  const dshHome = String(env.DSH_HOME || '').trim() || join(homedir(), '.dsh')
  return join(dshHome, 'sandbox-mesh.json')
}

function defaultState() {
  return {
    version: 1,
    self: {},
    activeInvite: null,
    peers: {},
    rooms: {},
    messages: {},
    outbox: [],
  }
}

function normalizeLoadedState(raw) {
  const base = defaultState()
  if (!raw || typeof raw !== 'object') return base
  return {
    version: 1,
    self: raw.self && typeof raw.self === 'object' ? { ...raw.self } : {},
    activeInvite: raw.activeInvite && typeof raw.activeInvite === 'object' ? { ...raw.activeInvite } : null,
    peers: raw.peers && typeof raw.peers === 'object' ? { ...raw.peers } : {},
    rooms: raw.rooms && typeof raw.rooms === 'object' ? { ...raw.rooms } : {},
    messages: raw.messages && typeof raw.messages === 'object' ? { ...raw.messages } : {},
    outbox: Array.isArray(raw.outbox) ? [...raw.outbox] : [],
  }
}

export function createMeshStore({
  filePath,
  config = {},
  env = process.env,
}) {
  const maxAgentHops = Number(config.maxAgentHops) > 0 ? Number(config.maxAgentHops) : DEFAULT_MAX_AGENT_HOPS
  const maxMessagesPerRoom = Number(config.maxMessagesPerRoom) > 0
    ? Number(config.maxMessagesPerRoom)
    : DEFAULT_MAX_MESSAGES_PER_ROOM

  let state = existsSync(filePath)
    ? (() => {
        try {
          return normalizeLoadedState(JSON.parse(readFileSync(filePath, 'utf8')))
        } catch {
          return defaultState()
        }
      })()
    : defaultState()

  let actualPort = null

  function persist() {
    mkdirSync(dirname(filePath), { recursive: true })
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}.tmp`
    writeFileSync(tmpPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    renameSync(tmpPath, filePath)
  }

  function updateSelf(headers = null, portOverride = null) {
    if (portOverride != null) actualPort = portOverride
    const resolved = resolveSelfIdentity({
      config,
      env,
      headers,
      actualPort,
    })
    const prev = state.self || {}
    const nextSelf = {
      slug: resolved.slug || prev.slug || 'sandbox',
      ownerName: prev.customOwnerName || resolved.ownerName || prev.ownerName || resolved.slug,
      customOwnerName: prev.customOwnerName || '',
      ownerEmail: resolved.ownerEmail || prev.ownerEmail || '',
      role: String(prev.role || config.role || '').trim(),
      description: String(prev.description || config.description || '').trim(),
      publicOrigin: resolved.publicOrigin || prev.publicOrigin || 'http://localhost:9000',
      basePath: resolved.basePath || prev.basePath || `/s/${resolved.slug}`,
      meshPort: resolved.meshPort || prev.meshPort || DEFAULT_MESH_PORT,
      endpointUrl: resolved.endpointUrl || prev.endpointUrl || '',
    }
    const changed = JSON.stringify(prev) !== JSON.stringify(nextSelf)
    state.self = nextSelf
    if (changed && existsSync(dirname(filePath))) {
      try { persist() } catch {}
    }
    return nextSelf
  }

  function getSelf() {
    if (!state.self || !state.self.slug) {
      return updateSelf()
    }
    return state.self
  }

  function updateSelfProfile({ ownerName, role, description } = {}) {
    const self = getSelf()
    if (typeof ownerName === 'string' && ownerName.trim()) {
      self.ownerName = ownerName.trim().slice(0, 80)
      self.customOwnerName = self.ownerName
    }
    if (typeof role === 'string') {
      self.role = role.trim().slice(0, 120)
    }
    if (typeof description === 'string') {
      self.description = description.trim().slice(0, 600)
    }
    state.self = { ...self }
    // Sync updated self metadata into local room member entries
    for (const room of Object.values(state.rooms)) {
      if (!Array.isArray(room.members)) continue
      for (const m of room.members) {
        if (m.slug === self.slug) {
          m.ownerName = self.ownerName
          m.role = self.role
          m.description = self.description
        }
      }
    }
    persist()
    return state.self
  }

  function createPairCode({ ttlMs = DEFAULT_PAIR_TTL_MS, nowMs = Date.now() } = {}) {
    const self = getSelf()
    const token = generateInviteToken()
    const hostKey = generateRandomHex(32)
    const formatted = formatPairInvite({
      slug: self.slug,
      token,
      endpointUrl: self.endpointUrl,
    })
    state.activeInvite = {
      codeId: token.slice(0, 6),
      token,
      hostKey,
      shortCode: formatted.shortCode,
      inviteUri: formatted.inviteUri,
      createdAt: nowMs,
      expiresAt: nowMs + ttlMs,
      failedAttempts: 0,
    }
    persist()
    return {
      codeId: state.activeInvite.codeId,
      shortCode: state.activeInvite.shortCode,
      inviteUri: state.activeInvite.inviteUri,
      expiresAt: state.activeInvite.expiresAt,
    }
  }

  function getActiveInvite(nowMs = Date.now()) {
    const inv = state.activeInvite
    if (!inv) return null
    if (inv.expiresAt <= nowMs || inv.failedAttempts >= 5) {
      state.activeInvite = null
      persist()
      return null
    }
    return {
      codeId: inv.codeId,
      shortCode: inv.shortCode,
      inviteUri: inv.inviteUri,
      expiresAt: inv.expiresAt,
    }
  }

  function verifyAndConsumeInvite({ token, peerProfile, peerKey, nowMs = Date.now() }) {
    const inv = state.activeInvite
    if (!inv || inv.expiresAt <= nowMs) {
      if (inv) {
        state.activeInvite = null
        persist()
      }
      return { ok: false, status: 400, error: 'Pair code has expired or does not exist' }
    }

    if (!constantTimeEqualString(String(token || ''), inv.token)) {
      inv.failedAttempts = (inv.failedAttempts || 0) + 1
      if (inv.failedAttempts >= 5) {
        state.activeInvite = null
      }
      persist()
      return { ok: false, status: 401, error: 'Invalid pair code' }
    }

    const peerSlug = sanitizeSlug(peerProfile?.slug)
    const self = getSelf()
    if (!peerSlug || peerSlug === self.slug) {
      return { ok: false, status: 400, error: 'Cannot pair a sandbox with itself' }
    }

    const sharedSecret = deriveSharedSecret(inv.token, inv.hostKey, String(peerKey || ''))
    state.activeInvite = null

    const { peer, room } = upsertPairedPeer({
      peerProfile,
      sharedSecret,
      nowMs,
    })

    return {
      ok: true,
      self: getSelf(),
      peer,
      room,
      sharedSecret,
    }
  }

  function upsertPairedPeer({ peerProfile, sharedSecret, nowMs = Date.now() }) {
    const self = getSelf()
    const slug = sanitizeSlug(peerProfile?.slug)
    if (!slug) throw new Error('Peer slug is required')

    const endpointUrl = normalizeEndpointUrl(
      peerProfile?.endpointUrl,
      slug,
      self.publicOrigin,
      self.meshPort,
    )
    const existing = state.peers[slug] || {}
    const peer = {
      slug,
      ownerName: String(peerProfile?.ownerName || existing.ownerName || slug).trim(),
      ownerEmail: String(peerProfile?.ownerEmail || existing.ownerEmail || '').trim().toLowerCase(),
      role: String(peerProfile?.role ?? existing.role ?? '').trim().slice(0, 120),
      description: String(peerProfile?.description ?? existing.description ?? '').trim().slice(0, 600),
      endpointUrl: endpointUrl || existing.endpointUrl || '',
      sharedSecret: String(sharedSecret || existing.sharedSecret || ''),
      pairedAt: existing.pairedAt || nowMs,
      lastSeenAt: nowMs,
      status: 'online',
    }
    state.peers[slug] = peer

    // Also update this peer's role/description inside any existing group rooms
    for (const grp of Object.values(state.rooms)) {
      if (grp.type === 'group' && Array.isArray(grp.members)) {
        for (const m of grp.members) {
          if (m.slug === slug) {
            m.ownerName = peer.ownerName
            m.role = peer.role || m.role || ''
            m.description = peer.description || m.description || ''
            m.endpointUrl = peer.endpointUrl || m.endpointUrl || ''
          }
        }
      }
    }

    const rId = pairRoomId(self.slug, slug)
    const existingRoom = state.rooms[rId]
    const defaultThreadId = existingRoom?.activeThreadId || `thr_${nowMs.toString(36)}_${generateRandomHex(3)}`
    const room = {
      id: rId,
      type: 'pair',
      name: `${peer.ownerName} (${peer.slug})`,
      peerSlug: slug,
      groupSecret: '',
      createdBy: existingRoom?.createdBy || self.slug,
      activeThreadId: defaultThreadId,
      members: [
        {
          slug: self.slug,
          ownerName: self.ownerName,
          ownerEmail: self.ownerEmail,
          role: self.role || '',
          description: self.description || '',
          endpointUrl: self.endpointUrl,
        },
        {
          slug: peer.slug,
          ownerName: peer.ownerName,
          ownerEmail: peer.ownerEmail,
          role: peer.role || '',
          description: peer.description || '',
          endpointUrl: peer.endpointUrl,
        },
      ],
      createdAt: existingRoom?.createdAt || nowMs,
      updatedAt: nowMs,
      unreadCount: existingRoom?.unreadCount || 0,
      agentSessionId: existingRoom?.agentSessionId || '',
      threadSessions: existingRoom?.threadSessions && typeof existingRoom.threadSessions === 'object'
        ? { ...existingRoom.threadSessions }
        : {},
    }
    state.rooms[rId] = room
    if (!Array.isArray(state.messages[rId])) {
      state.messages[rId] = []
    }
    persist()
    return { peer, room }
  }

  function removePeer(rawSlug) {
    const slug = sanitizeSlug(rawSlug)
    if (!slug || !state.peers[slug]) return false
    delete state.peers[slug]
    const rId = pairRoomId(getSelf().slug, slug)
    delete state.rooms[rId]
    delete state.messages[rId]
    state.outbox = state.outbox.filter((item) => item.targetSlug !== slug)
    persist()
    return true
  }

  function createGroupRoom({
    name,
    memberSlugs = [],
    moderatorSlug = '',
    nowMs = Date.now(),
  }) {
    const self = getSelf()
    const cleanName = typeof name === 'string' ? name.trim().slice(0, 80) : ''
    if (!cleanName) {
      throw new Error('Group name is required')
    }
    const roomId = `grp_${nowMs.toString(36)}_${generateRandomHex(4)}`
    const groupSecret = generateRandomHex(32)

    const membersMap = new Map()
    membersMap.set(self.slug, {
      slug: self.slug,
      ownerName: self.ownerName,
      ownerEmail: self.ownerEmail,
      role: self.role || '',
      description: self.description || '',
      endpointUrl: self.endpointUrl,
    })

    for (const rawSlug of memberSlugs) {
      const s = sanitizeSlug(rawSlug)
      if (!s || s === self.slug) continue
      const peer = state.peers[s]
      if (peer) {
        membersMap.set(s, {
          slug: peer.slug,
          ownerName: peer.ownerName,
          ownerEmail: peer.ownerEmail,
          role: peer.role || '',
          description: peer.description || '',
          endpointUrl: peer.endpointUrl,
        })
      }
    }

    const cleanModerator = sanitizeSlug(moderatorSlug)
    const effectiveModerator = cleanModerator && membersMap.has(cleanModerator)
      ? cleanModerator
      : self.slug

    const room = {
      id: roomId,
      type: 'group',
      name: cleanName,
      peerSlug: '',
      groupSecret,
      createdBy: self.slug,
      moderatorSlug: effectiveModerator,
      activeThreadId: `thr_${nowMs.toString(36)}_${generateRandomHex(3)}`,
      members: [...membersMap.values()],
      createdAt: nowMs,
      updatedAt: nowMs,
      unreadCount: 0,
      agentSessionId: '',
      threadSessions: {},
    }
    state.rooms[roomId] = room
    state.messages[roomId] = []
    persist()
    return room
  }

  function upsertGroupRoom(groupPayload, nowMs = Date.now()) {
    if (!groupPayload || typeof groupPayload !== 'object') {
      throw new Error('Invalid group payload')
    }
    const roomId = String(groupPayload.id || '').trim()
    if (!roomId.startsWith('grp_')) {
      throw new Error('Invalid group id')
    }
    const existing = state.rooms[roomId]
    const membersMap = new Map()
    for (const m of existing?.members || []) {
      const s = sanitizeSlug(m.slug)
      if (s) membersMap.set(s, { ...m, slug: s })
    }
    for (const m of groupPayload.members || []) {
      const s = sanitizeSlug(m.slug)
      if (!s) continue
      const knownPeer = state.peers[s]
      const prevMember = membersMap.get(s)
      membersMap.set(s, {
        slug: s,
        ownerName: String(m.ownerName || knownPeer?.ownerName || prevMember?.ownerName || s).trim(),
        ownerEmail: String(m.ownerEmail || knownPeer?.ownerEmail || prevMember?.ownerEmail || '').trim().toLowerCase(),
        role: String(m.role || knownPeer?.role || prevMember?.role || '').trim(),
        description: String(m.description || knownPeer?.description || prevMember?.description || '').trim(),
        endpointUrl: String(m.endpointUrl || knownPeer?.endpointUrl || prevMember?.endpointUrl || '').trim(),
      })
    }

    const self = getSelf()
    membersMap.set(self.slug, {
      slug: self.slug,
      ownerName: self.ownerName,
      ownerEmail: self.ownerEmail,
      role: self.role || '',
      description: self.description || '',
      endpointUrl: self.endpointUrl,
    })

    const createdBy = sanitizeSlug(groupPayload.createdBy || existing?.createdBy || '')
    const rawMod = sanitizeSlug(groupPayload.moderatorSlug || existing?.moderatorSlug || createdBy || self.slug)
    const moderatorSlug = rawMod && membersMap.has(rawMod) ? rawMod : (createdBy || self.slug)
    const activeThreadId = String(groupPayload.activeThreadId || existing?.activeThreadId || '').trim()
      || `thr_${nowMs.toString(36)}_${generateRandomHex(3)}`

    const room = {
      id: roomId,
      type: 'group',
      name: String(groupPayload.name || existing?.name || roomId).trim().slice(0, 80),
      peerSlug: '',
      groupSecret: String(groupPayload.groupSecret || existing?.groupSecret || ''),
      createdBy,
      moderatorSlug,
      activeThreadId,
      members: [...membersMap.values()],
      createdAt: existing?.createdAt || groupPayload.createdAt || nowMs,
      updatedAt: nowMs,
      unreadCount: existing?.unreadCount || 0,
      agentSessionId: existing?.agentSessionId || '',
      threadSessions: existing?.threadSessions && typeof existing.threadSessions === 'object'
        ? { ...existing.threadSessions }
        : {},
    }
    state.rooms[roomId] = room
    if (!Array.isArray(state.messages[roomId])) {
      state.messages[roomId] = []
    }
    persist()
    return room
  }

  function updateGroupModeration(roomId, { moderatorSlug } = {}, nowMs = Date.now()) {
    const room = state.rooms[roomId]
    if (!room || room.type !== 'group') {
      throw new Error(`Group room "${roomId}" not found`)
    }
    const memberSlugs = new Set((room.members || []).map((m) => m.slug))
    if (typeof moderatorSlug === 'string' && moderatorSlug.trim()) {
      const cleanMod = sanitizeSlug(moderatorSlug)
      if (cleanMod && memberSlugs.has(cleanMod)) {
        room.moderatorSlug = cleanMod
      }
    }
    room.updatedAt = nowMs
    persist()
    return room
  }

  function rotateRoomThread(roomId, { nextThreadId = '', nowMs = Date.now() } = {}) {
    const room = state.rooms[roomId]
    if (!room) {
      throw new Error(`Room "${roomId}" not found`)
    }
    const threadId = String(nextThreadId || '').trim()
      || `thr_${nowMs.toString(36)}_${generateRandomHex(3)}`
    room.activeThreadId = threadId
    room.updatedAt = nowMs
    persist()
    return { room, threadId }
  }

  function addMembersToGroup(roomId, memberSlugs = [], nowMs = Date.now()) {
    const room = state.rooms[roomId]
    if (!room || room.type !== 'group') {
      throw new Error(`Group room "${roomId}" not found`)
    }
    const membersMap = new Map(room.members.map((m) => [m.slug, m]))
    for (const raw of memberSlugs) {
      const s = sanitizeSlug(raw)
      if (!s || membersMap.has(s)) continue
      const peer = state.peers[s]
      if (!peer) {
        throw new Error(`Sandbox "${s}" is not paired yet`)
      }
      membersMap.set(s, {
        slug: peer.slug,
        ownerName: peer.ownerName,
        ownerEmail: peer.ownerEmail,
        role: peer.role || '',
        description: peer.description || '',
        endpointUrl: peer.endpointUrl,
      })
    }
    room.members = [...membersMap.values()]
    room.updatedAt = nowMs
    persist()
    return room
  }

  function resolveVerificationSecrets({ fromSlug, groupId }) {
    const secrets = []
    const peer = state.peers[sanitizeSlug(fromSlug)]
    if (peer?.sharedSecret) {
      secrets.push(peer.sharedSecret)
    }
    if (groupId && state.rooms[groupId]?.groupSecret) {
      secrets.push(state.rooms[groupId].groupSecret)
    }
    return secrets
  }

  function recordMessage(rawMsg, { isIncoming = false, nowMs = Date.now() } = {}) {
    const roomId = String(rawMsg?.roomId || '').trim()
    const room = state.rooms[roomId]
    if (!room) {
      throw new Error(`Room "${roomId}" does not exist`)
    }
    const list = state.messages[roomId] || []
    const msgId = String(rawMsg.id || `msg_${nowMs.toString(36)}_${generateRandomHex(4)}`)
    const existing = list.find((m) => m.id === msgId)
    if (existing) {
      return { message: existing, duplicate: true, wakeInfo: { wake: false, reason: 'duplicate' } }
    }

    const self = getSelf()
    const senderSlug = sanitizeSlug(rawMsg.sender?.slug || self.slug)
    const senderActor = ['human', 'agent', 'system'].includes(rawMsg.sender?.actor)
      ? rawMsg.sender.actor
      : 'human'
    const text = String(rawMsg.text ?? '').slice(0, 16000)
    const mentions = Array.isArray(rawMsg.mentions) ? rawMsg.mentions : extractMentions(text)
    const hop = typeof rawMsg.hop === 'number' && Number.isFinite(rawMsg.hop)
      ? Math.max(0, Math.trunc(rawMsg.hop))
      : 0
    const phase = rawMsg.phase === 'turn' ? 'turn' : ''
    const resolvedThreadId = String(rawMsg.threadId || room.activeThreadId || '').trim()

    const prelim = {
      id: msgId,
      roomId,
      threadId: resolvedThreadId,
      phase,
      sender: {
        slug: senderSlug,
        ownerName: String(rawMsg.sender?.ownerName || senderSlug).trim(),
        ownerEmail: String(rawMsg.sender?.ownerEmail || '').trim().toLowerCase(),
        actor: senderActor,
      },
      kind: ['chat', 'task', 'file', 'system'].includes(rawMsg.kind) ? rawMsg.kind : 'chat',
      text,
      mentions,
      hop,
      attachment: rawMsg.attachment && typeof rawMsg.attachment === 'object' ? { ...rawMsg.attachment } : null,
      delivery: rawMsg.delivery && typeof rawMsg.delivery === 'object'
        ? { ...rawMsg.delivery }
        : { deliveredTo: [], pendingPeers: [] },
      createdAt: Number(rawMsg.createdAt) > 0 ? Number(rawMsg.createdAt) : nowMs,
    }

    const wakeInfo = evaluateAgentWake(prelim, self.slug, maxAgentHops, room.type || 'pair', room)
    const message = {
      ...prelim,
      wakeAgent: wakeInfo.wake,
      wakeReason: wakeInfo.reason,
      ackedByAgent: !wakeInfo.wake,
    }

    list.push(message)
    if (list.length > maxMessagesPerRoom) {
      list.splice(0, list.length - maxMessagesPerRoom)
    }
    state.messages[roomId] = list
    room.updatedAt = message.createdAt
    if (isIncoming && senderSlug !== self.slug) {
      room.unreadCount = (room.unreadCount || 0) + 1
      if (state.peers[senderSlug]) {
        state.peers[senderSlug].lastSeenAt = nowMs
        state.peers[senderSlug].status = 'online'
      }
    }
    persist()
    return { message, duplicate: false, wakeInfo }
  }

  function updateMessageDelivery(roomId, msgId, delivery) {
    const list = state.messages[roomId] || []
    const item = list.find((m) => m.id === msgId)
    if (!item) return null
    item.delivery = {
      deliveredTo: Array.isArray(delivery.deliveredTo) ? delivery.deliveredTo : [],
      pendingPeers: Array.isArray(delivery.pendingPeers) ? delivery.pendingPeers : [],
    }
    persist()
    return item
  }

  function markRoomRead(roomId) {
    const room = state.rooms[roomId]
    if (!room) return false
    room.unreadCount = 0
    persist()
    return true
  }

  function setRoomAgentSessionId(roomId, sessionId, threadId = '') {
    const room = state.rooms[roomId]
    if (!room) return false
    if (threadId) {
      room.threadSessions = room.threadSessions && typeof room.threadSessions === 'object'
        ? room.threadSessions
        : {}
      room.threadSessions[threadId] = String(sessionId || '')
    } else {
      room.agentSessionId = String(sessionId || '')
    }
    persist()
    return true
  }

  function getRoomAgentSessionId(roomId, threadId = '') {
    const room = state.rooms[roomId]
    if (!room) return ''
    if (threadId && room.threadSessions && typeof room.threadSessions === 'object') {
      return room.threadSessions[threadId] || ''
    }
    return room.agentSessionId || ''
  }

  function getAgentInbox({ ack = false, roomId = '' } = {}) {
    const pending = []
    for (const [rId, list] of Object.entries(state.messages)) {
      if (roomId && rId !== roomId) continue
      for (const msg of list) {
        if (msg.wakeAgent && !msg.ackedByAgent) {
          pending.push(msg)
          if (ack) {
            msg.ackedByAgent = true
          }
        }
      }
    }
    if (ack && pending.length > 0) {
      persist()
    }
    return pending
  }

  function enqueueOutbox(entry) {
    state.outbox.push({
      id: `out_${Date.now().toString(36)}_${generateRandomHex(4)}`,
      createdAt: Date.now(),
      attempts: 0,
      ...entry,
    })
    if (state.outbox.length > 500) {
      state.outbox.splice(0, state.outbox.length - 500)
    }
    persist()
  }

  function listOutbox() {
    return [...state.outbox]
  }

  function removeOutboxItems(ids) {
    const idSet = new Set(ids)
    state.outbox = state.outbox.filter((item) => !idSet.has(item.id))
    persist()
  }

  function getSnapshot(nowMs = Date.now()) {
    const self = getSelf()
    const activeInvite = getActiveInvite(nowMs)
    const peers = Object.values(state.peers).map((p) => ({
      slug: p.slug,
      ownerName: p.ownerName,
      ownerEmail: p.ownerEmail,
      role: p.role || '',
      description: p.description || '',
      endpointUrl: p.endpointUrl,
      pairedAt: p.pairedAt,
      lastSeenAt: p.lastSeenAt,
      status: p.status || 'online',
    })).sort((a, b) => a.slug.localeCompare(b.slug))

    const rooms = Object.values(state.rooms).map((r) => ({
      id: r.id,
      type: r.type,
      name: r.name,
      peerSlug: r.peerSlug || '',
      createdBy: r.createdBy,
      moderatorSlug: r.type === 'group' ? (r.moderatorSlug || r.createdBy || '') : '',
      activeThreadId: r.activeThreadId || '',
      members: r.members,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      unreadCount: r.unreadCount || 0,
      agentSessionId: r.agentSessionId || '',
    })).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))

    return {
      self,
      activeInvite,
      peers,
      rooms,
      messages: state.messages,
      outboxCount: state.outbox.length,
      maxAgentHops,
    }
  }

  return {
    filePath,
    maxAgentHops,
    updateSelf,
    getSelf,
    updateSelfProfile,
    createPairCode,
    getActiveInvite,
    verifyAndConsumeInvite,
    upsertPairedPeer,
    removePeer,
    getPeer: (slug) => state.peers[sanitizeSlug(slug)] || null,
    getRoom: (roomId) => state.rooms[roomId] || null,
    createGroupRoom,
    upsertGroupRoom,
    updateGroupModeration,
    rotateRoomThread,
    addMembersToGroup,
    resolveVerificationSecrets,
    recordMessage,
    updateMessageDelivery,
    markRoomRead,
    setRoomAgentSessionId,
    getRoomAgentSessionId,
    getAgentInbox,
    enqueueOutbox,
    listOutbox,
    removeOutboxItems,
    getSnapshot,
  }
}
