import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const GLOBAL_DSH_NM = '/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai'

async function importDshPkg(pkgShortName, fullPkgName) {
  try {
    return await import(fullPkgName)
  } catch {
    const candidate = `${GLOBAL_DSH_NM}/${pkgShortName}/lib/index.js`
    if (existsSync(candidate)) {
      return import(pathToFileURL(candidate).href)
    }
    return null
  }
}

export const WEBHOOK_TOOL_NAMES = [
  'webhook_list',
  'webhook_create',
  'webhook_recent_deliveries',
]

export function buildWebhookSkillMarkdown() {
  return [
    '---',
    'name: webhook-triggers',
    'description: Configure inbound HTTP webhook endpoints at /hooks/<slug>, verify HMAC-SHA256 or Bearer secrets, inspect archived JSON payloads, and wake DSH sessions asynchronously.',
    'whenToUse: The user asks to expose a webhook URL for GitHub, Stripe, Feishu/Slack, CI/CD, or custom scripts, or inspect recent incoming webhook deliveries.',
    '---',
    '',
    '# Webhook Triggers',
    '',
    'Caddy forwards `/hooks/<slug>` directly to the local listener (`127.0.0.1:4095`) bypassing browser login.',
    'Every webhook verifies signatures in constant time (`X-Hub-Signature-256`, `X-Webhook-Signature`, or `Authorization: Bearer <secret>`), archives the full raw JSON body to `~/.dsh-sandbox/webhooks/payloads/<id>.json`, returns `202 Accepted` immediately, and wakes a DSH session.',
    '',
    'Prompt template placeholders:',
    '- `{{hook.slug}}`, `{{hook.name}}`, `{{delivery.id}}`',
    '- `{{payload_path}}` (read full payload file cleanly without blowing up context window)',
    '- `{{payload_preview}}` (truncated JSON preview)',
    '- `{{payload.event}}` / `{{payload.repository.full_name}}` (nested field extraction)',
  ].join('\n')
}

export function wireHarnessRuntime(ctx, store, { logger } = {}) {
  ctx.inject(['skills'], (skillCtx) => {
    let invalidated = false
    const unregister = skillCtx.skills.registerProvider({
      name: 'webhook-triggers',
      list() {
        return [{
          name: 'webhook-triggers',
          description: 'Create inbound /hooks/<slug> triggers and inspect signed webhook deliveries.',
          whenToUse: 'Use when setting up inbound webhooks or debugging webhook delivery payloads.',
          locator: 'plugin://webhook-triggers/guide',
        }]
      },
      get() {
        return { content: buildWebhookSkillMarkdown() }
      },
    })
    skillCtx.effect(() => {
      if (!invalidated) {
        invalidated = true
        skillCtx.skills.invalidate?.()
      }
      return () => { try { unregister?.() } catch {} }
    }, 'webhook-triggers: skill')
  })

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
        name: 'webhook_list',
        description: 'List all configured inbound webhook rules and their public /hooks/<slug> endpoints.',
        parameters: {},
        output: {
          schema: { type: 'object', additionalProperties: true },
          render: (_args, val) => {
            if (!val?.ok) return [{ type: 'text', text: 'Failed to list webhooks.' }]
            const rules = val.rules || []
            if (rules.length === 0) return [{ type: 'text', text: 'No webhooks configured yet.' }]
            const lines = rules.map((r) => `- ${r.slug} [${r.enabled ? r.auth_mode : 'disabled'}] -> ${r.endpoint_url} (secret ending ...${String(r.secret || '').slice(-4)})`)
            return [{ type: 'text', text: `Configured Webhooks (${rules.length}):\n${lines.join('\n')}` }]
          },
        },
        async execute() {
          const rules = store.listRules({ includeSecret: false })
          return { ok: true, rules }
        },
        presentCall: () => ({ card: 'generic', title: 'List webhook triggers', kind: 'other' }),
      })

      reg({
        name: 'webhook_create',
        description: 'Create or update an inbound webhook rule mounted at /hooks/<slug>. Generates a signing secret automatically if omitted.',
        parameters: {
          slug: { type: 'string', required: true, description: 'URL slug matching [a-z0-9_-]+ (mounted at /hooks/<slug>).' },
          name: { type: 'string', description: 'Human-readable display name.' },
          auth_mode: { type: 'string', description: 'One of: hmac_sha256 (default), bearer, both, open.' },
          prompt_template: { type: 'string', description: 'Instruction template with {{payload.*}} and {{payload_path}} placeholders.' },
          session_mode: { type: 'string', description: 'new (fresh session per trigger) or pinned (reuse pinned_session_id).' },
          callback_url: { type: 'string', description: 'Optional HTTP URL to POST completion status and reply preview.' },
        },
        output: {
          schema: { type: 'object', additionalProperties: true },
          render: (_args, val) => {
            if (!val?.ok) return [{ type: 'text', text: `Failed to save webhook: ${val?.error || 'unknown error'}` }]
            const r = val.rule
            return [{
              type: 'text',
              text: `Webhook "/hooks/${r.slug}" saved.\nEndpoint: ${r.endpoint_url}\nAuth: ${r.auth_mode}\nSecret: ${r.secret}`,
            }]
          },
        },
        async execute(args) {
          return store.saveRule({
            slug: args?.slug,
            name: args?.name,
            auth_mode: args?.auth_mode || 'hmac_sha256',
            prompt_template: args?.prompt_template || '',
            session_mode: args?.session_mode || 'new',
            callback_url: args?.callback_url || '',
          })
        },
        presentCall: (args) => ({ card: 'generic', title: `Create webhook /hooks/${args?.slug || ''}`, kind: 'other' }),
      })

      reg({
        name: 'webhook_recent_deliveries',
        description: 'Inspect recent webhook deliveries, status, session IDs, archived payload paths, and agent reply previews.',
        parameters: {
          limit: { type: 'number', description: 'Max number of recent deliveries to return (default 15).' },
        },
        output: {
          schema: { type: 'object', additionalProperties: true },
          render: (_args, val) => {
            if (!val?.ok) return [{ type: 'text', text: 'Failed to load deliveries.' }]
            const items = val.deliveries || []
            if (items.length === 0) return [{ type: 'text', text: 'No webhook deliveries recorded yet.' }]
            return [{
              type: 'text',
              text: items.map((d) => `- ${d.id} [/hooks/${d.rule_slug}] ${d.status} @ ${d.received_at}${d.session_id ? ` · session=${d.session_id}` : ''}`).join('\n'),
            }]
          },
        },
        async execute(args) {
          return { ok: true, deliveries: store.listDeliveries(args?.limit || 15) }
        },
        presentCall: () => ({ card: 'generic', title: 'Inspect recent webhook deliveries', kind: 'other' }),
      })
    })().catch((err) => {
      logger?.warn?.(`Failed to register webhook-triggers tools: ${err?.message || err}`)
    })

    toolCtx.effect(() => () => {
      disposed = true
      for (const d of disposers) { try { d() } catch {} }
    }, 'webhook-triggers: harness tools')
  })
}
