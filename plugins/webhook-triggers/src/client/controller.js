const WH_STATE_API = 'api/webhook-triggers.state'
const WH_RULE_SAVE_API = 'api/webhook-triggers.rule-save'
const WH_RULE_DELETE_API = 'api/webhook-triggers.rule-delete'
const WH_RULE_ROTATE_API = 'api/webhook-triggers.rule-rotate-secret'
const WH_REPLAY_API = 'api/webhook-triggers.replay'
const WH_TEST_FIRE_API = 'api/webhook-triggers.test-fire'

const EMPTY_STATE = {
  webhooks_base_url: '',
  listener_port: 4095,
  rules: [],
  deliveries: [],
  updated_at: null,
}

export function createWebhookController({ fetchImpl = globalThis.fetch } = {}) {
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
      rules: Array.isArray(next.rules) ? next.rules : [],
      deliveries: Array.isArray(next.deliveries) ? next.deliveries : [],
    }
  }

  async function syncFromHost() {
    loading = true
    emit()
    const res = await requestJson(WH_STATE_API, { method: 'GET' })
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
    notifyCopied() { showToast('ok', 'toastCopied') },
    saveRule(rule) { return mutate(WH_RULE_SAVE_API, rule, 'toastSaved') },
    deleteRule({ id, slug }) { return mutate(WH_RULE_DELETE_API, { id, slug }, 'toastDeleted') },
    rotateSecret({ id, slug }) { return mutate(WH_RULE_ROTATE_API, { id, slug }, 'toastRotated') },
    replayDelivery(deliveryId) { return mutate(WH_REPLAY_API, { deliveryId }, 'toastReplayed') },
    testFire({ id, slug, payload }) { return mutate(WH_TEST_FIRE_API, { id, slug, payload }, 'toastTestFired') },
    dispose() {
      disposed = true
      if (toastTimer) clearTimeout(toastTimer)
      listeners.clear()
    },
  }
}
