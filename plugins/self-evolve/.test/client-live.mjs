import assert from 'node:assert/strict'
import { importExternal } from './deps.mjs'
import { createSelfEvolveController } from '../src/client/controller.js'
import { createSelfEvolvePage } from '../src/client/page.js'
import { createEvolveToolView } from '../src/client/tool-views.js'

const reactMod = await importExternal('react')
const React = reactMod.default || reactMod
const rdsMod = await importExternal('react-dom/server')
const renderToStaticMarkup = rdsMod.renderToStaticMarkup || rdsMod.default?.renderToStaticMarkup

const mockState = {
  skills_dir: '/home/workspace/.dsh/skills',
  skills: [{
    slug: 'deploy-check',
    name: 'deploy-check',
    description: 'Run Caddy & smoke checks before release',
    path: '/home/workspace/.dsh/skills/deploy-check',
    files: ['SKILL.md', 'scripts/check.sh'],
  }],
  entries: [{
    id: 'evo_1',
    kind: 'skill',
    title: 'Create skill "deploy-check"',
    summary: 'Automated Caddy health gate',
    status: 'verified',
    verify_command: 'bash check.sh',
    can_rollback: true,
    created_at: '2026-11-28T00:00:00Z',
  }],
  stats: { skills_count: 1, evolutions_count: 1, verified_count: 1, rolled_back_count: 0 },
}

const ctrl = createSelfEvolveController({
  fetchImpl: async () => ({ ok: true, status: 200, async json() { return { ok: true, state: mockState } } }),
})
await ctrl.syncFromHost()

const Page = createSelfEvolvePage({ React, controller: ctrl, getLocale: () => 'zh-CN', subscribeLocale: () => () => {} })
const html = renderToStaticMarkup(React.createElement(Page))
assert.ok(html.includes('自进化中心'))
assert.ok(html.includes('deploy-check'))
assert.ok(html.includes('一键回滚'))

const ToolView = createEvolveToolView({ React, getLocale: () => 'zh-CN', subscribeLocale: () => () => {} })
const toolHtml = renderToStaticMarkup(React.createElement(ToolView, {
  toolName: 'evolve_save_skill',
  phase: 'result',
  useDisclosure: () => ({ expanded: true, toggle() {} }),
  block: { kind: 'tool-result', content: [{ type: 'text', text: 'Evolution evo_1 [verified]: Create skill "deploy-check"' }] },
}))
assert.ok(toolHtml.includes('创建或更新工作区技能'))
assert.ok(toolHtml.includes('deploy-check'))
ctrl.dispose()
console.log('self-evolve client-live ok')
