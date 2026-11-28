import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { importExternal } from './deps.mjs'
import * as hostPlugin from '../index.js'

const { Context } = await importExternal('@deepseek-ai/cordis')

const tempDir = mkdtempSync(join(tmpdir(), 'dsh-custom-theme-'))
const storagePath = join(tempDir, 'custom-theme.json')

try {
  const ctx = new Context()
  const routes = new Map()

  ctx.provide('connection', {
    fetch: {
      register(route) {
        routes.set(route.path, route)
        return () => { routes.delete(route.path) }
      },
    },
  })

  const fiber = ctx.plugin(hostPlugin, { storagePath })
  await fiber.inertia
  await new Promise((r) => setTimeout(r, 20))

  // 1. Verify all 3 HTTP routes are registered
  assert.ok(routes.has(hostPlugin.STATE_ENDPOINT))
  assert.ok(routes.has(hostPlugin.SAVE_ENDPOINT))
  assert.ok(routes.has(hostPlugin.RESET_ENDPOINT))

  // 2. Default state is enabled out of the box (aurora-blue) even before file exists
  {
    const res = await routes.get(hostPlugin.STATE_ENDPOINT).fetch(new Request('http://localhost/api/custom-theme.state'))
    assert.equal(res.status, 200)
    const data = await res.json()
    assert.equal(data.ok, true)
    assert.equal(data.source, 'default')
    assert.equal(data.state.enabled, true)
    assert.equal(data.state.presetId, 'aurora-blue')
    assert.equal(data.state.tokens['--dsw-alias-bg-base'].light, '#f8fafc')
    assert.equal(data.state.tokens['--dsw-alias-bg-base'].dark, '#0f1420')
  }

  // 3. First-paint webserver/index-inject outputs global + CSS rules
  {
    const table = []
    ctx.emit('webserver/index-inject', table, { kind: 'web' })
    const globalRow = table.find((r) => r.kind === 'global' && r.name === '__DSH_CUSTOM_THEME__')
    const styleRow = table.find((r) => r.kind === 'style')
    assert.ok(globalRow, 'Expected global __DSH_CUSTOM_THEME__ injection')
    assert.ok(styleRow, 'Expected <style> injection on first paint')
    assert.ok(styleRow.text.includes('html body {'))
    assert.ok(styleRow.text.includes('html body[data-ds-dark-theme] {'))
    assert.ok(styleRow.text.includes('--dsw-alias-bg-base: #f8fafc;'))
    assert.ok(styleRow.text.includes('--dsw-alias-bg-base: #0f1420;'))
  }

  // 4. Reject CSS injection or malicious SVG payloads with HTTP 400
  {
    const badCssRes = await routes.get(hostPlugin.SAVE_ENDPOINT).fetch(
      new Request('http://localhost/api/custom-theme.save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          state: {
            enabled: true,
            presetId: 'custom',
            tokens: {
              '--dsw-alias-bg-base': { light: '#fff; } body { display: none', dark: '#000' },
            },
          },
        }),
      }),
    )
    assert.equal(badCssRes.status, 400)

    const badSvgRes = await routes.get(hostPlugin.SAVE_ENDPOINT).fetch(
      new Request('http://localhost/api/custom-theme.save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          state: {
            enabled: true,
            brand: {
              enabled: true,
              name: 'Demo',
              iconSvg: '<svg viewBox="0 0 24 24"><script>alert(1)</script></svg>',
            },
          },
        }),
      }),
    )
    assert.equal(badSvgRes.status, 400)
  }

  // 5. Save custom tokens, custom variables, and brand SVG -> survives reload from disk
  {
    const saveRes = await routes.get(hostPlugin.SAVE_ENDPOINT).fetch(
      new Request('http://localhost/api/custom-theme.save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          state: {
            enabled: true,
            presetId: 'custom',
            tokens: {
              '--dsw-alias-bg-base': { light: '#fffaf0', dark: '#101014' },
            },
            customTokens: [
              { name: '--dsw-radius-md', light: '14px', dark: '14px' },
            ],
            brand: {
              enabled: true,
              name: 'ACME Lab',
              iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/></svg>',
            },
          },
        }),
      }),
    )
    assert.equal(saveRes.status, 200)
    const saved = await saveRes.json()
    assert.equal(saved.ok, true)
    assert.equal(saved.state.tokens['--dsw-alias-bg-base'].light, '#fffaf0')
    assert.equal(saved.state.customTokens[0].name, '--dsw-radius-md')
    assert.equal(saved.state.brand.name, 'ACME Lab')

    // Verify independent store reads persisted data back from disk
    const reloaded = hostPlugin.createThemeStore(storagePath).getState()
    assert.equal(reloaded.source, 'file')
    assert.equal(reloaded.state.tokens['--dsw-alias-bg-base'].light, '#fffaf0')
    assert.equal(reloaded.state.customTokens[0].light, '14px')
    assert.equal(reloaded.state.brand.enabled, true)

    // First-paint style injection now uses persisted custom values
    const table = []
    ctx.emit('webserver/index-inject', table, { kind: 'web' })
    const styleRow = table.find((r) => r.kind === 'style')
    assert.ok(styleRow.text.includes('--dsw-radius-md: 14px;'))
  }

  // 6. Reset 'official' disables CSS overrides; reset 'default' restores aurora-blue
  {
    const offRes = await routes.get(hostPlugin.RESET_ENDPOINT).fetch(
      new Request('http://localhost/api/custom-theme.reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'official' }),
      }),
    )
    const offData = await offRes.json()
    assert.equal(offData.state.enabled, false)

    const tableOff = []
    ctx.emit('webserver/index-inject', tableOff, { kind: 'web' })
    assert.equal(tableOff.find((r) => r.kind === 'style'), undefined, 'Disabled theme should emit no style tag')

    const defRes = await routes.get(hostPlugin.RESET_ENDPOINT).fetch(
      new Request('http://localhost/api/custom-theme.reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'default' }),
      }),
    )
    const defData = await defRes.json()
    assert.equal(defData.state.enabled, true)
    assert.equal(defData.state.presetId, 'aurora-blue')
  }

  await ctx.fiber.dispose()
  assert.equal(routes.size, 0, 'Routes must unregister cleanly on dispose')
  console.log('host-live ok')
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
