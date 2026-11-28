export const APP_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,47}$/
export const SERVICE_NAME_RE = /^[a-z0-9_-]{1,48}$/

export function normalizeAppName(raw) {
  return String(raw || '').trim().toLowerCase()
}

export function normalizeServiceName(raw) {
  return String(raw || '').trim()
}
