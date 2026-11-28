import assert from 'node:assert/strict'
import { importExternal } from './deps.mjs'
import { createAppGatewayController } from '../src/client/controller.js'
import { createAppGatewayPage } from '../src/client/page.js'
import { createAppGatewayToolView } from '../src/client/tool-views.js'

const reactMod = await importExternal('react')
const React = reactMod.default || reactMod
const rdsMod = await importExternal('react-dom/server')
const renderToStaticMarkup = rdsMod.renderToStaticMarkup || rdsMod.default?.renderToStaticMarkup

const mockState = {
  gateway_auth_mode: 'basic',
  public_origin: 'http://localhost:8080',
  exposed_apps: [
    { name: 'demo', target: '127.0.0.1:5173', mount_path: '/apps/demo/', url: 'http://localhost:8080/apps/demo/', auth_mode: 'caddy' },
  ],
  user_services: [
    { name: 'demo', command: 'python3 -m http.server 5173', status: 'running' },
  ],
}

const ctrl = createAppGatewayController({
  fetchImpl: async () => ({ ok: true, status: 200, async json() { return { ok: true, state: mockState } } }),
})
await ctrl.syncFromHost()

const Page = createAppGatewayPage({ React, controller: ctrl, getLocale: () => 'zh-CN', subscribeLocale: () => () => {} })
const html = renderToStaticMarkup(React.createElement(Page))
assert.ok(html.includes('对外应用与服务管理'))
assert.ok(html.includes('Caddy 账号密码'))
assert.ok(html.includes('Caddy 登录保护'))
assert.ok(html.includes('demo'))
assert.ok(html.includes('running'))
assert.ok(!html.includes('人工审批'))

const ToolView = createAppGatewayToolView({ React, getLocale: () => 'zh-CN', subscribeLocale: () => () => {} })
const toolHtml = renderToStaticMarkup(React.createElement(ToolView, {
  toolName: 'app_gateway_expose',
  phase: 'result',
  useDisclosure: () => ({ expanded: true, toggle() {} }),
  block: { kind: 'tool-result', content: [{ type: 'text', text: 'demo [caddy] -> http://localhost:8080/apps/demo/' }] },
}))
assert.ok(toolHtml.includes('管理 /apps/* 对外路由'))
assert.ok(toolHtml.includes('http://localhost:8080/apps/demo/'))
ctrl.dispose()
console.log('app-gateway client-live ok')
