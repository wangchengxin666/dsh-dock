/**
 * The sidebar contract: one list entry whose id matches the `main` key, a
 * string label, and an icon that renders from the requested size. A component
 * that throws here takes the whole feature off the sidebar.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'
import { MAPPING } from './deps.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const zodModule = await import(MAPPING['zod'])
const zod = zodModule.default ?? zodModule.z ?? zodModule
const { en } = await import('../src/client/locale.js')

let registered
vm.runInNewContext(readFileSync(join(root, 'client.js'), 'utf8'), {
  window: { __ModuleLoader__: { load: (entry) => { registered = entry } } },
  console,
}, { filename: 'client.js' })

// A React stub whose createElement records the tree, and whose hooks are inert.
const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
  Fragment: 'Fragment',
  useCallback: (fn) => fn,
  useEffect: () => {},
  useId: () => 'id',
  useMemo: (fn) => fn(),
  useRef: (value) => ({ current: value }),
  useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
}
const requireStub = (spec) => {
  if (spec === 'react') return React
  if (spec === 'zod') return zod
  if (spec === 'react-dom') return { createPortal: (node) => node }
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

let installed
const rows = []
const ctx = {
  locale: {
    register: () => () => {},
    bind: (ns) => (key, params) => {
      const template = en[key] ?? key
      if (params === undefined) return template
      return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
    },
  },
  remote: guardedRemote({
    $mount: async () => {
      installed = { list: async () => ({ ok: true, value: {} }) }
      return async () => {}
    },
  }),
  get: (key) => (key === 'remote.fileManager' ? installed : undefined),
  slots: {
    inject: (name, setup) => { const dispose = setup(); return typeof dispose === 'function' ? dispose : () => {} },
    register: (options, component) => { rows.push({ options, component }); return () => {} },
  },
  effect: (body) => { const value = body(); return () => { if (typeof value === 'function') value() } },
}

const plugin = registered.factory(requireStub)
await plugin.apply(ctx)

const problems = []
const row = rows.find(entry => entry.options.name === 'sidebar.panellist')
const page = rows.find(entry => entry.options.name === 'main')
if (row === undefined) problems.push('no sidebar.panellist registration')
if (page === undefined) problems.push('no main registration')
if (row !== undefined) {
  if (row.options.id !== page?.options.key) problems.push('the row id must equal the main key')
  if (typeof row.options.label !== 'function') problems.push('the row label must be a thunk')
  else {
    const label = row.options.label()
    if (typeof label !== 'string') problems.push(`the row label rendered as ${typeof label}, not a string`)
    else if (label !== en.panel) problems.push(`unexpected label ${JSON.stringify(label)}`)
  }
  // The icon must render for the sizes the sidebar asks for.
  for (const size of [16, 20, 36]) {
    let node
    try { node = row.component({ size, active: false }) } catch (error) { problems.push(`icon threw at ${size}px: ${error.message}`); continue }
    if (node?.type !== 'svg') problems.push(`icon at ${size}px is not an svg element`)
    else if (node.props.width !== size || node.props.height !== size) problems.push(`icon at ${size}px has the wrong edge`)
  }
  if (row.options.order !== 20) problems.push('the row order changed unexpectedly')
}
if (page !== undefined) {
  const injected = page.options.inject?.()
  if (typeof injected?.fileManager?.list !== 'function') problems.push('the page is not given the mounted namespace')
}

console.log(problems.length === 0 ? 'ok   sidebar row and page registration satisfy the slot contract' : `FAIL ${problems.join('; ')}`)
process.exitCode = problems.length === 0 ? 0 : 1
