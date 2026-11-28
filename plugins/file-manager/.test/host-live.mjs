/**
 * Start the Host half through Cordis itself: the plugin row's `apply` must
 * produce the `fileManager` service, its Typert binding, and every byte route.
 */
import { homedir } from 'node:os'
import './deps.mjs'

const { Context } = await import('@deepseek-ai/cordis')
const plugin = await import('../index.js')

const routes = []
const ctx = new Context()
ctx.reflect.provide('connection', { fetch: { register: (route) => { routes.push(route); return async () => {} } } })

const fiber = ctx.plugin(plugin.default, { roots: [], allowOutsideRoots: false })
await fiber
await new Promise(resolve => setTimeout(resolve, 50))

const service = ctx.get('fileManager')
const problems = []
if (fiber.state !== 2) problems.push(`fiber state ${fiber.state}: ${fiber.error?.message ?? 'no error'}`)
if (typeof service?.list !== 'function') problems.push('the fileManager service did not start')
if (service?.typertRemote?.serviceKey !== 'fileManager') problems.push('missing Typert binding')
if (routes.length !== 4) problems.push(`expected 4 byte routes, saw ${routes.length}`)
const paths = routes.map(route => route.path).join(',')
if (paths !== '/api/file-manager.download,/api/file-manager.raw,/api/file-manager.zip,/api/file-manager.upload') {
  problems.push(`unexpected routes: ${paths}`)
}
if (service !== undefined) {
  const start = await service.startPath()
  if (start !== homedir()) problems.push(`start path ${start} is not the home directory`)
  const listing = await service.list(homedir())
  if (!Array.isArray(listing.entries)) problems.push('listing has no entries array')
}

console.log(problems.length === 0 ? 'ok   plugin starts through Cordis with its service, binding, and routes' : `FAIL ${problems.join('; ')}`)
process.exitCode = problems.length === 0 ? 0 : 1
