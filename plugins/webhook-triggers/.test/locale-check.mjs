import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PLUGIN_DIR } from './deps.mjs'
import * as clientLocale from '../src/client/locale.js'

for (const lang of ['en', 'zh']) {
  const m = JSON.parse(readFileSync(join(PLUGIN_DIR, 'locale', `${lang}.json`), 'utf8'))
  assert.ok(m.name && m.description)
}
const enKeys = Object.keys(clientLocale.en).sort()
const zhKeys = Object.keys(clientLocale.zh).sort()
assert.deepEqual(zhKeys, enKeys)
console.log('locale-check ok')
