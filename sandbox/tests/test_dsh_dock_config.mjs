import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT_PATH = path.resolve(__dirname, '../rootfs/usr/local/bin/dsh-dock-config')

test('dsh-dock-config sync-market configures GitHub plugin-market index cleanly', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-dock-config-'))
  const stubYaml = path.join(tmp, 'yaml-stub.cjs')
  fs.writeFileSync(
    stubYaml,
    'module.exports = { parse: (s) => (s && s.trim() ? JSON.parse(s) : null), stringify: (v) => JSON.stringify(v, null, 2) + "\\n" }\n',
    'utf8',
  )
  const dshHome = path.join(tmp, '.dsh')
  const profileDir = path.join(dshHome, 'profiles', 'web')
  fs.mkdirSync(profileDir, { recursive: true })
  fs.writeFileSync(path.join(profileDir, 'package.json'), JSON.stringify({ dependencies: { '@dsh-dock/app-gateway': '0.1.0' } }), 'utf8')

  try {
    const outMarket = execFileSync(process.execPath, [SCRIPT_PATH, 'sync-market'], {
      env: { ...process.env, HOME: tmp, DSH_HOME: dshHome, DSH_YAML_MODULE: stubYaml },
      encoding: 'utf8',
    })
    assert.match(outMarket, /INSTALLED_DEPS=\["@dsh-dock\/app-gateway"\]/)
    assert.equal(fs.existsSync(path.join(profileDir, '.npmrc')), false)

    const entries = JSON.parse(fs.readFileSync(path.join(profileDir, 'cordis.patch.yml'), 'utf8'))
    const pkg = JSON.parse(fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8'))
    const market = entries.find((e) => e.id === 'plugin-market')
    assert.deepEqual(market.config.indexes, ['git+https://github.com/wangchengxin666/dsh-dock.git?path=plugins/index.json'])
    assert.ok(pkg.dsh.profile.bundles.includes('@deepseek-ai/dsh-experimental-plugin-market-bundle'))
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})
