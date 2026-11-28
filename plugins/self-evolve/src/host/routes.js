export const STATE_ENDPOINT = '/api/self-evolve.state'
export const SKILL_SAVE_ENDPOINT = '/api/self-evolve.skill-save'
export const SKILL_DELETE_ENDPOINT = '/api/self-evolve.skill-delete'
export const LESSON_ADD_ENDPOINT = '/api/self-evolve.lesson-add'
export const ROLLBACK_ENDPOINT = '/api/self-evolve.rollback'

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

async function parseJsonRequest(request) {
  try { return await request.json() } catch { return null }
}

export function registerBrowserRoutes(ctx, service) {
  ctx.inject(['connection'], ({ connection }) => {
    const postRoutes = [
      { path: SKILL_SAVE_ENDPOINT, run: (body) => service.saveSkill(body) },
      { path: SKILL_DELETE_ENDPOINT, run: (body) => service.deleteSkill(body) },
      { path: LESSON_ADD_ENDPOINT, run: (body) => service.recordLesson(body) },
      { path: ROLLBACK_ENDPOINT, run: (body) => service.rollbackEvolution(body) },
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
            const res = await spec.run(body)
            const errStatus = Number.isInteger(res?.status) ? res.status : 400
            return jsonResponse(res, res?.ok === false ? errStatus : 200)
          },
        }),
      ),
    ]

    ctx.effect(() => () => { for (const d of disposers) d() }, 'self-evolve: browser api routes')
  })
}
