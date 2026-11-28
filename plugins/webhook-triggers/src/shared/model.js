export const HOOK_SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,47}$/
export const VALID_AUTH_MODES = ['hmac_sha256', 'bearer', 'both', 'open']
export const VALID_SESSION_MODES = ['new', 'pinned']

export function normalizeSlug(raw) {
  return String(raw || '').trim().toLowerCase()
}

export function lookupPath(obj, dotPath) {
  if (!obj || typeof obj !== 'object' || !dotPath) return ''
  let cur = obj
  for (const part of String(dotPath).split('.')) {
    if (cur == null || typeof cur !== 'object' || !(part in cur)) return ''
    cur = cur[part]
  }
  if (cur == null) return ''
  if (typeof cur === 'object') {
    try { return JSON.stringify(cur) } catch { return '' }
  }
  return String(cur)
}

export function renderPromptTemplate(template, vars = {}) {
  const source = String(template || '').trim()
  if (!source) {
    return [
      `Webhook event triggered: ${vars.hook?.name || vars.hook?.slug || 'unknown'} (/hooks/${vars.hook?.slug || ''})`,
      vars.delivery?.id ? `Delivery ID: ${vars.delivery.id}` : '',
      vars.payload_path ? `Full raw payload saved at: ${vars.payload_path}` : '',
      vars.payload_preview ? `Payload preview:\n\`\`\`json\n${vars.payload_preview}\n\`\`\`` : '',
    ].filter(Boolean).join('\n\n')
  }

  return source.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, expr) => {
    if (expr === 'payload_path') return String(vars.payload_path || '')
    if (expr === 'payload_preview') return String(vars.payload_preview || '')
    if (expr === 'hook.slug') return String(vars.hook?.slug || '')
    if (expr === 'hook.name') return String(vars.hook?.name || '')
    if (expr === 'delivery.id') return String(vars.delivery?.id || '')
    if (expr.startsWith('payload.')) return lookupPath(vars.payload, expr.slice('payload.'.length))
    if (expr.startsWith('headers.')) return lookupPath(vars.headers, expr.slice('headers.'.length).toLowerCase())
    return lookupPath(vars, expr)
  })
}
