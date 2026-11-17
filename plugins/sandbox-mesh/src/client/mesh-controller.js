const STATE_API = 'api/sandbox-mesh.state'
const PROFILE_API = 'api/sandbox-mesh.profile'
const FILES_API = 'api/sandbox-mesh.files'
const PAIR_CODE_API = 'api/sandbox-mesh.pair-code'
const PAIR_CLAIM_API = 'api/sandbox-mesh.pair-claim'
const GROUP_CREATE_API = 'api/sandbox-mesh.group-create'
const GROUP_INVITE_API = 'api/sandbox-mesh.group-invite'
const GROUP_MODERATE_API = 'api/sandbox-mesh.group-moderate'
const NEW_TOPIC_API = 'api/sandbox-mesh.new-topic'
const SEND_API = 'api/sandbox-mesh.send'
const SEND_FILE_API = 'api/sandbox-mesh.send-file'
const MARK_READ_API = 'api/sandbox-mesh.mark-read'
const PEER_REMOVE_API = 'api/sandbox-mesh.peer-remove'

function defaultSnapshotState() {
  return {
    self: {
      slug: 'sandbox',
      ownerName: 'sandbox',
      ownerEmail: '',
      publicOrigin: 'http://localhost:9000',
      basePath: '/s/sandbox',
      meshPort: 4090,
      endpointUrl: 'http://localhost:9000/s/sandbox/p/4090',
    },
    activeInvite: null,
    peers: [],
    rooms: [],
    messages: {},
    activeStatuses: {},
    outboxCount: 0,
    maxAgentHops: 4,
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
  let disposed = false
  let followSyncTimer = null
  const listeners = new Set()

  function notify() {
    if (disposed) return
    for (const fn of listeners) {
      fn()
    }
  }

  function applyServerState(nextState) {
    if (!nextState || typeof nextState !== 'object') return
    state = {
      ...defaultSnapshotState(),
      ...nextState,
      peers: Array.isArray(nextState.peers) ? nextState.peers : [],
      rooms: Array.isArray(nextState.rooms) ? nextState.rooms : [],
      messages: nextState.messages && typeof nextState.messages === 'object' ? nextState.messages : {},
      activeStatuses: nextState.activeStatuses && typeof nextState.activeStatuses === 'object' ? nextState.activeStatuses : {},
    }
    if (!selectedRoomId && state.rooms.length > 0) {
      selectedRoomId = state.rooms[0].id
    } else if (selectedRoomId && !state.rooms.some((r) => r.id === selectedRoomId)) {
      selectedRoomId = state.rooms[0]?.id || ''
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
    try {
      const data = await requestJson(STATE_API, { method: 'GET' })
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
    }
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

  async function saveProfile({ ownerName, role, description }) {
    busy = true
    errorText = ''
    notify()
    try {
      const data = await requestJson(PROFILE_API, {
        method: 'POST',
        body: JSON.stringify({ ownerName, role, description }),
      })
      if (data.state) applyServerState(data.state)
      busy = false
      statusKey = 'statusProfileSaved'
      statusSeq += 1
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
      return data.invite
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
      statusKey = 'statusPaired'
      statusSeq += 1
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
      statusKey = 'statusGroupCreated'
      statusSeq += 1
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
        statusKey = 'statusNewTopic'
        statusSeq += 1
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
      statusKey = 'statusSent'
      statusSeq += 1
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
      statusKey = 'statusFileSent'
      statusSeq += 1
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
      notify()
      return data
    } catch (err) {
      busy = false
      errorText = err?.message || String(err)
      notify()
      return null
    }
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
    startNewTopic,
    sendMessage,
    sendFile,
    selectRoom,
    removePeer,
    dispose() {
      disposed = true
      if (followSyncTimer) {
        clearTimeout(followSyncTimer)
        followSyncTimer = null
      }
      listeners.clear()
    },
  }
}
