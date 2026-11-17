import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const DEFAULT_SIGNATURE_WINDOW_MS = 60 * 1000
export const DEFAULT_PAIR_RATE_LIMIT = 5

export function generateInviteToken() {
  return randomBytes(18).toString('base64url')
}

export function generateRandomHex(bytes = 32) {
  return randomBytes(bytes).toString('hex')
}

export function sha256Hex(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input ?? ''), 'utf8')
  return createHash('sha256').update(buf).digest('hex')
}

export function deriveSharedSecret(inviteToken, initiatorKey, responderKey) {
  return createHmac('sha256', String(inviteToken))
    .update(`${initiatorKey}:${responderKey}`)
    .digest('hex')
}

export function constantTimeEqualString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export function computeMeshSignature({ method, path, timestamp, nonce, body, secret }) {
  const cleanMethod = String(method || 'POST').toUpperCase()
  const cleanPath = String(path || '/').split('?')[0]
  const bodyHash = sha256Hex(body ?? '')
  const canonical = `${cleanMethod}\n${cleanPath}\n${timestamp}\n${nonce}\n${bodyHash}`
  return createHmac('sha256', String(secret)).update(canonical).digest('hex')
}

export function buildSignedHeaders({
  method = 'POST',
  path = '/',
  body = '',
  secret,
  fromSlug,
  groupId = '',
  timestamp = Date.now(),
  nonce = randomBytes(12).toString('hex'),
}) {
  const tsStr = String(timestamp)
  const signature = computeMeshSignature({
    method,
    path,
    timestamp: tsStr,
    nonce,
    body,
    secret,
  })
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'x-mesh-from': String(fromSlug || ''),
    'x-mesh-timestamp': tsStr,
    'x-mesh-nonce': nonce,
    'x-mesh-signature': signature,
  }
  if (groupId) {
    headers['x-mesh-group'] = String(groupId)
  }
  return headers
}

export function createReplayGuard({ windowMs = DEFAULT_SIGNATURE_WINDOW_MS, maxEntries = 2000 } = {}) {
  const seen = new Map()

  function prune(nowMs) {
    for (const [key, expiresAt] of seen.entries()) {
      if (expiresAt <= nowMs) {
        seen.delete(key)
      }
    }
    while (seen.size > maxEntries) {
      const oldestKey = seen.keys().next().value
      if (oldestKey === undefined) break
      seen.delete(oldestKey)
    }
  }

  return {
    checkAndRecord(scope, nonce, nowMs = Date.now()) {
      prune(nowMs)
      const composite = `${scope}:${nonce}`
      const existing = seen.get(composite)
      if (existing && existing > nowMs) {
        return false
      }
      seen.set(composite, nowMs + windowMs * 2)
      return true
    },
  }
}

export function createRateLimiter({ windowMs = 60 * 1000, maxAttempts = DEFAULT_PAIR_RATE_LIMIT } = {}) {
  const buckets = new Map()

  return {
    allow(key = 'global', nowMs = Date.now()) {
      const list = (buckets.get(key) || []).filter((ts) => nowMs - ts < windowMs)
      if (list.length >= maxAttempts) {
        buckets.set(key, list)
        return false
      }
      list.push(nowMs)
      buckets.set(key, list)
      return true
    },
    reset(key = 'global') {
      buckets.delete(key)
    },
  }
}

export function verifySignedRequest({
  method,
  path,
  headers,
  body,
  resolveSecret,
  replayGuard,
  nowMs = Date.now(),
  windowMs = DEFAULT_SIGNATURE_WINDOW_MS,
}) {
  const read = (k) => {
    if (!headers) return ''
    if (typeof headers.get === 'function') return String(headers.get(k) || '').trim()
    const val = headers[k] ?? headers[k.toLowerCase()]
    return String(Array.isArray(val) ? val[0] : val || '').trim()
  }

  const fromSlug = read('x-mesh-from').toLowerCase()
  const groupId = read('x-mesh-group')
  const tsRaw = read('x-mesh-timestamp')
  const nonce = read('x-mesh-nonce')
  const signature = read('x-mesh-signature')

  if (!fromSlug || !tsRaw || !nonce || !signature) {
    return { ok: false, status: 401, error: 'Missing mesh authentication headers' }
  }

  const ts = Number(tsRaw)
  if (!Number.isFinite(ts) || Math.abs(nowMs - ts) > windowMs) {
    return { ok: false, status: 401, error: 'Mesh request timestamp expired or out of bounds' }
  }

  if ( nonce.length < 8 || nonce.length > 128) {
    return { ok: false, status: 401, error: 'Invalid mesh nonce' }
  }

  const candidateSecrets = resolveSecret({ fromSlug, groupId })
  const secrets = Array.isArray(candidateSecrets)
    ? candidateSecrets.filter(Boolean)
    : candidateSecrets
      ? [candidateSecrets]
      : []

  if (secrets.length === 0) {
    return { ok: false, status: 401, error: `Unknown or unpaired sandbox "${fromSlug}"` }
  }

  let matched = false
  for (const secret of secrets) {
    const expected = computeMeshSignature({
      method,
      path,
      timestamp: tsRaw,
      nonce,
      body,
      secret,
    })
    if (constantTimeEqualString(signature, expected)) {
      matched = true
      break
    }
  }

  if (!matched) {
    return { ok: false, status: 401, error: 'Invalid mesh HMAC signature' }
  }

  if (replayGuard && !replayGuard.checkAndRecord(fromSlug, nonce, nowMs)) {
    return { ok: false, status: 401, error: 'Replayed mesh request nonce rejected' }
  }

  return { ok: true, fromSlug, groupId }
}
