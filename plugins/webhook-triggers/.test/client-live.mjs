import assert from 'node:assert/strict'
import { importExternal } from './deps.mjs'
import { createWebhookController } from '../src/client/controller.js'
import { createWebhookPage } from '../src/client/page.js'
import { createWebhookToolView } from '../src/client/tool-views.js'

const reactMod = await importExternal('react')
const React = reactMod.default || reactMod
const rdsMod = await importExternal('react-dom/server')
const renderToStaticMarkup = rdsMod.renderToStaticMarkup || rdsMod.default?.renderToStaticMarkup

const mockState = {
  webhooks_base_url: 'https://ai.example.com/hooks',
  listener_port: 4095,
  rules: [{
    id: 'wh_1',
    slug: 'github-ci',
    name: 'GitHub CI',
    enabled: true,
    auth_mode: 'hmac_sha256',
    secret: 'whsec_1234567890abcdef',
    endpoint_url: 'https://ai.example.com/hooks/github-ci',
  }],
  deliveries: [{
    id: 'del_1',
    rule_slug: 'github-ci',
    status: 'completed',
    received_at: '2026-11-28T00:00:00Z',
    session_id: 'webhook-github-ci-1',
    payload_path: '/tmp/payload.json',
    reply_preview: 'Checked build logs and opened PR comment.',
  }],
}

const ctrl = createWebhookController({
  fetchImpl: async () => ({ ok: true, status: 200, async json() { return { ok: true, state: mockState } } }),
})
await ctrl.syncFromHost()

const Page = createWebhookPage({ React, controller: ctrl, getLocale: () => 'zh-CN', subscribeLocale: () => () => {} })
const html = renderToStaticMarkup(React.createElement(Page))
assert.ok(html.includes('Webhook 触发器'))
assert.ok(html.includes('GitHub CI'))
assert.ok(html.includes('https://ai.example.com/hooks/github-ci'))
assert.ok(html.includes('Checked build logs'))

const ToolView = createWebhookToolView({ React, getLocale: () => 'zh-CN', subscribeLocale: () => () => {} })
const toolHtml = renderToStaticMarkup(React.createElement(ToolView, {
  toolName: 'webhook_create',
  phase: 'result',
  useDisclosure: () => ({ expanded: true, toggle() {} }),
  block: { kind: 'tool-result', content: [{ type: 'text', text: 'Webhook "/hooks/github-ci" saved.' }] },
}))
assert.ok(toolHtml.includes('配置 Webhook 触发器'))
assert.ok(toolHtml.includes('/hooks/github-ci'))
ctrl.dispose()
console.log('webhook client-live ok')
