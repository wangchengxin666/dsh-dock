import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'
import { PLUGIN_DIR, importExternal } from './deps.mjs'
import { createThemeController, STORAGE_KEY } from '../src/client/theme-sync.js'
import { createThemeSettingsPage } from '../src/client/settings-page.js'
import { SETTINGS_CSS } from '../src/client/styles.js'

const { Context, Service } = await importExternal('@deepseek-ai/cordis')
const React = (await importExternal('react')).default || await importExternal('react')
const ReactDOMServer = await importExternal('react-dom/server')

// 1. Test controller overrideTokens lifecycle + brand slot toggling + localStorage persistence
{
  const slotRegs = []
  const mockSlots = {
    inject(name, cb) {
      const dispose = cb()
      return () => { dispose?.() }
    },
    register(opts, comp) {
      const rec = { opts, comp }
      slotRegs.push(rec)
      return () => {
        const idx = slotRegs.indexOf(rec)
        if (idx >= 0) slotRegs.splice(idx, 1)
      }
    },
  }

  const appliedLayers = new Map()
  let currentPref = 'system'
  const mockTheme = {
    getTheme() {
      return {
        preference: currentPref,
        active: { id: 'light', colorScheme: currentPref === 'dark' ? 'dark' : 'light', tokens: {} },
      }
    },
    setTheme(id) {
      currentPref = id
    },
    overrideTokens(source, tokens) {
      appliedLayers.set(source, tokens)
      return () => {
        if (appliedLayers.get(source) === tokens) {
          appliedLayers.delete(source)
        }
      }
    },
  }

  const fakeStorageMap = new Map()
  globalThis.window = {
    localStorage: {
      getItem: (k) => fakeStorageMap.get(k) ?? null,
      setItem: (k, v) => { fakeStorageMap.set(k, v) },
    },
    addEventListener() {},
    removeEventListener() {},
  }

  const savedCalls = []
  const controller = createThemeController({
    React,
    themeSvc: mockTheme,
    slotsSvc: mockSlots,
    globalObj: {
      __DSH_CUSTOM_THEME__: {
        enabled: true,
        presetId: 'aurora-blue',
        brand: { enabled: false, name: '', iconSvg: '' },
      },
    },
    fetchImpl: async (url, init) => {
      savedCalls.push({ url, init })
      return new Response(init?.body || '{}', { status: 200 })
    },
  })

  // Boot should apply default aurora-blue tokens immediately
  assert.ok(appliedLayers.has('custom-theme'))
  assert.equal(appliedLayers.get('custom-theme')['--dsw-alias-bg-base'].light, '#f8fafc')
  assert.equal(slotRegs.length, 0, 'Brand slots stay unregistered when brand.enabled is false')

  // Enabling brand registers both sidebar.brand.mark and sidebar.brand.name at priority -10
  await controller.saveState({
    ...controller.getSnapshot().state,
    brand: {
      enabled: true,
      name: 'Studio UI',
      iconSvg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>',
    },
  })
  assert.equal(slotRegs.length, 2)
  assert.equal(slotRegs.find((r) => r.opts.name === 'sidebar.brand.mark').opts.priority, -10)
  assert.equal(slotRegs.find((r) => r.opts.name === 'sidebar.brand.name').opts.priority, -10)
  assert.ok(JSON.parse(fakeStorageMap.get(STORAGE_KEY)).brand.name === 'Studio UI')

  // Verify brand name/mark components render clean HTML
  const markHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(slotRegs.find((r) => r.opts.name === 'sidebar.brand.mark').comp, { size: 24 }),
  )
  const nameHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(slotRegs.find((r) => r.opts.name === 'sidebar.brand.name').comp, {}),
  )
  assert.ok(markHtml.includes('data:image/svg+xml'))
  assert.ok(nameHtml.includes('Studio UI'))

  // Render settings page in Chinese and verify core sections
  const SettingsPage = createThemeSettingsPage({
    React,
    controller,
    getLocale: () => 'zh-CN',
    subscribeLocale: () => () => {},
  })
  const pageHtml = ReactDOMServer.renderToStaticMarkup(React.createElement(SettingsPage, {}))
  assert.ok(pageHtml.includes('自定义主题与配色 Token'))
  assert.ok(pageHtml.includes('极光蔚蓝（默认）'))
  assert.ok(pageHtml.includes('--dsw-alias-bg-base'))
  assert.ok(pageHtml.includes('Studio UI'))
  assert.ok(!pageHtml.includes('ct-status-pill'), 'Toolbar should not render status pill inline before buttons')
  assert.ok(!pageHtml.includes('立即保存'), 'Toolbar should not show redundant Save button when changes auto-save')
  assert.ok(pageHtml.includes('恢复默认主题'))
  assert.ok(SETTINGS_CSS.includes('.ct-btn:not(.ct-btn-primary):hover:not(:disabled)'))
  assert.ok(SETTINGS_CSS.includes('.ct-btn.ct-btn-primary:hover:not(:disabled)'))
  assert.ok(SETTINGS_CSS.includes('.ct-toast-wrap'))

  const seqBefore = controller.getSnapshot().statusSeq
  await controller.saveState({ ...controller.getSnapshot().state })
  assert.equal(controller.getSnapshot().statusSeq, seqBefore + 1, 'statusSeq should increment on every completed save')

  // Disabling custom theme removes token overrides and restores official brand slots
  await controller.saveState({
    ...controller.getSnapshot().state,
    enabled: false,
  })
  assert.equal(appliedLayers.has('custom-theme'), false)
  assert.equal(slotRegs.length, 0)

  controller.dispose()
}

