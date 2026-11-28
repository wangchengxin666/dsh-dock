/**
 * Gateway Authentication Provider for DSH (>= 0.2.3).
 *
 * Admits HTTP document, /api/* RPC, and /api/remote.mux WebSocket requests
 * forwarded by the container's Caddy reverse proxy when Basic Auth or
 * ForwardAuth (oauth2-proxy / OIDC) is enabled, carrying the container-local
 * X-DSH-Gateway-Auth secret plus an authenticated user identity header.
 */
import crypto from 'node:crypto'

export const name = 'dsh-gateway-auth'
export const inject = ['connection', 'connection.authentication']

function readHeader(headers, key) {
  if (!headers) return ''
  if (typeof headers.get === 'function') {
    return (headers.get(key) || '').trim()
  }
  const value = headers[key.toLowerCase()]
  if (Array.isArray(value)) return String(value[0] || '').trim()
  return typeof value === 'string' ? value.trim() : ''
}

export function apply(ctx) {
  const expected = (process.env.DSH_GATEWAY_AUTH_SECRET || '').trim()
  if (!expected) {
    ctx.logger?.warn?.('dsh-gateway-auth: DSH_GATEWAY_AUTH_SECRET is empty; provider inactive')
    return
  }

  const expectedBuf = Buffer.from(expected, 'utf8')
  const peer = ctx.connection.createPeer({ principal: { kind: 'owner' } })

  ctx.connection.authentication.register({
    authenticate(request) {
      const provided = readHeader(request?.headers, 'x-dsh-gateway-auth')
      if (!provided) return undefined

      const providedBuf = Buffer.from(provided, 'utf8')
      if (providedBuf.length !== expectedBuf.length) return undefined
      if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) return undefined

      const user =
        readHeader(request?.headers, 'x-forwarded-user') ||
        readHeader(request?.headers, 'x-auth-request-user') ||
        readHeader(request?.headers, 'x-auth-request-email')
      if (!user) return undefined

      return peer
    },
  })

  ctx.logger?.info?.('dsh-gateway-auth: registered gateway authentication provider')
}
