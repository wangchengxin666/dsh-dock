import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import http from 'node:http'

const MAX_BODY_BYTES = 2 * 1024 * 1024

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(body)
}

function constantTimeEqualsHexOrUtf8(aStr, bStr) {
  if (!aStr || !bStr) return false
  const aBuf = Buffer.from(String(aStr), 'utf8')
  const bBuf = Buffer.from(String(bStr), 'utf8')
  if (aBuf.length !== bBuf.length) return false
  return timingSafeEqual(aBuf, bBuf)
}

export function verifyWebhookRequest(rule, headers, rawBodyBuffer) {
  const mode = rule.auth_mode || 'hmac_sha256'
  if (mode === 'open') return { ok: true }

  const secret = String(rule.secret || '')
  if (!secret) return { ok: false, error: 'Rule secret is not configured' }

  const authHeader = String(headers['authorization'] || '')
  const bearerProvided = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : String(headers['x-webhook-secret'] || '').trim()

  const sigHeader = String(
    headers['x-hub-signature-256'] ||
    headers['x-webhook-signature'] ||
    '',
  ).trim()

  const bearerValid = bearerProvided ? constantTimeEqualsHexOrUtf8(bearerProvided, secret) : false

  let hmacValid = false
  if (sigHeader.toLowerCase().startsWith('sha256=')) {
    const providedHex = sigHeader.slice(7).trim().toLowerCase()
    const expectedHex = createHmac('sha256', secret).update(rawBodyBuffer).digest('hex')
    hmacValid = constantTimeEqualsHexOrUtf8(providedHex, expectedHex)
  }

  if (mode === 'bearer') return bearerValid ? { ok: true } : { ok: false, error: 'Invalid Bearer token' }
  if (mode === 'hmac_sha256') return hmacValid ? { ok: true } : { ok: false, error: 'Invalid HMAC-SHA256 signature' }
  if (mode === 'both') return (bearerValid || hmacValid) ? { ok: true } : { ok: false, error: 'Missing valid Bearer or HMAC-SHA256 authentication' }
  return { ok: false, error: `Unsupported auth_mode: ${mode}` }
}

function summarizeHeaders(headers) {
  const picked = {}
  for (const k of ['content-type', 'user-agent', 'x-github-event', 'x-github-delivery', 'x-webhook-delivery', 'idempotency-key']) {
    if (headers[k]) picked[k] = String(headers[k]).slice(0, 200)
  }
  return picked
}

function readRequestBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    let tooLarge = false
    req.on('data', (chunk) => {
      if (tooLarge) return
      total += chunk.length
      if (total > maxBytes) {
        tooLarge = true
        reject(Object.assign(new Error('Payload exceeds 2 MiB limit'), { statusCode: 413 }))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (!tooLarge) resolve(Buffer.concat(chunks))
    })
    req.on('error', reject)
  })
}