// 2. Full bundle VM load + Cordis Service wiring & unload cleanup
{
  globalThis.window.localStorage.setItem(STORAGE_KEY, '')
  const appendedStyles = []
  globalThis.document = {
    head: {
      querySelector(sel) {
        return appendedStyles.find((s) => sel.includes(s.attributes['data-plugin'])) || null
      },
      appendChild(el) { appendedStyles.push(el) },
    },
    createElement(tag) {
      return {
        tagName: tag.toUpperCase(),
        attributes: {},
        textContent: '',
        setAttribute(k, v) { this.attributes[k] = v },
        remove() {
          const i = appendedStyles.indexOf(this)
          if (i >= 0) appendedStyles.splice(i, 1)
        },
      }
    },
  }

  let entryDef = null
  const bundleSource = readFileSync(join(PLUGIN_DIR, 'client.js'), 'utf8')
  vm.runInNewContext(bundleSource, {
    get document() { return globalThis.document },
    window: {
      localStorage: globalThis.window.localStorage,
      addEventListener() {},
      removeEventListener() {},
      __ModuleLoader__: {
        load(def) { entryDef = def },
      },
    },
  })

  const exported = entryDef.factory((spec) => {
    if (spec === 'react') return React
    throw new Error(`Unexpected require ${spec}`)
  })

  const regs = []
  let activeLang = 'en-US'
  const localeListeners = new Set()

  class MockSlots extends Service {
    constructor(ctx) {
      super(ctx, 'slots', true)
    }
    inject(_k, cb) {
      const dispose = cb()
      return this.ctx.effect(() => dispose, 'test inject')
    }
    register(opts, comp) {
      const rec = { opts, comp }
      regs.push(rec)
      return () => {
        const i = regs.indexOf(rec)
        if (i >= 0) regs.splice(i, 1)
      }
    }
  }

  const layers = new Map()
  const ctx = new Context()
  ctx.plugin(MockSlots)
  ctx.provide('locale', {
    getSnapshot() { return { active: activeLang } },
    subscribe(fn) {
      localeListeners.add(fn)
      return () => localeListeners.delete(fn)
    },
  })
  ctx.provide('theme', {
    getTheme() { return { preference: 'system', active: { id: 'light', colorScheme: 'light', tokens: {} } } },
    setTheme() {},
    overrideTokens(src, tok) {
      layers.set(src, tok)
      return () => { if (layers.get(src) === tok) layers.delete(src) }
    },
  })

  const fiber = ctx.plugin(exported)
  await fiber.inertia
  await new Promise((r) => setTimeout(r, 20))

  assert.equal(appendedStyles.length, 1)
  assert.ok(regs.some((r) => r.opts.name === 'settings.section' && r.opts.id === 'custom-theme' && r.opts.label === 'Custom Theme'))
  assert.ok(regs.some((r) => r.opts.name === 'settings.section.icon' && r.opts.id === 'custom-theme'))
  assert.ok(layers.has('custom-theme'))

  // Language change dynamically updates settings nav label
  activeLang = 'zh-CN'
  for (const fn of localeListeners) fn({ active: activeLang })
  assert.ok(regs.some((r) => r.opts.name === 'settings.section' && r.opts.label === '自定义主题'))

  await fiber.dispose()
  assert.equal(appendedStyles.length, 0)
  assert.equal(regs.length, 0)
  assert.equal(layers.has('custom-theme'), false)
  await ctx.fiber.dispose()
}

console.log('client-live ok')
