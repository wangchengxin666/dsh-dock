/**
 * A Remote endpoint may not take the name of a member on the Client namespace
 * service: `remote.<ns>.<method>` and the service share one object, so a clash
 * throws "method ... conflicts with its namespace service" and the whole plugin
 * fails to activate. This mirrors the shell's reserved set.
 */
import { SPECS } from '../src/client/contract.js'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const host = readFileSync(join(root, 'index.js'), 'utf8')

// Fields reserved on the namespace service instance.
const RESERVED_FIELDS = new Set(['ctx', 'empty', 'invokeRemote', 'methods', 'name', 'namespace'])
// Members declared on the namespace service class (Cordis Service adds only the constructor).
const RESERVED_METHODS = new Set(['constructor', 'assertMethodAvailable', 'has', 'installDirect', 'installScoped', 'install', 'remove'])

const problems = []
for (const method of Object.keys(SPECS)) {
  if (RESERVED_FIELDS.has(method)) problems.push(`"${method}" is a namespace service field`)
  if (RESERVED_METHODS.has(method)) problems.push(`"${method}" is a namespace service method`)
}
// The Host marker list and the wire contract must describe the same endpoints.
const marked = /const EXPORTED_METHODS = \[([^\]]*)\]/.exec(host)
const names = marked === null ? [] : [...marked[1].matchAll(/'([^']+)'/g)].map(match => match[1])
const missingInHost = Object.keys(SPECS).filter(name => !names.includes(name))
const missingInContract = names.filter(name => !Object.keys(SPECS).includes(name))
if (missingInHost.length > 0) problems.push(`Host does not mark: ${missingInHost.join(', ')}`)
if (missingInContract.length > 0) problems.push(`contract does not declare: ${missingInContract.join(', ')}`)

console.log(problems.length === 0
  ? `ok   ${names.length} endpoints avoid the namespace service's own members`
  : `FAIL ${problems.join('; ')}`)
process.exitCode = problems.length === 0 ? 0 : 1