export function createWebhookHttpHandler({ store, dispatcher, logger }) {
  return async function handleHttp(req, res) {
    let urlObj
    try {
      urlObj = new URL(req.url || '/', 'http://127.0.0.1')
    } catch {
      return sendJson(res, 400, { ok: false, error: 'Malformed request URL' })
    }

    const pathname = urlObj.pathname.replace(/\/+$/, '') || '/'
    if (pathname === '/hooks/healthz' || pathname === '/healthz') {
      return sendJson(res, 200, { ok: true, rules: store.listRules().length })
    }

    const match = pathname.match(/^\/hooks\/([a-z0-9][a-z0-9_-]{0,47})$/i)
    if (!match) {
      return sendJson(res, 404, { ok: false, error: 'Route not found (expected /hooks/<slug>)' })
    }
    if (req.method !== 'POST' && req.method !== 'PUT') {
      return sendJson(res, 405, { ok: false, error: 'Method not allowed; use POST or PUT' })
    }

    const slug = match[1].toLowerCase()
    const rule = store.findRuleBySlug(slug)
    if (!rule) {
      return sendJson(res, 404, { ok: false, error: `No webhook trigger registered for /hooks/${slug}` })
    }
    if (!rule.enabled) {
      return sendJson(res, 403, { ok: false, error: `Webhook /hooks/${slug} is disabled` })
    }

    let rawBody
    try {
      rawBody = await readRequestBody(req, MAX_BODY_BYTES)
    } catch (err) {
      return sendJson(res, err?.statusCode === 413 ? 413 : 400, { ok: false, error: err?.message || 'Body read failed' })
    }

    const auth = verifyWebhookRequest(rule, req.headers || {}, rawBody)
    if (!auth.ok) {
      return sendJson(res, 401, { ok: false, error: auth.error })
    }

    const deliveryKey = String(
      req.headers['x-github-delivery'] ||
      req.headers['x-webhook-delivery'] ||
      req.headers['idempotency-key'] ||
      '',
    ).trim()

    if (deliveryKey) {
      const dup = store.findDuplicateDelivery(rule.id, deliveryKey)
      if (dup) {
        return sendJson(res, 200, {
          ok: true,
          duplicate: true,
          delivery_id: dup.id,
          session_id: dup.session_id || null,
        })
      }
    }

    const rawText = rawBody.toString('utf8')
    let parsedPayload = undefined
    const contentType = String(req.headers['content-type'] || '').toLowerCase()
    if (rawText.trim() && (contentType.includes('json') || rawText.trim().startsWith('{') || rawText.trim().startsWith('['))) {
      try {
        parsedPayload = JSON.parse(rawText)
      } catch {
        parsedPayload = undefined
      }
    }

    const deliveryId = `del_${randomUUID().slice(0, 8)}`
    const headersSummary = summarizeHeaders(req.headers || {})
    const payloadPath = store.archivePayload(deliveryId, rawText, parsedPayload, headersSummary)

    store.recordDelivery({
      id: deliveryId,
      delivery_key: deliveryKey || '',
      rule_id: rule.id,
      rule_slug: rule.slug,
      rule_name: rule.name,
      received_at: new Date().toISOString(),
      finished_at: null,
      status: 'accepted',
      status_code: 202,
      source_ip: req.socket?.remoteAddress || '',
      headers_summary: headersSummary,
      payload_path: payloadPath,
      session_id: '',
      reply_preview: '',
      error: '',
    })

    // Dispatch asynchronously after sending HTTP 202 Accepted immediately
    setImmediate(() => {
      dispatcher.dispatch({
        rule,
        deliveryId,
        payload: parsedPayload,
        rawText,
        headers: req.headers || {},
        payloadPath,
      }).catch((err) => {
        logger?.warn?.(`webhook dispatch failed (${deliveryId}): ${err?.message || err}`)
      })
    })

    return sendJson(res, 202, {
      ok: true,
      accepted: true,
      delivery_id: deliveryId,
      slug: rule.slug,
      payload_path: payloadPath,
    })
  }
}

export function startWebhookHttpServer(ctx, { store, dispatcher, logger, port, host = '127.0.0.1' }) {
  const listenPort = Number(port || process.env.WEBHOOK_PORT || 4095)
  const handler = createWebhookHttpHandler({ store, dispatcher, logger })
  const server = http.createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch((err) => {
      logger?.warn?.(`webhook HTTP unhandled error: ${err?.message || err}`)
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'Internal webhook receiver error' })
    })
  })

  server.listen(listenPort, host, () => {
    logger?.info?.(`webhook-triggers listening on http://${host}:${listenPort}/hooks/<slug>`)
  })
  server.on('error', (err) => {
    logger?.warn?.(`webhook-triggers server error on ${host}:${listenPort}: ${err?.message || err}`)
  })

  ctx?.effect?.(() => () => {
    try { server.close() } catch {}
  }, 'webhook-triggers: http server')

  return server
}
