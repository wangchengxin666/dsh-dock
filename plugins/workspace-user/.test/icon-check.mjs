import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PLUGIN_DIR } from './deps.mjs'

const iconPkgPath = join(PLUGIN_DIR, 'icon.svg')
const iconMirrorPath = join(PLUGIN_DIR, '..', 'icons', 'workspace-user.svg')

const iconSvg = readFileSync(iconPkgPath, 'utf8')
const mirrorSvg = readFileSync(iconMirrorPath, 'utf8')

assert.equal(iconSvg, mirrorSvg, 'plugins/icons/workspace-user.svg must match plugins/workspace-user/icon.svg')
assert.match(iconSvg, /^<svg\b[^>]*viewBox="0 0 36 36"/, 'SVG must have viewBox="0 0 36 36"')
for (const forbidden of ['<script', '<text', '<image', '<foreignObject', '<style', 'onload']) {
  assert.ok(!iconSvg.toLowerCase().includes(forbidden.toLowerCase()), `Forbidden SVG content: ${forbidden}`)
}
console.log('icon-check ok')
