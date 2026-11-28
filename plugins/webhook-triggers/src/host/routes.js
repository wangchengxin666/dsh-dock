import { randomUUID } from 'node:crypto'

export const STATE_ENDPOINT = '/api/webhook-triggers.state'
export const RULE_SAVE_ENDPOINT = '/api/webhook-triggers.rule-save'
export const RULE_DELETE_ENDPOINT = '/api/webhook-triggers.rule-delete'
export const RULE_ROTATE_SECRET_ENDPOINT = '/api/webhook-triggers.rule-rotate-secret'
export const REPLAY_ENDPOINT = '/api/webhook-triggers.replay'
export const TEST_FIRE_ENDPOINT = '/api/webhook-triggers.test-fire'

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

async function parseJsonRequest(request) {
  try {
    return await request.json()
  } catch {
    return null
  }
}

export function registerBrowserRoutes(ctx, { store, dispatcher, listenerPort }) {
  ctx.inject(['connection'], ({ connection }) => {
    const routes = [
      {
        path: RULE_SAVE_ENDPOINT,
        run: (body) => {
          const res = store.saveRule(body)
          if (!res.ok) return res
          return { ...res, state: store.getSnapshot({ listenerPort }) }
        },
      },
      {
        path: RULE_DELETE_ENDPOINT,
        run: (body) => {
          const res = store.deleteRule({ id: body.id, slug: body.slug })
          if (!res.ok) return res
          return { ...res, state: store.getSnapshot({ listenerPort }) }
        },
      },
      {
        path: RULE_ROTATE_SECRET_ENDPOINT,
        run: (body) => {
          const res = store.rotateSecret({ id: body.id, slug: body.slug })
          if (!res.ok) return res
          return { ...res, state: store.getSnapshot({ listenerPort }) }
        },
      },
      {
        path: REPLAY_ENDPOINT,
        run: async (body) => {
          const targetId = String(body.deliveryId || '').trim()
          const old = store.listDeliveries(100).find((d) => d.id === targetId)
          if (!old) return { ok: false, status: 404, error: `Delivery not found: ${targetId}` }
          const rule = store.findRuleById(old.rule_id) || store.findRuleBySlug(old.rule_slug)
          if (!rule) return { ok: false, status: 404, error: `Rule no longer exists: ${old.rule_slug}` }
          const archived = store.readArchivedPayload(old.payload_path)
          const newId = `del_${randomUUID().slice(0, 8)}`
          const newPayloadPath = store.archivePayload(
            newId,
            archived?.raw_text || '',
            archived?.payload,
            archived?.headers || {},
          )
          store.recordDelivery({
            id: newId,
            delivery_key: `replay:${old.id}:${Date.now()}`,
            rule_id: rule.id,
            rule_slug: rule.slug,
            rule_name: rule.name,
            received_at: new Date().toISOString(),
            finished_at: null,
            status: 'accepted',
            status_code: 202,
            source_ip: 'ui-replay',
            headers_summary: archived?.headers || {},
            payload_path: newPayloadPath,
            session_id: '',
            reply_preview: '',
            error: '',
          })
          await dispatcher.dispatch({
            rule,
            deliveryId: newId,
            payload: archived?.payload,
            rawText: archived?.raw_text || '',
            headers: archived?.headers || {},
            payloadPath: newPayloadPath,
          })
          return { ok: true, delivery_id: newId, state: store.getSnapshot({ listenerPort }) }
        },
      },
      {
        path: TEST_FIRE_ENDPOINT,
        run: async (body) => {
          const rule = store.findRuleBySlug(body.slug) || store.findRuleById(body.id)
          if (!rule) return { ok: false, status: 404, error: 'Webhook rule not found' }
          const payload = body.payload && typeof body.payload === 'object'
            ? body.payload
            : { event: 'manual.test', triggered_at: new Date().toISOString(), source: 'ui' }
          const deliveryId = `del_${randomUUID().slice(0, 8)}`
          const payloadPath = store.archivePayload(deliveryId, JSON.stringify(payload), payload, { 'content-type': 'application/json', 'user-agent': 'dsh-ui-test' })
          store.recordDelivery({
            id: deliveryId,
            delivery_key: '',
            rule_id: rule.id,
            rule_slug: rule.slug,
            rule_name: rule.name,
            received_at: new Date().toISOString(),
            finished_at: null,
            status: 'accepted',
            status_code: 202,
            source_ip: 'ui-test',
            headers_summary: { 'content-type': 'application/json' },
            payload_path: payloadPath,
            session_id: '',
            reply_preview: '',
            error: '',
          })
          await dispatcher.dispatch({
            rule,
            deliveryId,
            payload,
            rawText: JSON.stringify(payload),
            headers: {},
            payloadPath,
          })
          return { ok: true, delivery_id: deliveryId, state: store.getSnapshot({ listenerPort }) }
        },
      },
    ]

    const disposers = [
      connection.fetch.register({
        path: STATE_ENDPOINT,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch() {
          return jsonResponse({ ok: true, state: store.getSnapshot({ listenerPort }) })
        },
      }),
      ...routes.map((spec) =>
        connection.fetch.register({
          path: spec.path,
          methods: ['POST'],
          requestBody: 'buffered',
          async fetch(request) {
            const body = await parseJsonRequest(request)
            if (!body || typeof body !== 'object') {
              return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400)
            }
            const res = await spec.run(body)
            const errStatus = Number.isInteger(res?.status) ? res.status : 400
            return jsonResponse(res, res?.ok === false ? errStatus : 200)
          },
        }),
      ),
    ]

    ctx.effect(() => () => {
      for (const d of disposers) d()
    }, 'webhook-triggers: browser api routes')
  })
}
