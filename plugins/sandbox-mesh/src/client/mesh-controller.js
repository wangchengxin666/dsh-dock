import { resolveBrowserOriginUrl } from '../shared/protocol.js'

const STATE_API = 'api/sandbox-mesh.state'
const PROFILE_API = 'api/sandbox-mesh.profile'
const FILES_API = 'api/sandbox-mesh.files'
const PAIR_CODE_API = 'api/sandbox-mesh.pair-code'
const PAIR_CLAIM_API = 'api/sandbox-mesh.pair-claim'
const GROUP_CREATE_API = 'api/sandbox-mesh.group-create'
const GROUP_INVITE_API = 'api/sandbox-mesh.group-invite'
const GROUP_MODERATE_API = 'api/sandbox-mesh.group-moderate'
const GROUP_REMOVE_API = 'api/sandbox-mesh.group-remove'
const GROUP_LEAVE_API = 'api/sandbox-mesh.group-leave'
const GROUP_RENAME_API = 'api/sandbox-mesh.group-rename'
const ROOM_REMOVE_API = 'api/sandbox-mesh.room-remove'
const NEW_TOPIC_API = 'api/sandbox-mesh.new-topic'
const SEND_API = 'api/sandbox-mesh.send'
const SEND_FILE_API = 'api/sandbox-mesh.send-file'
const FILE_DOWNLOAD_API = 'api/sandbox-mesh.file-download'
const FILE_UPLOAD_API = 'api/sandbox-mesh.file-upload'
const MARK_READ_API = 'api/sandbox-mesh.mark-read'
const PEER_REMOVE_API = 'api/sandbox-mesh.peer-remove'
const PEER_PING_API = 'api/sandbox-mesh.peer-ping'
const TASK_CREATE_API = 'api/sandbox-mesh.task-create'
const TASK_UPDATE_API = 'api/sandbox-mesh.task-update'
const APPROVAL_DECIDE_API = 'api/sandbox-mesh.approval-decide'

function defaultSnapshotState() {
  return {
    self: {
      slug: 'sandbox',
      ownerName: 'sandbox',
      ownerEmail: '',
      role: '',
      description: '',
      instructions: '',
      publicOrigin: 'http://localhost:9000',
      basePath: '/s/sandbox',
      meshPort: 4090,
      endpointUrl: 'http://localhost:9000/s/sandbox/p/4090',
    },
    activeInvite: null,
    peers: [],
    rooms: [],
    messages: {},
    tasks: {},
    activeStatuses: {},
    outboxCount: 0,
    maxAgentHops: 8,
  }
}

