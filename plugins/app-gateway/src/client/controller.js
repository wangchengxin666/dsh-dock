const AG_STATE_API = 'api/app-gateway.state'
const AG_APP_EXPOSE_API = 'api/app-gateway.app-expose'
const AG_APP_AUTH_API = 'api/app-gateway.app-auth'
const AG_APP_UNEXPOSE_API = 'api/app-gateway.app-unexpose'
const AG_SERVICE_ACTION_API = 'api/app-gateway.service-action'
const AG_SERVICE_ADD_API = 'api/app-gateway.service-add'
const AG_SERVICE_REMOVE_API = 'api/app-gateway.service-remove'
const AG_SERVICE_LOGS_API = 'api/app-gateway.service-logs'

const EMPTY_STATE = {
  gateway_auth_mode: 'none',
  public_origin: '',
  exposed_apps: [],
  user_services: [],
  updated_at: null,
}

export function createAppGatewayController({ fetchImpl = globalThis.fetch } = {}) {
  let state = { ...EMPTY_STATE }
  let loading = false
  let busy = false
  let toast = null
  let toastTimer = null
  let disposed = false
  const listeners = new Set()

  function emit() {
    if (disposed) return
    for (const fn of listeners) { try { fn() } catch {} }
  }

  function showToast(kind, key, detail = '') {
    if (toastTimer) clearTimeout(toastTimer)
    toast = { kind, key, detail }
    emit()
    toastTimer = setTimeout(() => { toast = null; emit() }, 3200)
  }

  async function requestJson(url, options = {}) {
    if (typeof fetchImpl !== 'function') return { ok: false, error: 'fetch unavailable' }
    try {
      const resp = await fetchImpl(url, {
        credentials: 'same-origin',
        ...options,
        headers: { 'content-type': 'application/json', ...(options.headers || {}) },
      })
      const data = await resp.json().catch(() => null)
      if (!resp.ok || !data || data.ok === false) {
        return { ok: false, error: (data && data.error) || `HTTP ${resp.status}`, ...(data || {}) }
      }
      return data
    } catch (err) {
      return { ok: false, error: err?.message || 'Request failed' }
    }
  }

  function applyState(next) {
    if (!next || typeof next !== 'object') return
    state = {
      ...EMPTY_STATE,
      ...next,
      exposed_apps: Array.isArray(next.exposed_apps) ? next.exposed_apps : [],
      user_services: Array.isArray(next.user_services) ? next.user_services : [],
    }
  }

  async function syncFromHost() {
    loading = true
    emit()
    const res = await requestJson(AG_STATE_API, { method: 'GET' })
    loading = false
    if (res.ok && res.state) applyState(res.state)
    emit()
    return res
  }

  async function mutate(url, payload, toastKey) {
    busy = true
    emit()
    const res = await requestJson(url, { method: 'POST', body: JSON.stringify(payload) })
    busy = false
    if (res.ok) {
      if (res.state) applyState(res.state)
      else await syncFromHost()
      if (toastKey) showToast('ok', toastKey)
    } else {
      showToast('err', 'toastError', res.error || '')
    }
    emit()
    return res
  }

  return {
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    getSnapshot() { return { state, loading, busy, toast } },
    syncFromHost,
    exposeApp({ name, port, authMode = 'public' }) { return mutate(AG_APP_EXPOSE_API, { name, port, authMode }, 'toastAppExposed') },
    setAppAuth({ name, authMode }) { return mutate(AG_APP_AUTH_API, { name, authMode }, 'toastAppAuthUpdated') },
    unexposeApp({ name }) { return mutate(AG_APP_UNEXPOSE_API, { name }, 'toastAppRemoved') },
    controlService({ name, action }) { return mutate(AG_SERVICE_ACTION_API, { name, action }, 'toastServiceOk') },
    addService({ name, command }) { return mutate(AG_SERVICE_ADD_API, { name, command }, 'toastServiceOk') },
    removeService({ name }) { return mutate(AG_SERVICE_REMOVE_API, { name }, 'toastServiceOk') },
    async readServiceLogs(name) {
      const res = await requestJson(`${AG_SERVICE_LOGS_API}?name=${encodeURIComponent(name)}&tail=150`, { method: 'GET' })
      return res.ok ? (res.logs || '') : (res.error || 'Failed to read logs')
    },
    dispose() {
      disposed = true
      if (toastTimer) clearTimeout(toastTimer)
      listeners.clear()
    },
  }
}
