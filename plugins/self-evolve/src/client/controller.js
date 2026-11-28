const SE_STATE_API = 'api/self-evolve.state'
const SE_SKILL_SAVE_API = 'api/self-evolve.skill-save'
const SE_SKILL_DELETE_API = 'api/self-evolve.skill-delete'
const SE_LESSON_ADD_API = 'api/self-evolve.lesson-add'
const SE_ROLLBACK_API = 'api/self-evolve.rollback'

const EMPTY_STATE = {
  skills_dir: '',
  skills: [],
  entries: [],
  stats: { skills_count: 0, evolutions_count: 0, verified_count: 0, rolled_back_count: 0 },
  updated_at: null,
}

export function createSelfEvolveController({ fetchImpl = globalThis.fetch } = {}) {
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
    toastTimer = setTimeout(() => { toast = null; emit() }, 3400)
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
      skills: Array.isArray(next.skills) ? next.skills : [],
      entries: Array.isArray(next.entries) ? next.entries : [],
      stats: next.stats || EMPTY_STATE.stats,
    }
  }

  async function syncFromHost() {
    loading = true
    emit()
    const res = await requestJson(SE_STATE_API, { method: 'GET' })
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
      if (res.state) applyState(res.state)
      showToast('err', 'toastError', res.error || '')
    }
    emit()
    return res
  }

  return {
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    getSnapshot() { return { state, loading, busy, toast } },
    syncFromHost,
    saveSkill(payload) { return mutate(SE_SKILL_SAVE_API, payload, 'toastSaved') },
    deleteSkill({ slug, reason }) { return mutate(SE_SKILL_DELETE_API, { slug, reason }, 'toastDeleted') },
    recordLesson(payload) { return mutate(SE_LESSON_ADD_API, payload, 'toastLessonSaved') },
    rollbackEvolution(evolutionId) { return mutate(SE_ROLLBACK_API, { evolutionId }, 'toastRolledBack') },
    dispose() {
      disposed = true
      if (toastTimer) clearTimeout(toastTimer)
      listeners.clear()
    },
  }
}