export function createMeshController({
  fetchImpl = globalThis.fetch,
} = {}) {
  let state = defaultSnapshotState()
  let selectedRoomId = ''
  let workspaceFiles = []
  let busy = false
  let errorText = ''
  let statusKey = ''
  let statusSeq = 0
  let lastRev = ''
  let syncInFlight = null
  let disposed = false
  let followSyncTimer = null
  let statusClearTimer = null
  const listeners = new Set()

  function notify() {
    if (disposed) return
    for (const fn of listeners) {
      fn()
    }
  }

  function setTransientStatus(key, durationMs = 3600) {
    if (statusClearTimer) {
      clearTimeout(statusClearTimer)
      statusClearTimer = null
    }
    statusKey = key
    statusSeq += 1
    if (key && durationMs > 0 && typeof setTimeout === 'function') {
      const seqSnapshot = statusSeq
      statusClearTimer = setTimeout(() => {
        statusClearTimer = null
        if (!disposed && statusSeq === seqSnapshot && statusKey) {
          statusKey = ''
          notify()
        }
      }, durationMs)
      if (typeof statusClearTimer?.unref === 'function') statusClearTimer.unref()
    }
  }

  function applyServerState(nextState) {
    if (!nextState || typeof nextState !== 'object') return
    const browserOrigin = typeof window !== 'undefined' ? (window.location?.origin || '') : ''
    const rawSelf = nextState.self && typeof nextState.self === 'object' ? nextState.self : {}
    const normalizedSelf = {
      ...defaultSnapshotState().self,
      ...rawSelf,
      endpointUrl: resolveBrowserOriginUrl(rawSelf.endpointUrl || '', browserOrigin),
    }
    const rawInvite = nextState.activeInvite && typeof nextState.activeInvite === 'object'
      ? {
          ...nextState.activeInvite,
          inviteUri: resolveBrowserOriginUrl(nextState.activeInvite.inviteUri || '', browserOrigin),
        }
      : null

    const prevPeersCount = Array.isArray(state.peers) ? state.peers.length : 0
    const prevHadInvite = Boolean(state.activeInvite)

    state = {
      ...defaultSnapshotState(),
      ...nextState,
      self: normalizedSelf,
      activeInvite: rawInvite,
      peers: Array.isArray(nextState.peers) ? nextState.peers : [],
      rooms: Array.isArray(nextState.rooms) ? nextState.rooms : [],
      messages: nextState.messages && typeof nextState.messages === 'object' ? nextState.messages : {},
      tasks: nextState.tasks && typeof nextState.tasks === 'object' ? nextState.tasks : {},
      activeStatuses: nextState.activeStatuses && typeof nextState.activeStatuses === 'object' ? nextState.activeStatuses : {},
    }
    if (!selectedRoomId && state.rooms.length > 0) {
      selectedRoomId = state.rooms[0].id
    } else if (selectedRoomId && !state.rooms.some((r) => r.id === selectedRoomId)) {
      selectedRoomId = state.rooms[0]?.id || ''
    }

    if (prevHadInvite && !rawInvite && state.peers.length > prevPeersCount) {
      setTransientStatus('statusPaired')
    }
  }

  async function requestJson(url, options = {}) {
    if (typeof fetchImpl !== 'function') {
      throw new Error('fetch is unavailable')
    }
    const res = await fetchImpl(url, {
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `HTTP ${res.status}`)
    }
    return data
  }

  async function syncFromHost() {
    if (syncInFlight) return syncInFlight
    syncInFlight = (async () => {
      try {
        const url = lastRev ? `${STATE_API}?rev=${encodeURIComponent(lastRev)}` : STATE_API
        const data = await requestJson(url, { method: 'GET' })
        if (data.rev !== undefined && data.rev !== null) {
          lastRev = String(data.rev)
        }
        if (data.unchanged === true) {
          if (errorText) {
            errorText = ''
            notify()
          }
          return state
        }
        if (data.state) {
          applyServerState(data.state)
        }
        errorText = ''
        notify()
        return data.state
      } catch (err) {
        errorText = err?.message || String(err)
        notify()
        return null
      } finally {
        syncInFlight = null
      }
    })()
    return syncInFlight
  }

  async function searchFiles(query = '') {
    try {
      const q = encodeURIComponent(String(query || '').trim())
      const data = await requestJson(`${FILES_API}?q=${q}`, { method: 'GET' })
      workspaceFiles = Array.isArray(data.files) ? data.files : []
      notify()
      return workspaceFiles
    } catch {
      return workspaceFiles
    }
  }

  async function saveProfile({ ownerName, role, description, instructions }) {
    busy = true
    errorText = ''
    notify()
    try {
      const data = await requestJson(PROFILE_API, {
        method: 'POST',
        body: JSON.stringify({ ownerName, role, description, instructions }),
      })
      if (data.state) applyServerState(data.state)
      busy = false
      setTransientStatus('statusProfileSaved')
      notify()
      return data
    } catch (err) {
      busy = false
      errorText = err?.message || String(err)
      notify()
      return null
    }
  }

  async function generatePairCode() {
    busy = true
    errorText = ''
    notify()
    try {
      const data = await requestJson(PAIR_CODE_API, { method: 'POST', body: '{}' })
      if (data.state) applyServerState(data.state)
      busy = false
      notify()
      return state.activeInvite || data.invite
    } catch (err) {
      busy = false
      errorText = err?.message || String(err)
      notify()
      return null
    }
  }

  async function claimPairCode(invite) {
    busy = true
    errorText = ''
    notify()
    try {
      const data = await requestJson(PAIR_CLAIM_API, {
        method: 'POST',
        body: JSON.stringify({ invite }),
      })
      if (data.state) applyServerState(data.state)
      if (data.room?.id) selectedRoomId = data.room.id
      busy = false
      setTransientStatus('statusPaired')
      notify()
      return data
    } catch (err) {
      busy = false
      errorText = err?.message || String(err)
      notify()
      return null
    }
  }

  async function createGroup({ name, memberSlugs, moderatorSlug = '' }) {
    busy = true
    errorText = ''
    notify()
    try {
      const data = await requestJson(GROUP_CREATE_API, {
        method: 'POST',
        body: JSON.stringify({ name, memberSlugs, moderatorSlug }),
      })
      if (data.state) applyServerState(data.state)
      if (data.room?.id) selectedRoomId = data.room.id
      busy = false
      setTransientStatus('statusGroupCreated')
      notify()
      return data
    } catch (err) {
      busy = false
      errorText = err?.message || String(err)
      notify()
      return null
    }
  }

  async function inviteToGroup({ roomId, memberSlugs }) {
    busy = true
    errorText = ''
    notify()
    try {
      const data = await requestJson(GROUP_INVITE_API, {
        method: 'POST',
        body: JSON.stringify({ roomId, memberSlugs }),
      })
      if (data.state) applyServerState(data.state)
      busy = false
      notify()
      return data
    } catch (err) {
      busy = false
      errorText = err?.message || String(err)
      notify()
      return null
    }
  }

  async function updateGroupModeration({ roomId, moderatorSlug }) {
    busy = true
    errorText = ''
    notify()
    try {
      const data = await requestJson(GROUP_MODERATE_API, {
        method: 'POST',
        body: JSON.stringify({
          roomId: roomId || selectedRoomId,
          moderatorSlug,
        }),
      })
      if (data.state) applyServerState(data.state)
      busy = false
      notify()
      return data
    } catch (err) {
      busy = false
      errorText = err?.message || String(err)
      notify()
      return null
    }
  }

  async function removeFromGroup({ roomId, slug }) {
    busy = true
    errorText = ''
    notify()
    try {
      const data = await requestJson(GROUP_REMOVE_API, {
        method: 'POST',
        body: JSON.stringify({
          roomId: roomId || selectedRoomId,
          slug,
        }),
      })
      if (data.state) applyServerState(data.state)
      busy = false
      notify()
      return data
    } catch (err) {
      busy = false
      errorText = err?.message || String(err)
      notify()
      return null
    }
  }

  async function leaveGroup(roomId) {
    busy = true
    errorText = ''
    notify()
    try {
      const data = await requestJson(GROUP_LEAVE_API, {
        method: 'POST',
        body: JSON.stringify({ roomId: roomId || selectedRoomId }),
      })
      if (data.state) applyServerState(data.state)
      busy = false
      setTransientStatus('statusGroupLeft')
      notify()
      return data
    } catch (err) {
      busy = false
      errorText = err?.message || String(err)
      notify()
      return null
    }
  }

  async function removeRoom(roomId) {
    busy = true
    errorText = ''
    notify()
    try {
      const data = await requestJson(ROOM_REMOVE_API, {
        method: 'POST',
        body: JSON.stringify({ roomId: roomId || selectedRoomId }),
      })
      if (data.state) applyServerState(data.state)
      busy = false
      setTransientStatus('statusRoomRemoved')
      notify()
      return data
    } catch (err) {
      busy = false
      errorText = err?.message || String(err)
      notify()
      return null
    }
  }

  async function startNewTopic(roomId) {
    busy = true
    errorText = ''
    notify()
    try {
      const data = await requestJson(NEW_TOPIC_API, {
        method: 'POST',
        body: JSON.stringify({ roomId: roomId || selectedRoomId }),
      })
      if (data.state) applyServerState(data.state)
      busy = false
      if (!data.alreadyFresh) {
        setTransientStatus('statusNewTopic')
      }
      notify()
      return data
    } catch (err) {
      busy = false
      errorText = err?.message || String(err)
      notify()
      return null
    }
  }

  async function sendMessage({ roomId, text, files = [], kind = 'chat' }) {
    busy = true
    errorText = ''
    notify()
    try {
      const data = await requestJson(SEND_API, {
        method: 'POST',
        body: JSON.stringify({
          roomId: roomId || selectedRoomId,
          text,
          files,
          kind,
          actor: 'human',
        }),
      })
      if (data.state) applyServerState(data.state)
      busy = false
      setTransientStatus('statusSent', 2000)
      notify()
      if (followSyncTimer) clearTimeout(followSyncTimer)
      if (typeof setTimeout === 'function') {
        followSyncTimer = setTimeout(() => {
          followSyncTimer = null
          if (!disposed) void syncFromHost()
        }, 450)
        if (typeof followSyncTimer?.unref === 'function') followSyncTimer.unref()
      }
      return data
    } catch (err) {
      busy = false
      errorText = err?.message || String(err)
      void syncFromHost()
      notify()
      return null
    }
  }

  async function sendFile({ roomId, filePath, text = '' }) {
    busy = true
    errorText = ''
    notify()
    try {
      const data = await requestJson(SEND_FILE_API, {
        method: 'POST',
        body: JSON.stringify({
          roomId: roomId || selectedRoomId,
          filePath,
          text,
          actor: 'human',
        }),
      })
      if (data.state) applyServerState(data.state)
      busy = false
      setTransientStatus('statusFileSent', 2500)
      notify()
      return data
    } catch (err) {
      busy = false
      errorText = err?.message || String(err)
      notify()
      return null
    }
  }

  async function selectRoom(roomId) {
    selectedRoomId = roomId
    notify()
    try {
      const data = await requestJson(MARK_READ_API, {
        method: 'POST',
        body: JSON.stringify({ roomId }),
      })
      if (data.state) applyServerState(data.state)
      notify()
    } catch {
      // Ignore read-mark failure
    }
  }

  async function removePeer(slug) {
    busy = true
    errorText = ''
    notify()
    try {
      const data = await requestJson(PEER_REMOVE_API, {
        method: 'POST',
        body: JSON.stringify({ slug }),
      })
      if (data.state) applyServerState(data.state)
      busy = false
      setTransientStatus(data.remoteNotified ? 'statusUnpaired' : 'statusUnpairedOffline', 4500)
      notify()
      return data
    } catch (err) {
      busy = false
      errorText = err?.message || String(err)
      notify()
      return null
    }
  }

  async function pingPeer(slug) {
    busy = true
    errorText = ''
    notify()
    try {
      const data = await requestJson(PEER_PING_API, {
        method: 'POST',
        body: JSON.stringify({ slug }),
      })
      if (data.state) applyServerState(data.state)
      busy = false
      if (data.reachable) {
        setTransientStatus('statusPingOnline')
      } else if (data.status === 'unpaired-by-peer') {
        setTransientStatus('statusPingUnpaired', 5000)
      } else {
        setTransientStatus('statusPingOffline', 4500)
      }
      notify()
      return data
    } catch (err) {
      busy = false
      errorText = err?.message || String(err)
      notify()
      return null
    }
  }

  async function renameGroup({ roomId, name }) {
    busy = true
    errorText = ''
    notify()
    try {
      const data = await requestJson(GROUP_RENAME_API, {
        method: 'POST',
        body: JSON.stringify({
          roomId: roomId || selectedRoomId,
          name,
        }),
      })
      if (data.state) applyServerState(data.state)
      busy = false
      setTransientStatus('statusGroupRenamed')
      notify()
      return data
    } catch (err) {
      busy = false
      errorText = err?.message || String(err)
      notify()
      return null
    }
  }

  async function uploadFile({ roomId, fileName, contentBase64, text = '' }) {
    busy = true
    errorText = ''
    notify()
    try {
      const data = await requestJson(FILE_UPLOAD_API, {
        method: 'POST',
        body: JSON.stringify({
          roomId: roomId || selectedRoomId,
          fileName,
          contentBase64,
          text,
        }),
      })
      if (data.state) applyServerState(data.state)
      busy = false
      setTransientStatus('statusFileSent', 2500)
      notify()
      return data
    } catch (err) {
      busy = false
      errorText = err?.message || String(err)
      notify()
      return null
    }
  }

  function getAttachmentUrl(roomId, msgId, { inline = false } = {}) {
    const params = new URLSearchParams()
    params.set('roomId', String(roomId || ''))
    params.set('msgId', String(msgId || ''))
    if (inline) params.set('inline', '1')
    return `${FILE_DOWNLOAD_API}?${params.toString()}`
  }

  async function fetchAttachmentPreview({ roomId, msgId }) {
    if (typeof fetchImpl !== 'function') {
      return { ok: false, error: 'fetch is unavailable' }
    }
    try {
      const url = getAttachmentUrl(roomId, msgId, { inline: true })
      const res = await fetchImpl(url, { method: 'GET', credentials: 'same-origin' })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        return { ok: false, error: errData.error || `HTTP ${res.status}` }
      }
      const kind = (res.headers?.get?.('x-mesh-preview-kind') || '').toLowerCase()
      const contentType = res.headers?.get?.('content-type') || 'application/octet-stream'
      if (kind === 'image' || contentType.startsWith('image/')) {
        return { ok: true, kind: 'image', contentType, url }
      }
      if (kind === 'markdown' || kind === 'text' || contentType.startsWith('text/')) {
        const text = await res.text()
        return { ok: true, kind: kind || 'text', contentType, text }
      }
      return { ok: true, kind: 'binary', contentType, url }
    } catch (err) {
      return { ok: false, error: err?.message || String(err) }
    }
  }

  async function pingAllPeers() {
    const slugs = (state.peers || []).map((p) => p.slug).filter(Boolean)
    if (slugs.length === 0) return []
    busy = true
    errorText = ''
    notify()
    try {
      const results = await Promise.all(
        slugs.map((slug) =>
          requestJson(PEER_PING_API, {
            method: 'POST',
            body: JSON.stringify({ slug }),
          }).catch((err) => ({ ok: false, slug, error: err?.message || String(err) })),
        ),
      )
      await syncFromHost()
      busy = false
      const anyOnline = results.some((r) => r?.reachable)
      setTransientStatus(anyOnline ? 'statusPingOnline' : 'statusPingOffline', 3500)
      notify()
      return results
    } catch (err) {
      busy = false
      errorText = err?.message || String(err)
      notify()
      return []
    }
  }

  async function createTask({
    roomId,
    threadId = '',
    title,
    description = '',
    assigneeSlug = '',
    priority = 'medium',
    approvalRequired = false,
    approvalPrompt = '',
    notifyAssignees = true,
  }) {
    busy = true
    errorText = ''
    notify()
    try {
      const data = await requestJson(TASK_CREATE_API, {
        method: 'POST',
        body: JSON.stringify({
          roomId: roomId || selectedRoomId,
          threadId,
          title,
          description,
          assigneeSlug,
          priority,
          approvalRequired,
          approvalPrompt,
          notifyAssignees,
        }),
      })
      if (data.state) applyServerState(data.state)
      busy = false
      setTransientStatus('statusTaskCreated')
      notify()
      return data
    } catch (err) {
      busy = false
      errorText = err?.message || String(err)
      notify()
      return null
    }
  }

  async function updateTask({ roomId, taskId, status, assigneeSlug, priority, summary, artifacts, title, description }) {
    busy = true
    errorText = ''
    notify()
    try {
      const data = await requestJson(TASK_UPDATE_API, {
        method: 'POST',
        body: JSON.stringify({
          roomId: roomId || selectedRoomId,
          taskId,
          status,
          assigneeSlug,
          priority,
          summary,
          artifacts,
          title,
          description,
        }),
      })
      if (data.state) applyServerState(data.state)
      busy = false
      setTransientStatus('statusTaskUpdated')
      notify()
      return data
    } catch (err) {
      busy = false
      errorText = err?.message || String(err)
      notify()
      return null
    }
  }

  async function decideApproval({ roomId, taskId, decision, comment = '' }) {
    busy = true
    errorText = ''
    notify()
    try {
      const data = await requestJson(APPROVAL_DECIDE_API, {
        method: 'POST',
        body: JSON.stringify({
          roomId: roomId || selectedRoomId,
          taskId,
          decision,
          comment,
        }),
      })
      if (data.state) applyServerState(data.state)
      busy = false
      setTransientStatus(decision === 'approved' ? 'statusApprovalApproved' : 'statusApprovalRejected', 4200)
      notify()
      return data
    } catch (err) {
      busy = false
      errorText = err?.message || String(err)
      notify()
      return null
    }
  }

  function getUnreadSummary() {
    const totalUnread = (state.rooms || []).reduce((sum, r) => sum + (Number(r.unreadCount) || 0), 0)
    const activeCount = Object.values(state.activeStatuses || {}).reduce(
      (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
      0,
    )
    const pendingApprovals = Object.values(state.tasks || {}).reduce(
      (sum, list) => sum + (Array.isArray(list)
        ? list.filter((t) => t && t.status !== 'cancelled' && t.approvalRequired && t.approvalStatus === 'pending').length
        : 0),
      0,
    )
    return { totalUnread, activeCount, pendingApprovals }
  }

  function clearNotice() {
    errorText = ''
    setTransientStatus('', 0)
    notify()
  }

  function setError(msg) {
    errorText = String(msg || '')
    notify()
  }

  return {
    getSnapshot() {
      return {
        state,
        selectedRoomId,
        workspaceFiles,
        busy,
        errorText,
        statusKey,
        statusSeq,
      }
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },
    syncFromHost,
    searchFiles,
    saveProfile,
    generatePairCode,
    claimPairCode,
    createGroup,
    inviteToGroup,
    updateGroupModeration,
    renameGroup,
    removeFromGroup,
    leaveGroup,
    removeRoom,
    startNewTopic,
    sendMessage,
    sendFile,
    uploadFile,
    getAttachmentUrl,
    fetchAttachmentPreview,
    selectRoom,
    removePeer,
    pingPeer,
    pingAllPeers,
    createTask,
    updateTask,
    decideApproval,
    getUnreadSummary,
    clearNotice,
    setError,
    dispose() {
      disposed = true
      if (followSyncTimer) {
        clearTimeout(followSyncTimer)
        followSyncTimer = null
      }
      if (statusClearTimer) {
        clearTimeout(statusClearTimer)
        statusClearTimer = null
      }
      listeners.clear()
    },
  }
}
