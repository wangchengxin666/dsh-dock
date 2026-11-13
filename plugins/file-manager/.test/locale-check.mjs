/**
 * Locale dictionaries must be flat strings with `{name}` placeholders: the
 * shell's `t()` does `template.replace(...)`, and a function value reaches
 * React as a child and blanks the slot. This also proves every key the page
 * asks for exists in both languages.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { en, zh } from '../src/client/locale.js'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const page = readFileSync(join(root, 'src/client/page.js'), 'utf8')
const problems = []

for (const [name, dict] of [['en', en], ['zh', zh]]) {
  for (const [key, value] of Object.entries(dict)) {
    if (typeof value !== 'string') problems.push(`${name}.${key} is ${typeof value}, not a string`)
  }
}
const missing = (dict, key) => !Object.hasOwn(dict, key)
for (const key of new Set([...page.matchAll(/\bt\('([A-Za-z0-9_]+)'/g)].map(match => match[1]))) {
  if (missing(en, key)) problems.push(`page uses "${key}" but en has no such key`)
  if (missing(zh, key)) problems.push(`page uses "${key}" but zh has no such key`)
}
for (const key of Object.keys(en)) if (!Object.hasOwn(zh, key)) problems.push(`zh is missing "${key}"`)
for (const key of Object.keys(zh)) if (!Object.hasOwn(en, key)) problems.push(`en is missing "${key}"`)

/** Mirror of the shell's substitution so a bad placeholder shows up here. */
const translate = (dict, key, params) => {
  const template = dict[key] ?? key
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
}
const rendered = translate(en, 'uploadDone', { count: 3 })
if (rendered !== '3 file(s) uploaded.') problems.push(`substitution failed: ${rendered}`)
const unfilled = translate(en, 'deleteConfirmOne')
if (!unfilled.includes('{name}')) problems.push('a parameterized message should keep its placeholder when no params are given')

console.log(problems.length === 0 ? 'ok   locale dictionaries are plain templates and cover every key' : `FAIL ${problems.join('; ')}`)
process.exitCode = problems.length === 0 ? 0 : 1
