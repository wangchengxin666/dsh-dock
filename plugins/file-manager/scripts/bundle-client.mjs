/**
 * Assemble `client.js` from `client.js.template` and the page modules.
 *
 * DSH serves one browser file per client package (`exports["./client"]`); the
 * loader accepts only that file and registers the factory inside it, so the
 * page's ES modules are inlined here as CommonJS segments inside the factory
 * body. Every relative import in `src/client/` must therefore become a
 * `__mods[...]` lookup: this script rewrites the import lines, keeps the
 * `export` declarations, and concatenates the segments in dependency order.
 *
 * Run with `node scripts/bundle-client.mjs` after editing any page module.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const template = readFileSync(join(root, 'client.js.template'), 'utf8')

/** Page modules in dependency order; each key is the module id written into the bundle. */
const MODULES = [
  { id: 'styles', file: 'src/client/styles.js' },
  { id: 'locale', file: 'src/client/locale.js' },
  { id: 'icon', file: 'src/client/icon.js' },
  { id: 'contract', file: 'src/client/contract.js' },
  { id: 'page', file: 'src/client/page.js' },
]

/**
 * Rewrite one ES module into a factory-body segment.
 * @param source - the module text.
 * @param id - the module id used by the inlined module table.
 * @returns the segment text.
 */
function toSegment(source, id) {
  let text = source
  // `import { a, b as c } from './x.js'` -> const { a, b: c } = __mods.x
  text = text.replace(/^import\s*\{([^}]*)\}\s*from\s*'\.\/([\w.-]+)\.js'\s*$/gm, (_match, names, target) => {
    const destructured = names.split(',').map(part => part.trim()).filter(Boolean)
      .map(part => part.replace(/\s+as\s+/, ': '))
      .join(', ')
    return `const { ${destructured} } = __mods.${target}`
  })
  // Remaining bare imports are unsupported on purpose: the page must not depend
  // on another package's runtime values.
  if (/^import\s/m.test(text)) {
    throw new Error(`${id}: only relative named imports are supported inside the client bundle`)
  }
  // `export const x = ...` -> `const x = ...` plus an exports assignment at the end.
  const exported = []
  text = text.replace(/^export\s+const\s+([A-Za-z_$][\w$]*)/gm, (_match, name) => {
    exported.push(name)
    return `const ${name}`
  })
  text = text.replace(/^export\s+function\s+([A-Za-z_$][\w$]*)/gm, (_match, name) => {
    exported.push(name)
    return `function ${name}`
  })
  text = text.replace(/^export\s+\{([^}]*)\}\s*$/gm, (_match, names) => {
    for (const part of names.split(',').map(item => item.trim()).filter(Boolean)) {
      exported.push(part.replace(/\s+as\s+/, ': '))
    }
    return ''
  })
  if (/^export\s/m.test(text)) throw new Error(`${id}: unsupported export form left in the module`)
  const fields = exported.map((entry) => entry.replace(/^([\w$]+)$/, '$1: $1').replace(/: /, ': '))
  // Each module keeps its own function scope, exactly as a module file would.
  return `    // ${id}\n    __mods.${id} = (() => {\n${indent(indent(text))}\n      return { ${fields.join(', ')} }\n    })()\n`
}

/**
 * Indent a segment to sit inside the factory body.
 * @param text - segment text.
 * @returns indented text.
 */
function indent(text) {
  return text.trimEnd().split('\n').map(line => (line === '' ? '' : `    ${line}`)).join('\n')
}

const table = `    const __mods = {}
    /**
     * Collect the inlined page modules.
     * @returns the page modules by id.
     */
    const modules = () => __mods
`
const segments = MODULES.map(({ id, file }) => toSegment(readFileSync(join(root, file), 'utf8'), id)).join('\n')
const body = `${table}\n${segments}`
const output = template.replace('    /*__MODULES__*/', body.trimEnd())
writeFileSync(join(root, 'client.js'), output)
console.log(`client.js written (${output.length} bytes)`)
