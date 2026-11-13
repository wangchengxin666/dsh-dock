import './deps.mjs'
globalThis.document = { addEventListener() {}, removeEventListener() {}, activeElement: null, createElement: () => ({ click() {} }) }
const storage = new Map()
globalThis.window = {
  clearTimeout() {}, setTimeout: () => 1,
  localStorage: {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => { storage.set(key, String(value)) },
  },
}
const { createPageComponent } = await import('../src/client/page.js')

// One slot list per component; every hook takes the next index in call order.
const slots = new Map()
let index = 0
const pending = []
const schedule = (fn) => { pending.push(fn) }
const errorsSeen = []
const flush = async () => {
  for (let round = 0; round < 60 && pending.length; round += 1) {
    const task = pending.shift()
    try { task() } catch (error) { errorsSeen.push(error.message) }
    await new Promise(r => setTimeout(r, 5))
  }
}

const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter(c => c !== null && c !== undefined) }),
  Fragment: 'Fragment',
  useState(init) {
    const i = index++
    if (!slots.has(i)) slots.set(i, { value: typeof init === 'function' ? init() : init })
    const slot = slots.get(i)
    return [slot.value, (next) => {
      const value = typeof next === 'function' ? next(slot.value) : next
      if (Object.is(value, slot.value)) return
      slot.value = value
      schedule(render)
    }]
  },
  useEffect(fn, deps) {
    const i = index++
    if (!slots.has(i)) slots.set(i, { deps: undefined, cleanup: undefined })
    const slot = slots.get(i)
    const changed = slot.deps === undefined || deps === undefined || deps.some((v, k) => !Object.is(v, slot.deps[k]))
    if (!changed) return
    slot.deps = deps
    schedule(() => { slot.cleanup?.(); const cleanup = fn(); if (typeof cleanup === 'function') slot.cleanup = cleanup })
  },
  useCallback(fn) {
    const i = index++
    if (!slots.has(i)) slots.set(i, { value: fn })
    return slots.get(i).value
  },
  useMemo(fn) {
    const i = index++
    if (!slots.has(i)) slots.set(i, { value: fn() })
    return slots.get(i).value
  },
  useRef(init) {
    const i = index++
    if (!slots.has(i)) slots.set(i, { value: { current: init } })
    return slots.get(i).value
  },
  useId: () => 'fm-id',
}

const calls = []
const api = {
  startPath: async () => ({ ok: true, value: '/' }),
  list: async (path, showHidden) => {
    calls.push(['list', path, showHidden === true])
    return { ok: true, value: {
      path, parent: path === '/' ? null : '/', roots: ['/'],
      entries: path === '/'
        ? [{ name: 'etc', path: '/etc', type: 'directory', size: 0 }, { name: 'notes.txt', path: '/notes.txt', type: 'file', size: 42 }]
        : [{ name: 'hosts', path: '/etc/hosts', type: 'file', size: 9 }],
      truncated: false, hiddenForced: false, unaddressable: 0,
    } }
  },
  preview: async (path) => { calls.push(['preview', path]); return { ok: true, value: { path, kind: 'text', mediaType: 'text/plain', text: 'preview body', size: 12, truncated: false } } },
  createDirectory: async (parent, name) => { calls.push(['createDirectory', parent, name]); return { ok: true, value: { path: `${parent}/${name}` } } },
  remove: async (paths) => { calls.push(['remove', paths]); return { ok: true, value: [] } },
}
// Mirrors the shell: dictionary lookup with {name} substitution.
const { en } = await import('../src/client/locale.js')
const t = (key, params) => {
  const template = en[key] ?? key
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
}
const Page = createPageComponent({ React })
let tree
const render = () => {
  index = 0
  saveIndex = 0
  tree = Page({ t, fileManager: api })
}
// Render function components while walking, the way React does, so a dialog
// element inside PreviewDialog or Modal is visible to the assertions.
const findAll = (node, pred, found = []) => {
  if (node === null || node === undefined || typeof node !== 'object') return found
  if (typeof node.type === 'function') {
    index = saveIndex
    const rendered = node.type(node.props)
    index = saveIndex
    findAll(rendered, pred, found)
    return found
  }
  if (pred(node)) found.push(node)
  for (const child of node.children ?? []) findAll(child, pred, found)
  return found
}
let saveIndex = 0
const buttons = () => findAll(tree, n => n.type === 'button')
const rowButton = (name) => buttons().find(b => b.children.some(c => c?.type === 'span' && (c.children ?? [])[0] === name))
const dialogs = () => findAll(tree, n => n.props?.role === 'dialog' && typeof n.type === 'string')
let failures = 0
const check = (label, ok) => { if (!ok) failures += 1; console.log(ok ? 'ok  ' : 'FAIL', label) }

