const ENDPOINT_REL = 'api/workspace-user.current'

export function extractSlugFromLocation(pathname) {
  const match = String(pathname || '').match(/^\/s\/([^/?#]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function normalizeName(value, email) {
  if (typeof value !== 'string') return ''
  const cleaned = value.trim()
  if (!cleaned) return ''
  if (email && cleaned.toLowerCase() === email.toLowerCase()) return ''
  return cleaned
}

export function mergeIdentitySources({ headerData, managerData, slugHint = '' }) {
  const viewerEmail = normalizeEmail(managerData?.email) || normalizeEmail(headerData?.viewerEmail)
  const ownerEmail = normalizeEmail(managerData?.sandbox?.owner_email)
    || normalizeEmail(headerData?.ownerEmail)
    || viewerEmail
  const viewerName = normalizeName(managerData?.display_name, viewerEmail)
    || normalizeName(headerData?.viewerName, viewerEmail)
  const ownerName = normalizeName(managerData?.sandbox?.owner_display_name, ownerEmail)
    || normalizeName(headerData?.ownerName, ownerEmail)
    || (viewerEmail && ownerEmail && viewerEmail === ownerEmail ? viewerName : '')

  const isAdmin = typeof managerData?.admin === 'boolean'
    ? managerData.admin
    : Boolean(headerData?.isAdmin)

  const sandboxSlug = String(managerData?.sandbox?.slug || headerData?.sandboxSlug || slugHint || '').trim()
  const authMode = typeof managerData?.auth_mode === 'string' ? managerData.auth_mode : 'unknown'
  const isInspectingOther = Boolean(isAdmin && viewerEmail && ownerEmail && viewerEmail !== ownerEmail)

  return {
    status: viewerEmail || viewerName ? 'ready' : 'anonymous',
    viewerEmail,
    viewerName,
    isAdmin,
    ownerEmail,
    ownerName,
    sandboxSlug,
    authMode,
    isInspectingOther,
  }
}

export async function fetchWorkspaceIdentity(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') {
    return mergeIdentitySources({ headerData: null, managerData: null })
  }

  const slugHint = typeof window !== 'undefined'
    ? extractSlugFromLocation(window.location?.pathname)
    : ''

  const authMeUrl = slugHint
    ? `/api/auth/me?slug=${encodeURIComponent(slugHint)}`
    : '/api/auth/me'

  const [headerRes, managerRes] = await Promise.allSettled([
    fetchImpl(ENDPOINT_REL, { credentials: 'include', cache: 'no-store' })
      .then(async (res) => (res.ok ? res.json() : null)),
    fetchImpl(authMeUrl, { credentials: 'include', cache: 'no-store' })
      .then(async (res) => (res.ok ? res.json() : null)),
  ])

  const headerData = headerRes.status === 'fulfilled' ? headerRes.value : null
  const managerData = managerRes.status === 'fulfilled' ? managerRes.value : null
  return mergeIdentitySources({ headerData, managerData, slugHint })
}

export function formatDisplayName(name, email, fallbackLabel) {
  if (name) return name
  if (email) return email.split('@', 1)[0] || email
  return fallbackLabel
}

export function avatarInitials(name, email) {
  const source = (name || email || '?').trim()
  if (!source) return '?'
  if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(source)) {
    return Array.from(source)[0] || '?'
  }
  const tokens = source.split(/[\s._-]+/).filter(Boolean)
  if (tokens.length >= 2) {
    return `${tokens[0][0]}${tokens[1][0]}`.toUpperCase()
  }
  return source.slice(0, 2).toUpperCase()
}
