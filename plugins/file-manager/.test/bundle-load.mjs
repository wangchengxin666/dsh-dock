/**
 * Load `client.js` the way the browser module system does: execute it in a
 * sandbox with a `window.__ModuleLoader__.load` recorder, then materialize the
 * factory with a `require` standing in for the shell's module table.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'
import './deps.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const source = readFileSync(join(root, 'client.js'), 'utf8')
let registered
const sandbox = {
  window: { __ModuleLoader__: { load: (entry) => { registered = entry } } },
  console,
}
vm.runInNewContext(source, sandbox, { filename: 'client.js' })
console.log('registered id:', registered?.id)
console.log('factory is function:', typeof registered?.factory === 'function')

const calls = []
const requireStub = (spec) => {
  calls.push(spec)
  if (spec === 'react') {
    return {
      createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter(c => c !== null && c !== undefined) }),
      useCallback: fn => fn, useEffect: () => {}, useId: () => 'id', useMemo: fn => fn(), useRef: v => ({ current: v }), useState: v => [typeof v === 'function' ? v() : v, () => {}],
    }
  }
  if (spec === 'zod') return { strictObject: () => ({}) }
  if (spec === 'react-dom') return { createPortal: node => node }
  throw new Error(`unexpected require(${spec})`)
}
const plugin = registered.factory(requireStub)
console.log('plugin keys:', Object.keys(plugin).join(','))
console.log('inject:', plugin.inject.join(','))

// Apply against a stub context that records slot registrations.
const slots = []
const locale = { register: (ns, dicts) => { locale.registered = [ns, Object.keys(dicts)]; return () => {} }, bind: () => (key) => key }
let installed
const ctx = {
  locale,
  remote: { $mount: async () => { installed = { list: async () => ({ ok: true, value: {} }) }; return async () => {} } },
  get: (key) => (key === 'remote.fileManager' ? installed : undefined),
  slots: {
    inject: (name, fn) => { slots.push(name); fn(); return () => {} },
    register: (options, component) => { slots.push(`${options.name}:${options.id ?? options.key}`); return () => {} },
  },
  effect: (fn) => { fn() },
}
await plugin.apply(ctx)
console.log('requires:', calls.join(','))
console.log('locale ns:', locale.registered?.[0], 'locales:', locale.registered?.[1].join('/'))
console.log('slots registered:', slots.join(' | '))
