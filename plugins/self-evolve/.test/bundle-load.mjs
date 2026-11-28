import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'
import { PLUGIN_DIR, importExternal } from './deps.mjs'
import { renderClientBundle } from '../scripts/bundle-client.mjs'

const builtBefore = readFileSync(join(PLUGIN_DIR, 'client.js'), 'utf8')
assert.equal(renderClientBundle(), builtBefore, 'client.js was out of date relative to src/*')

const react = await importExternal('react')
let registered = null
vm.runInNewContext(
  builtBefore,
  { window: { __ModuleLoader__: { load(entry) { registered = entry } } } },
  { filename: 'client.js' },
)
assert.ok(registered)
assert.equal(registered.id, '@dsh-dock/self-evolve')
const mod = registered.factory((spec) => {
  if (spec === 'react') return react.default || react
  throw new Error(`Unexpected external require: ${spec}`)
})
assert.deepEqual([...mod.inject], ['slots', 'locale'])
console.log('bundle-load ok')
