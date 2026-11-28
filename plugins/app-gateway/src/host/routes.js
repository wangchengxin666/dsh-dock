export const STATE_ENDPOINT = '/api/app-gateway.state'
export const APP_EXPOSE_ENDPOINT = '/api/app-gateway.app-expose'
export const APP_AUTH_ENDPOINT = '/api/app-gateway.app-auth'
export const APP_UNEXPOSE_ENDPOINT = '/api/app-gateway.app-unexpose'
export const SERVICE_ACTION_ENDPOINT = '/api/app-gateway.service-action'
export const SERVICE_ADD_ENDPOINT = '/api/app-gateway.service-add'
export const SERVICE_REMOVE_ENDPOINT = '/api/app-gateway.service-remove'
export const SERVICE_LOGS_ENDPOINT = '/api/app-gateway.service-logs'

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
  try { return await request.json() } catch { return null }
}

export function registerBrowserRoutes(ctx, service) {
  ctx.inject(['connection'], ({ connection }) => {
    const postRoutes = [
      {
        path: APP_EXPOSE_ENDPOINT,
        validate: (body) => (body && body.name && body.port != null ? null : 'name and port are required'),
        run: (body) => service.exposeApp({
          name: body.name,
          port: body.port,
          authMode: body.authMode || 'public',
          prefix: body.prefix || '',
        }),
      },
      {
        path: APP_AUTH_ENDPOINT,
        validate: (body) => (body && body.name && body.authMode ? null : 'name and authMode are required'),
        run: (body) => service.setAppAuth({ name: body.name, authMode: body.authMode }),
      },
      {
        path: APP_UNEXPOSE_ENDPOINT,
        validate: (body) => (body && body.name ? null : 'name is required'),
        run: (body) => service.unexposeApp({ name: body.name }),
      },
      {
        path: SERVICE_ACTION_ENDPOINT,
        validate: (body) => (body && body.name && body.action ? null : 'name and action are required'),
        run: (body) => service.controlService({ name: body.name, action: body.action }),
      },
      {
        path: SERVICE_ADD_ENDPOINT,
        validate: (body) => (body && body.name && body.command ? null : 'name and command are required'),
        run: (body) => service.addService({ name: body.name, command: body.command }),
      },
      {
        path: SERVICE_REMOVE_ENDPOINT,
        validate: (body) => (body && body.name ? null : 'name is required'),
        run: (body) => service.removeService({ name: body.name }),
      },
    ]

    const disposers = [
      connection.fetch.register({
        path: STATE_ENDPOINT,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch() {
          return jsonResponse({ ok: true, state: service.getStateSnapshot() })
        },
      }),
      connection.fetch.register({
        path: SERVICE_LOGS_ENDPOINT,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch(request) {
          let name = ''
          let tail = 150
          try {
            const u = new URL(request.url, 'http://localhost')
            name = u.searchParams.get('name') || ''
            tail = Number(u.searchParams.get('tail')) || 150
          } catch {}
          if (!name) return jsonResponse({ ok: false, error: 'name is required' }, 400)
          const res = service.readServiceLogs({ name, tail })
          const errStatus = Number.isInteger(res?.status) ? res.status : 400
          return jsonResponse(res, res?.ok === false ? errStatus : 200)
        },
      }),
      ...postRoutes.map((spec) =>
        connection.fetch.register({
          path: spec.path,
          methods: ['POST'],
          requestBody: 'buffered',
          async fetch(request) {
            const body = await parseJsonRequest(request)
            if (!body || typeof body !== 'object') {
              return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400)
            }
            const errMsg = spec.validate ? spec.validate(body) : null
            if (errMsg) return jsonResponse({ ok: false, error: errMsg }, 400)
            const result = await spec.run(body)
            const errStatus = Number.isInteger(result?.status) ? result.status : 400
            return jsonResponse(result, result?.ok === false ? errStatus : 200)
          },
        }),
      ),
    ]

    ctx.effect(() => () => { for (const d of disposers) d() }, 'app-gateway: browser api routes')
  })
}