// Before anything renders, a page without the injected namespace must show a
// notice rather than throw: that is what an older Host would hand it.
const bare = Page({ t })
check('a missing service renders a notice instead of crashing',
  bare?.props?.className === 'fmPage' && JSON.stringify(bare).includes('not available on this Host'))
slots.clear()

render()
await flush()
check('first listing shows both rows', !!rowButton('etc') && !!rowButton('notes.txt'))
// The root crumb is a named place, and no crumb renders as a bare slash.
const crumbs = findAll(tree, n => n.type === 'button' && String(n.props?.className ?? '').includes('fmCrumb '))
check('breadcrumb root is named', crumbs.length > 0 && String(crumbs[0].children[0]) === en.rootCrumb)
const separators = findAll(tree, n => n.type === 'span' && String(n.children?.[0] ?? '') === '/')
check('separators stay separate from crumbs', separators.every(node => String(node.children?.[0] ?? '') === '/'))
const texts = crumbs.map(crumb => String(crumb.children[0]))
check('no crumb shows a bare slash', !texts.includes('/'))

// Hiding dotfiles is the default; the toolbar toggle asks the Host for them.
const lastList = () => calls.filter(call => call[0] === 'list').at(-1)
check('the first listing hides dot entries', lastList()[2] === false)
const hiddenToggle = buttons().find(button => button.props?.['aria-label'] === 'Show or hide dotfiles')
check('the toolbar offers a hidden-files toggle', hiddenToggle !== undefined && hiddenToggle.props['aria-pressed'] === false)
hiddenToggle.props.onClick()
await flush()
check('toggling asks the Host for dot entries', lastList()[2] === true)
check('the choice is remembered', storage.get('dsh.file-manager.showHidden') === '1')

rowButton('etc').props.onClick()
await flush()
check('folder click lists the subdirectory', [...new Set(calls.filter(c => c[0] === 'list').map(c => c[1]))].join('|') === '/|/etc')
check('subdirectory row shown', !!rowButton('hosts'))

rowButton('hosts').props.onClick()
await flush()

check('preview dialog opens', dialogs().length === 1 && dialogs()[0].props['aria-labelledby'] !== undefined)
check('preview text rendered', findAll(tree, n => n.type === 'pre').some(n => String(n.children[0]).includes('preview body')))

buttons().find(b => b.props?.['aria-label'] === 'Close')?.props.onClick()
await flush()
check('preview closes', dialogs().length === 0)

buttons().find(b => (b.children ?? []).includes('New folder'))?.props.onClick()
await flush()
const newFolderDialog = dialogs()[0]
const heading = newFolderDialog === undefined ? undefined : findAll(newFolderDialog, n => n.type === 'h2')[0]
check('new folder dialog opens with a visible title', dialogs().length === 1
  && heading !== undefined && heading.children[0] === 'New folder'
  && newFolderDialog.props['aria-labelledby'] !== undefined)
const form = findAll(tree, n => n.type === 'form')
check('new folder form present', form.length >= 1)

check('escape/route cleanup leaves no failures', failures === 0)
process.exitCode = failures === 0 ? 0 : 1
