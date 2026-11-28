import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const GLOBAL_DSH_NM = '/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai'

async function importDshPkg(pkgShortName, fullPkgName) {
  try {
    return await import(fullPkgName)
  } catch {
    const candidate = `${GLOBAL_DSH_NM}/${pkgShortName}/lib/index.js`
    if (existsSync(candidate)) return import(pathToFileURL(candidate).href)
    return null
  }
}

export const APP_GATEWAY_TOOL_NAMES = [
  'app_gateway_list',
  'app_gateway_expose',
  'app_gateway_service',
]

export function wireHarnessRuntime(ctx, service, { logger } = {}) {
  ctx.inject(['tools'], (toolCtx) => {
    const disposers = []
    let disposed = false

    ;(async () => {
      const toolsMod = await importDshPkg('dsh-tools', '@deepseek-ai/dsh-tools')
      const defineTool = toolsMod?.defineTool || ((spec) => spec)
      if (disposed) return

      const reg = (spec) => {
        const d = toolCtx.tools.register(defineTool(spec))
        if (typeof d === 'function') disposers.push(d)
      }

      reg({
        name: 'app_gateway_list',
        description: 'Inspect published /apps/* routes (public vs caddy protection), gateway auth mode, and supervisor background services.',
        parameters: {},
        output: {
          schema: { type: 'object', additionalProperties: true },
          render: (_args, val) => {
            if (!val?.ok || !val?.state) return [{ type: 'text', text: 'Failed to inspect apps & services.' }]
            const s = val.state
            return [{
              type: 'text',
              text: [
                `Gateway (${s.gateway_auth_mode || 'none'} · ${s.public_origin}):`,
                `- Exposed Apps (${(s.exposed_apps || []).length}): ${(s.exposed_apps || []).map((a) => `${a.name} [${a.auth_mode}] -> ${a.url}`).join('; ') || 'none'}`,
                `- Services (${(s.user_services || []).length}): ${(s.user_services || []).map((sv) => `${sv.name} (${sv.status})`).join('; ') || 'none'}`,
              ].join('\n'),
            }]
          },
        },
        async execute() {
          return { ok: true, state: service.getStateSnapshot() }
        },
        presentCall: () => ({ card: 'generic', title: 'Inspect exposed apps & services', kind: 'other' }),
      })

      reg({
        name: 'app_gateway_expose',
        description: 'Publish a loopback web service under /apps/<name>/, toggle public vs caddy authentication, or remove it.',
        parameters: {
          action: { type: 'string', required: true, description: 'One of: expose, set_auth, remove.' },
          name: { type: 'string', required: true, description: 'App route slug matching [a-z0-9_-]+.' },
          port: { type: 'number', description: 'Local loopback TCP port (required when action=expose).' },
          authMode: { type: 'string', description: 'Access control: public (open link) or caddy (protected by Caddy Basic/OAuth2).' },
        },
        output: {
          schema: { type: 'object', additionalProperties: true },
          render: (args, val) => {
            if (!val?.ok) return [{ type: 'text', text: `Failed: ${val?.error || 'unknown error'}` }]
            if (args?.action === 'remove') return [{ type: 'text', text: `Removed /apps/${args.name}/` }]
            const app = val.app
            return [{ type: 'text', text: app ? `${app.name} [${app.auth_mode}] -> ${app.url}` : (val.output || 'Updated app route') }]
          },
        },
        async execute(args) {
          const action = String(args?.action || '').trim().toLowerCase()
          if (action === 'expose') return service.exposeApp({ name: args?.name, port: args?.port, authMode: args?.authMode || 'public' })
          if (action === 'set_auth') return service.setAppAuth({ name: args?.name, authMode: args?.authMode })
          if (action === 'remove') return service.unexposeApp({ name: args?.name })
          return { ok: false, error: `Unsupported action: ${action}` }
        },
        presentCall: (args) => ({ card: 'generic', title: `${args?.action || 'manage'} /apps/${args?.name || ''}/`, kind: 'other' }),
      })

      reg({
        name: 'app_gateway_service',
        description: 'Manage persistent supervisor background services: add, start, stop, restart, remove, or tail logs.',
        parameters: {
          action: { type: 'string', required: true, description: 'One of: add, start, stop, restart, remove, logs.' },
          name: { type: 'string', required: true, description: 'Service name matching [a-z0-9_-]+.' },
          command: { type: 'string', description: 'Shell command (required when action=add).' },
          tail: { type: 'number', description: 'Log line count when action=logs (default 150).' },
        },
        output: {
          schema: { type: 'object', additionalProperties: true },
          render: (args, val) => {
            if (!val?.ok) return [{ type: 'text', text: `Failed: ${val?.error || 'unknown error'}` }]
            if (args?.action === 'logs') return [{ type: 'text', text: val.logs || '(no logs)' }]
            return [{ type: 'text', text: val.output || `Service ${args?.name}: ${args?.action} ok` }]
          },
        },
        async execute(args) {
          const action = String(args?.action || '').trim().toLowerCase()
          if (action === 'add') return service.addService({ name: args?.name, command: args?.command })
          if (action === 'remove') return service.removeService({ name: args?.name })
          if (action === 'logs') return service.readServiceLogs({ name: args?.name, tail: args?.tail || 150 })
          if (['start', 'stop', 'restart'].includes(action)) return service.controlService({ name: args?.name, action })
          return { ok: false, error: `Unsupported service action: ${action}` }
        },
        presentCall: (args) => ({ card: 'generic', title: `Service ${args?.name || ''}: ${args?.action || ''}`, kind: 'other' }),
      })
    })().catch((err) => {
      logger?.warn?.(`Failed to register app-gateway tools: ${err?.message || err}`)
    })

    toolCtx.effect(() => () => {
      disposed = true
      for (const d of disposers) { try { d() } catch {} }
    }, 'app-gateway: harness tools')
  })
}
