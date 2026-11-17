export const name = 'workspace-user'

export const ENDPOINT_PATH = '/api/workspace-user.current'

function readHeader(headers, key) {
  if (!headers) return ''
  if (typeof headers.get === 'function') {
    return String(headers.get(key) || '').trim()
  }
  const lowerKey = key.toLowerCase()
  for (const [entryKey, value] of Object.entries(headers)) {
    if (entryKey.toLowerCase() === lowerKey && value != null) {
      return String(Array.isArray(value) ? value[0] : value).trim()
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

function extractSlugFromPath(mountPath) {
  const match = String(mountPath || '').match(/\/s\/([^/?#]+)/)
  return match ? match[1] : ''
}

/**
 * Resolve current viewer and sandbox owner metadata from ForwardAuth headers
 * with sandbox environment variables as fallback.
 */
export function buildIdentityPayload(headers, env = process.env) {
  const viewerEmail = (
    readHeader(headers, 'x-auth-request-email')
    || readHeader(headers, 'x-forwarded-user')
    || String(env.DSH_OWNER_EMAIL || '').trim()
  ).toLowerCase()
  const ownerEmail = (
    readHeader(headers, 'x-sandbox-owner')
    || String(env.DSH_OWNER_EMAIL || '').trim()
    || viewerEmail
  ).toLowerCase()

  const rawViewerName = readHeader(headers, 'x-auth-request-name')
  const rawOwnerName = readHeader(headers, 'x-sandbox-owner-name')
  const rawAdmin = readHeader(headers, 'x-auth-request-admin').toLowerCase()

  const viewerName = decodeHeaderValue(rawViewerName)
  const ownerName = decodeHeaderValue(rawOwnerName)
  const isAdmin = rawAdmin === 'true'
  const hasExtendedHeaders = Boolean(rawAdmin || rawViewerName || rawOwnerName)
  const hasForwardedIdentity = Boolean(
    readHeader(headers, 'x-auth-request-email')
    || readHeader(headers, 'x-forwarded-user')
    || readHeader(headers, 'x-sandbox-owner'),
  )

  return {
    source: hasForwardedIdentity ? 'headers' : 'env',
    viewerEmail,
    viewerName,
    isAdmin,
    ownerEmail,
    ownerName,
    sandboxSlug: String(env.SANDBOX_SLUG || '').trim() || extractSlugFromPath(env.DSH_MOUNT),
    hasExtendedHeaders,
  }
}

export function apply(ctx) {
  ctx.inject(['connection'], ({ connection }) => {
    const unregister = connection.fetch.register({
      path: ENDPOINT_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch(request) {
        const payload = buildIdentityPayload(request.headers)
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
          },
        })
      },
    })
    ctx.effect(() => unregister, 'workspace-user: register identity endpoint')
  })
}
