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
  deriveEcdhSharedSecret,
  deriveSharedSecret,
  generateEcdhKeyPair,
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

function isLoopbackOrigin(url) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(String(url || '').trim())
}

function detectRequestPublicOrigin(headers) {
  if (!headers) return ''
  const originHeader = readHeader(headers, 'origin')
  if (/^https?:\/\/[^/\s]+$/i.test(originHeader)) {
    try {
      const parsed = new URL(originHeader)
      const hostLower = parsed.hostname.toLowerCase()
      if (
        !isLoopbackOrigin(parsed.origin)
        && hostLower !== 'dsh-gateway'
        && hostLower !== 'dsh-manager'
        && !hostLower.startsWith('dsh-sbx-')
      ) {
        return parsed.origin
      }
    } catch {}
  }

  const forwardedHost = readHeader(headers, 'x-forwarded-host').split(',')[0].trim()
  const hostHeader = forwardedHost || readHeader(headers, 'host').split(',')[0].trim()
  if (!hostHeader) return ''
  const protoRaw = readHeader(headers, 'x-forwarded-proto').split(',')[0].trim().toLowerCase()
  const proto = protoRaw === 'https' ? 'https' : 'http'
  try {
    const parsed = new URL(`${proto}://${hostHeader}`)
    const hostLower = parsed.hostname.toLowerCase()
    if (
      !isLoopbackOrigin(parsed.origin)
      && hostLower !== 'dsh-gateway'
      && hostLower !== 'dsh-manager'
      && !hostLower.startsWith('dsh-sbx-')
    ) {
      return parsed.origin
    }
  } catch {}
  return ''
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
  const configuredOrigin = String(
    config.publicOrigin
    || env.SANDBOX_PUBLIC_ORIGIN
    || info.public_origin
    || '',
  ).trim().replace(/\/+$/, '')
  const detectedOrigin = !config.publicOrigin && (!configuredOrigin || isLoopbackOrigin(configuredOrigin))
    ? detectRequestPublicOrigin(headers)
    : ''
  const publicOrigin = detectedOrigin || configuredOrigin || 'http://localhost:9000'

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
    detectedOrigin,
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
  let revision = 1
  const messageListeners = new Set()

  function persist() {
    revision += 1
    mkdirSync(dirname(filePath), { recursive: true })
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}.tmp`
    // State holds pairwise / group secrets: keep it owner-readable only.
    writeFileSync(tmpPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    renameSync(tmpPath, filePath)
  }

  function onMessage(listener) {
    if (typeof listener !== 'function') return () => {}
    messageListeners.add(listener)
    return () => { messageListeners.delete(listener) }
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
    const effectivePublicOrigin = (
      !config.publicOrigin
      && !resolved.detectedOrigin
      && isLoopbackOrigin(resolved.publicOrigin)
      && prev.publicOrigin
      && !isLoopbackOrigin(prev.publicOrigin)
    )
      ? prev.publicOrigin
      : (resolved.publicOrigin || prev.publicOrigin || 'http://localhost:9000')
    const effectiveBasePath = resolved.basePath || prev.basePath || `/s/${resolved.slug}`
    const effectiveMeshPort = resolved.meshPort || prev.meshPort || DEFAULT_MESH_PORT
    const effectiveEndpointUrl = String(
      config.endpointUrl
      || `${effectivePublicOrigin}${effectiveBasePath}/p/${effectiveMeshPort}`,
    ).trim().replace(/\/+$/, '')

    const nextSelf = {
      slug: resolved.slug || prev.slug || 'sandbox',
      ownerName: prev.customOwnerName || resolved.ownerName || prev.ownerName || resolved.slug,
      customOwnerName: prev.customOwnerName || '',
      ownerEmail: resolved.ownerEmail || prev.ownerEmail || '',
      role: String(prev.role || config.role || '').trim(),
      description: String(prev.description || config.description || '').trim(),
      publicOrigin: effectivePublicOrigin,
      basePath: effectiveBasePath,
      meshPort: effectiveMeshPort,
      endpointUrl: effectiveEndpointUrl || resolved.endpointUrl || prev.endpointUrl || '',
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
    const self = getSelf()
    const formatted = formatPairInvite({
      slug: self.slug,
      token: inv.token,
      endpointUrl: self.endpointUrl,
    })
    return {
      codeId: inv.codeId,
      shortCode: inv.shortCode || formatted.shortCode,
      inviteUri: formatted.inviteUri || inv.inviteUri,
      expiresAt: inv.expiresAt,
    }
  }

  function verifyAndConsumeInvite({ token, peerProfile, peerKey, peerPublicKey, nowMs = Date.now() }) {
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

    let sharedSecret = ''
    let hostPublicKey = ''
    if (typeof peerPublicKey === 'string' && peerPublicKey.trim()) {
      try {
        const kp = generateEcdhKeyPair()
        sharedSecret = deriveEcdhSharedSecret(inv.token, kp.privateKey, peerPublicKey.trim())
        hostPublicKey = kp.publicKeyB64
      } catch {
        return { ok: false, status: 400, error: 'Invalid ECDH peerPublicKey' }
      }
    } else {
      sharedSecret = deriveSharedSecret(inv.token, inv.hostKey, String(peerKey || ''))
    }
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
      hostPublicKey,
      sharedSecret,
    }
  }

  function safeHttpUrl(raw) {
    const str = typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : ''
    return /^https?:\/\//i.test(str) ? str.slice(0, 500) : ''
  }

  function upsertPairedPeer({ peerProfile, sharedSecret, nowMs = Date.now() }) {
    const self = getSelf()
    const slug = sanitizeSlug(peerProfile?.slug)
    if (!slug) throw new Error('Peer slug is required')

    const endpointUrl = safeHttpUrl(
      normalizeEndpointUrl(
        peerProfile?.endpointUrl,
        slug,
        self.publicOrigin,
        self.meshPort,
      ),
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
    const wasUnpaired = Boolean(existingRoom?.unpaired)
    const defaultThreadId = (!wasUnpaired && existingRoom?.activeThreadId)
      ? existingRoom.activeThreadId
      : `thr_${nowMs.toString(36)}_${generateRandomHex(3)}`
    const room = {
      id: rId,
      type: 'pair',
      name: `${peer.ownerName} (${peer.slug})`,
      peerSlug: slug,
      groupSecret: '',
      createdBy: existingRoom?.createdBy || self.slug,
      activeThreadId: defaultThreadId,
      unpaired: false,
      unpairedBy: '',
      unpairedAt: 0,
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
      agentSessionId: wasUnpaired ? '' : (existingRoom?.agentSessionId || ''),
      threadSessions: !wasUnpaired && existingRoom?.threadSessions && typeof existingRoom.threadSessions === 'object'
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

  function setPeerStatus(rawSlug, status, nowMs = Date.now()) {
    const slug = sanitizeSlug(rawSlug)
    const peer = slug ? state.peers[slug] : null
    if (!peer) return false
    const cleanStatus = String(status || 'online').trim() || 'online'
    const changed = peer.status !== cleanStatus
    peer.status = cleanStatus
    if (cleanStatus === 'online') {
      peer.lastSeenAt = nowMs
    }
    if (changed) persist()
    return true
  }

  function touchPeer(rawSlug, { status = 'online', peerProfile = null, nowMs = Date.now() } = {}) {
    const slug = sanitizeSlug(rawSlug)
    const peer = slug ? state.peers[slug] : null
    if (!peer) return null
    peer.status = String(status || 'online').trim() || 'online'
    peer.lastSeenAt = nowMs
    if (peerProfile && typeof peerProfile === 'object') {
      if (typeof peerProfile.ownerName === 'string' && peerProfile.ownerName.trim()) {
        peer.ownerName = peerProfile.ownerName.trim().slice(0, 80)
      }
      if (typeof peerProfile.role === 'string') {
        peer.role = peerProfile.role.trim().slice(0, 120)
      }
      if (typeof peerProfile.description === 'string') {
        peer.description = peerProfile.description.trim().slice(0, 600)
      }
    }
    persist()
    return peer
  }

  function removePeer(rawSlug) {
    const slug = sanitizeSlug(rawSlug)
    if (!slug) return false
    const hadPeer = Boolean(state.peers[slug])
    const rId = pairRoomId(getSelf().slug, slug)
    const hadRoom = Boolean(state.rooms[rId])
    if (!hadPeer && !hadRoom) return false
    delete state.peers[slug]
    delete state.rooms[rId]
    delete state.messages[rId]
    state.outbox = state.outbox.filter(
      (item) => item.targetSlug !== slug && item.payload?.message?.roomId !== rId,
    )
    persist()
    return true
  }

  function handleRemoteUnpair(rawSlug, { nowMs = Date.now() } = {}) {
    const slug = sanitizeSlug(rawSlug)
    if (!slug) {
      return { found: false, prevPeer: null, pairRoomId: '', ownedGroupIds: [], peerOwnedGroupIds: [] }
    }
    const self = getSelf()
    const prevPeer = state.peers[slug] ? { ...state.peers[slug] } : null
    const rId = pairRoomId(self.slug, slug)
    const pairRoom = state.rooms[rId] || null
    const ownedGroupIds = []
    const peerOwnedGroupIds = []

    for (const grp of Object.values(state.rooms)) {
      if (!grp || grp.type !== 'group') continue
      if (grp.createdBy === self.slug && Array.isArray(grp.members) && grp.members.some((m) => m.slug === slug)) {
        ownedGroupIds.push(grp.id)
      } else if (grp.createdBy === slug) {
        peerOwnedGroupIds.push(grp.id)
      }
    }

    let changed = false
    if (state.peers[slug]) {
      delete state.peers[slug]
      changed = true
    }
    const beforeOutboxLen = state.outbox.length
    state.outbox = state.outbox.filter((item) => item.targetSlug !== slug)
    if (state.outbox.length !== beforeOutboxLen) changed = true

    if (pairRoom) {
      pairRoom.unpaired = true
      pairRoom.unpairedBy = slug
      pairRoom.unpairedAt = nowMs
      pairRoom.updatedAt = nowMs
      for (const msg of state.messages[rId] || []) {
        if (!msg.ackedByAgent) msg.ackedByAgent = true
      }
      changed = true
    }

    if (changed) persist()
    return {
      found: Boolean(prevPeer || pairRoom),
      prevPeer,
      pairRoomId: pairRoom ? rId : '',
      ownedGroupIds,
      peerOwnedGroupIds,
    }
  }

  function markRoomUnpaired(roomId, { bySlug = '', nowMs = Date.now() } = {}) {
    const room = state.rooms[roomId]
    if (!room) return false
    room.unpaired = true
    room.unpairedBy = sanitizeSlug(bySlug)
    room.unpairedAt = nowMs
    room.updatedAt = nowMs
    if (room.type === 'group') {
      room.groupSecret = ''
    }
    for (const msg of state.messages[roomId] || []) {
      if (!msg.ackedByAgent) msg.ackedByAgent = true
    }
    state.outbox = state.outbox.filter(
      (item) => item.groupId !== roomId && item.payload?.message?.roomId !== roomId,
    )
    persist()
    return true
  }

  function removeRoom(roomId) {
    const cleanId = String(roomId || '').trim()
    if (!cleanId || !state.rooms[cleanId]) return false
    delete state.rooms[cleanId]
    delete state.messages[cleanId]
    state.outbox = state.outbox.filter(
      (item) => item.groupId !== cleanId && item.payload?.message?.roomId !== cleanId,
    )
    persist()
    return true
  }

  function leaveGroupRoom(roomId, rawSlug = '', nowMs = Date.now()) {
    const room = state.rooms[roomId]
    if (!room || room.type !== 'group') {
      throw new Error(`Group room "${roomId}" not found`)
    }
    const self = getSelf()
    const targetSlug = sanitizeSlug(rawSlug || self.slug)
    if (!targetSlug || targetSlug === self.slug) {
      removeRoom(roomId)
      return { left: true, selfLeft: true, room: null }
    }
    const nextMembers = (room.members || []).filter((m) => m.slug !== targetSlug)
    if (nextMembers.length === (room.members || []).length) {
      return { left: false, selfLeft: false, room }
    }
    room.members = nextMembers
    if (room.moderatorSlug === targetSlug) {
      room.moderatorSlug = room.createdBy || self.slug
    }
    room.updatedAt = nowMs
    state.outbox = state.outbox.filter((item) => !(item.groupId === roomId && item.targetSlug === targetSlug))
    persist()
    return { left: true, selfLeft: false, room }
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

  /**
   * Insert or merge a group room. With `remote: true` (payload received from a peer) the merge is
   * conservative: an existing room's groupSecret / createdBy cannot be overwritten by peers, and
   * existing members' metadata (notably endpointUrl) are preserved. Only an authenticated creator
   * (`creatorAuthority: true`) may rotate `groupSecret` or remove members (`syncRemovals: true`),
   * and only `authoritative: true` (creator or current moderator via pairwise HMAC) may change
   * group name or moderator.
   */
  function upsertGroupRoom(
    groupPayload,
    { remote = false, authoritative = false, creatorAuthority = false, nowMs = Date.now() } = {},
  ) {
    if (!groupPayload || typeof groupPayload !== 'object') {
      throw new Error('Invalid group payload')
    }
    const roomId = String(groupPayload.id || '').trim()
    if (!/^grp_[a-zA-Z0-9_-]{1,96}$/.test(roomId)) {
      throw new Error('Invalid group id')
    }
    const existing = state.rooms[roomId]
    if (existing && existing.type !== 'group') {
      throw new Error('Invalid group id')
    }
    const replaceMembers = !remote || (creatorAuthority && groupPayload.syncRemovals === true)
    const existingMembersMap = new Map()
    for (const m of existing?.members || []) {
      const s = sanitizeSlug(m.slug)
      if (s) existingMembersMap.set(s, { ...m, slug: s })
    }
    const membersMap = new Map(replaceMembers ? [] : existingMembersMap)
    for (const m of Array.isArray(groupPayload.members) ? groupPayload.members : []) {
      const s = sanitizeSlug(m?.slug)
      if (!s) continue
      const knownPeer = state.peers[s]
      const prevMember = existingMembersMap.get(s)
      if (remote && prevMember && !replaceMembers) continue
      const pick = (field) => String(
        (remote
          ? (knownPeer?.[field] || prevMember?.[field] || m[field])
          : (m[field] || knownPeer?.[field] || prevMember?.[field])) || '',
      ).trim()
      membersMap.set(s, {
        slug: s,
        ownerName: (pick('ownerName') || s).slice(0, 80),
        ownerEmail: pick('ownerEmail').toLowerCase().slice(0, 200),
        role: pick('role').slice(0, 120),
        description: pick('description').slice(0, 600),
        endpointUrl: safeHttpUrl(pick('endpointUrl')),
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

    const createdBy = sanitizeSlug(
      (remote && existing ? existing.createdBy : '') || groupPayload.createdBy || existing?.createdBy || '',
    )
    const requestedMod = (!remote || !existing || authoritative)
      ? sanitizeSlug(groupPayload.moderatorSlug || '')
      : ''
    const rawMod = requestedMod || sanitizeSlug(existing?.moderatorSlug || createdBy || self.slug)
    const moderatorSlug = rawMod && membersMap.has(rawMod) ? rawMod : (createdBy || self.slug)
    const activeThreadId = String(groupPayload.activeThreadId || existing?.activeThreadId || '').trim().slice(0, 96)
      || `thr_${nowMs.toString(36)}_${generateRandomHex(3)}`
    const nextGroupSecret = String(groupPayload.groupSecret || '')
    const groupSecret = !remote || !existing?.groupSecret
      ? (nextGroupSecret || existing?.groupSecret || '')
      : (creatorAuthority && nextGroupSecret.length >= 16 ? nextGroupSecret : existing.groupSecret)
    const nextName = (!remote || !existing || authoritative)
      ? String(groupPayload.name || existing?.name || roomId).trim().slice(0, 80)
      : String(existing.name || roomId).trim().slice(0, 80)

    const room = {
      id: roomId,
      type: 'group',
      name: nextName,
      peerSlug: '',
      groupSecret,
      createdBy,
      moderatorSlug,
      activeThreadId,
      unpaired: false,
      unpairedBy: '',
      unpairedAt: 0,
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

  /** Remove a member from a group and rotate `groupSecret` so the removed sandbox cannot authenticate. */
  function removeGroupMember(roomId, rawSlug, nowMs = Date.now()) {
    const room = state.rooms[roomId]
    if (!room || room.type !== 'group') {
      throw new Error(`Group room "${roomId}" not found`)
    }
    const self = getSelf()
    const targetSlug = sanitizeSlug(rawSlug)
    if (!targetSlug) throw new Error('Target member slug is required')
    if (targetSlug === self.slug || targetSlug === room.createdBy) {
      throw new Error('Cannot remove the group creator')
    }
    if (room.createdBy && self.slug !== room.createdBy) {
      throw new Error('Only the group creator can remove members')
    }
    const nextMembers = (room.members || []).filter((m) => m.slug !== targetSlug)
    if (nextMembers.length === (room.members || []).length) {
      throw new Error(`Sandbox "${targetSlug}" is not a member of this group`)
    }
    room.members = nextMembers
    if (room.moderatorSlug === targetSlug) {
      room.moderatorSlug = room.createdBy || self.slug
    }
    room.groupSecret = generateRandomHex(32)
    room.updatedAt = nowMs
    state.outbox = state.outbox.filter((item) => !(item.groupId === roomId && item.targetSlug === targetSlug))
    persist()
    return room
  }

  function resolveVerificationSecrets({ fromSlug, groupId }) {
    const secrets = []
    const cleanFrom = sanitizeSlug(fromSlug)
    const peer = state.peers[cleanFrom]
    if (peer?.sharedSecret) {
      secrets.push({ secret: peer.sharedSecret, scope: 'pair' })
    }
    // A shared group secret is only accepted from a sandbox that is a current member of that group.
    const room = groupId ? state.rooms[groupId] : null
    if (
      room?.type === 'group'
      && !room.unpaired
      && room.groupSecret
      && Array.isArray(room.members)
      && room.members.some((m) => m.slug === cleanFrom)
    ) {
      secrets.push({ secret: room.groupSecret, scope: 'group' })
    }
    return secrets
  }

  function isRoomMember(roomId, rawSlug) {
    const room = state.rooms[roomId]
    const slug = sanitizeSlug(rawSlug)
    if (!room || !slug || room.unpaired) return false
    if (room.type === 'pair') {
      return roomId === pairRoomId(getSelf().slug, slug)
    }
    return Array.isArray(room.members) && room.members.some((m) => m.slug === slug)
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

    const wakeInfo = room.unpaired
      ? { wake: false, reason: 'room-unpaired' }
      : evaluateAgentWake(prelim, self.slug, maxAgentHops, room.type || 'pair', room)
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
    for (const listener of messageListeners) {
      try { listener(message) } catch {}
    }
    return { message, duplicate: false, wakeInfo }
  }

  function hasMessage(roomId, msgId) {
    if (!roomId || !msgId) return false
    return (state.messages[roomId] || []).some((m) => m.id === msgId)
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

  function findRoomBySessionId(sessionId) {
    const sid = String(sessionId || '').trim()
    if (!sid) return null
    for (const room of Object.values(state.rooms)) {
      if (room.agentSessionId === sid) return { roomId: room.id, threadId: '' }
      if (room.threadSessions && typeof room.threadSessions === 'object') {
        for (const [tid, mappedSid] of Object.entries(room.threadSessions)) {
          if (mappedSid === sid) return { roomId: room.id, threadId: tid }
        }
      }
    }
    return null
  }

  function ackAgentMessage(roomId, msgId) {
    const list = state.messages[roomId]
    if (!Array.isArray(list)) return false
    const msg = list.find((m) => m.id === msgId)
    if (!msg || msg.ackedByAgent) return false
    msg.ackedByAgent = true
    persist()
    return true
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

  function enqueueOutboxBatch(entries = []) {
    if (!Array.isArray(entries) || entries.length === 0) return
    const now = Date.now()
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue
      const { secret: _omitSecret, ...rest } = entry
      state.outbox.push({
        id: `out_${now.toString(36)}_${generateRandomHex(4)}`,
        createdAt: now,
        attempts: 0,
        nextRetryAt: now,
        ...rest,
      })
    }
    if (state.outbox.length > 500) {
      state.outbox.splice(0, state.outbox.length - 500)
    }
    persist()
  }

  function enqueueOutbox(entry) {
    enqueueOutboxBatch([entry])
  }

  function listOutbox() {
    return [...state.outbox]
  }

  function removeOutboxItems(ids) {
    const idSet = new Set(ids)
    state.outbox = state.outbox.filter((item) => !idSet.has(item.id))
    persist()
  }

  function updateOutbox(doneIds = [], retryUpdates = new Map(), { maxAttempts = 12, maxAgeMs = 24 * 60 * 60 * 1000, nowMs = Date.now() } = {}) {
    const doneSet = new Set(doneIds)
    const next = []
    let changed = doneIds.length > 0 || retryUpdates.size > 0
    for (const item of state.outbox) {
      if (doneSet.has(item.id)) continue
      const upd = retryUpdates.get(item.id)
      if (upd) {
        const attempts = Number(upd.attempts) || ((item.attempts || 0) + 1)
        const age = nowMs - (Number(item.createdAt) || nowMs)
        if (attempts >= maxAttempts || age > maxAgeMs) {
          changed = true
          continue
        }
        next.push({
          ...item,
          attempts,
          nextRetryAt: upd.nextRetryAt,
          lastError: String(upd.lastError || '').slice(0, 240),
        })
      } else {
        const age = nowMs - (Number(item.createdAt) || nowMs)
        if (age > maxAgeMs) {
          changed = true
          continue
        }
        next.push(item)
      }
    }
    state.outbox = next
    if (changed) persist()
    return next.length
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
      unpaired: Boolean(r.unpaired),
      unpairedBy: r.unpairedBy || '',
      unpairedAt: r.unpairedAt || 0,
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
    getRevision: () => revision,
    bumpRevision: () => { revision += 1 },
    onMessage,
    updateSelf,
    getSelf,
    updateSelfProfile,
    createPairCode,
    getActiveInvite,
    verifyAndConsumeInvite,
    upsertPairedPeer,
    setPeerStatus,
    touchPeer,
    removePeer,
    handleRemoteUnpair,
    markRoomUnpaired,
    removeRoom,
    leaveGroupRoom,
    getPeer: (slug) => state.peers[sanitizeSlug(slug)] || null,
    getRoom: (roomId) => state.rooms[roomId] || null,
    createGroupRoom,
    upsertGroupRoom,
    updateGroupModeration,
    rotateRoomThread,
    addMembersToGroup,
    removeGroupMember,
    resolveVerificationSecrets,
    isRoomMember,
    hasMessage,
    recordMessage,
    updateMessageDelivery,
    markRoomRead,
    setRoomAgentSessionId,
    getRoomAgentSessionId,
    findRoomBySessionId,
    ackAgentMessage,
    getAgentInbox,
    enqueueOutbox,
    enqueueOutboxBatch,
    listOutbox,
    removeOutboxItems,
    updateOutbox,
    getSnapshot,
  }
}
