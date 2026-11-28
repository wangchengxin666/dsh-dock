import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PLUGIN_DIR } from './deps.mjs'
const svg = readFileSync(join(PLUGIN_DIR, 'icon.svg'), 'utf8')
assert.ok(svg.includes('<svg') && svg.includes('</svg>'))
assert.ok(!/<script/i.test(svg))
console.log('icon-check ok')
