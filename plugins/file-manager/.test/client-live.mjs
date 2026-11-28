/**
 * Load the built bundle the way the browser does, but with the real `zod` and
 * a React stub, then apply it against a Cordis context whose `remote` is
 * replaced by a recorder. This proves the contribution mounts and the slots
 * register without touching the running GUI.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'
import { MAPPING } from './deps.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const source = readFileSync(join(root, 'client.js'), 'utf8')
let registered
vm.runInNewContext(source, { window: { __ModuleLoader__: { load: (entry) => { registered = entry } } }, console }, { filename: 'client.js' })

const zodNamespace = (await import(MAPPING['zod'])).default
// CommonJS interop hands back the module namespace; the browser table seeds the
// zod instance itself, which is what the bundle expects.
const zod = zodNamespace.default ?? zodNamespace.z ?? zodNamespace
const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter(c => c !== null && c !== undefined) }),
  Fragment: 'Fragment',
  useCallback: fn => fn,
  useEffect: () => {},
  useId: () => 'fm-id',
  useMemo: fn => fn(),
  useRef: init => ({ current: init }),
  useState: init => [typeof init === 'function' ? init() : init, () => {}],
}
const requireStub = (spec) => {
  if (spec === 'react') return React
  if (spec === 'zod') return zod
  if (spec === 'react-dom') return { createPortal: node => node }
  throw new Error(`unexpected require(${spec})`)
}

/** Cordis refuses service property reads the fiber did not declare in `inject`. */
function guardedRemote(initial) {
  const allowed = new Set(['$mount', '$stream', '$host', '$on'])
  const state = { ...initial }
  return new Proxy(state, {
    get(target, property) {
      if (typeof property !== 'string') return Reflect.get(target, property)
      if (!allowed.has(property) && !(property in target)) {
        throw new Error(`cannot get property "remote.${property}" without inject`)
      }
      return Reflect.get(target, property)
    },
  })
}

const plugin = registered.factory(requireStub)

let mounted
const contributions = []
const slots = []
const locale = { register: (ns, dicts) => { locale.ns = [ns, dicts]; return () => {} }, bind: () => (key) => key }
const remoteFace = guardedRemote({
  // Mounting installs the namespace, so the plugin reads it back with ctx.get().
  $mount: async (contribution) => {
    mounted = contribution
    contributions.push(contribution.package)
    installed = { list: async () => ({ ok: true, value: [] }) }
    return async () => {}
  },
})
let installed
const ctx = {
  get: (key) => (key === 'remote.fileManager' ? installed : undefined),
  locale,
  remote: remoteFace,
  slots: { inject: (name, fn) => { fn(); return () => {} }, register: (options, component) => { slots.push([options.name, options.id ?? options.key, typeof component, options.inject]); return () => {} } },
  effect: (fn) => { fn(); return () => {} },
}
await plugin.apply(ctx)
console.log('mounted package:', contributions.join(','))
console.log('remote endpoints:', mounted.descriptors.map(d => `${d.namespace}/${d.method}`).join(', '))
console.log('input parser works:', JSON.stringify(mounted.methods['fileManager/list'].input({ strict: true }).create().parse({ path: '/tmp', showHidden: false })))
console.log('locale:', locale.ns[0], Object.keys(locale.ns[1]).join('/'))
console.log('slots:', slots.map(([name, key, type]) => `${name}#${key}(${type})`).join(' | '))
const Icon = slots.find(([name]) => name === 'sidebar.panellist')[2]
const page = slots.find(([name]) => name === 'main')[2]
console.log('both components are functions:', Icon === 'function' && page === 'function')
const mainInject = slots.find(([name]) => name === 'main')[3]?.()
console.log('main receives the namespace:', typeof mainInject?.fileManager?.list === 'function')
