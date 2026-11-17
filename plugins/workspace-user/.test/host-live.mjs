import assert from 'node:assert/strict'
import { importExternal } from './deps.mjs'
import * as hostPlugin from '../index.js'

const { Context } = await importExternal('@deepseek-ai/cordis')

const ctx = new Context()
const routes = []

ctx.provide('connection', {
  fetch: {
    register(route) {
      routes.push(route)
      return () => {
        const idx = routes.indexOf(route)
        if (idx >= 0) routes.splice(idx, 1)
      }
    },
  },
})

const fiber = ctx.plugin(hostPlugin)
await fiber.inertia
await new Promise((r) => setTimeout(r, 20))

const route = routes.find((r) => r.path === '/api/workspace-user.current')
assert.ok(route, 'Expected /api/workspace-user.current route to be registered')
assert.deepEqual(route.methods, ['GET'])

// 1. Standard user with URL-encoded UTF-8 Chinese name
{
  const req = new Request('http://localhost/api/workspace-user.current', {
    headers: {
      'X-Auth-Request-Email': 'Alice@Example.com',
      'X-Auth-Request-Name': encodeURIComponent('爱丽丝'),
      'X-Auth-Request-Admin': 'false',
      'X-Sandbox-Owner': 'alice@example.com',
      'X-Sandbox-Owner-Name': encodeURIComponent('爱丽丝'),
    },
  })
  const res = await route.fetch(req)
  assert.equal(res.status, 200)
  const data = await res.json()
  assert.equal(data.source, 'headers')
  assert.equal(data.viewerEmail, 'alice@example.com')
  assert.equal(data.viewerName, '爱丽丝')
  assert.equal(data.isAdmin, false)
  assert.equal(data.ownerEmail, 'alice@example.com')
  assert.equal(data.ownerName, '爱丽丝')
  assert.equal(data.hasExtendedHeaders, true)
}

// 2. Admin inspecting another user's workspace
{
  const req = new Request('http://localhost/api/workspace-user.current', {
    headers: {
      'X-Auth-Request-Email': 'admin@example.com',
      'X-Auth-Request-Name': 'Root%20Admin',
      'X-Auth-Request-Admin': 'true',
      'X-Sandbox-Owner': 'bob@example.com',
      'X-Sandbox-Owner-Name': 'Bob',
    },
  })
  const res = await route.fetch(req)
  const data = await res.json()
  assert.equal(data.viewerEmail, 'admin@example.com')
  assert.equal(data.viewerName, 'Root Admin')
  assert.equal(data.isAdmin, true)
  assert.equal(data.ownerEmail, 'bob@example.com')
  assert.equal(data.ownerName, 'Bob')
}

// 3. Env fallback and malformed percent-encoding resilience
{
  const payload = hostPlugin.buildIdentityPayload(
    new Headers({ 'x-auth-request-name': '%E0%A4%A' }),
    { DSH_OWNER_EMAIL: 'dev@example.com', SANDBOX_SLUG: 'dev-1' },
  )
  assert.equal(payload.source, 'env')
  assert.equal(payload.viewerEmail, 'dev@example.com')
  assert.equal(payload.ownerEmail, 'dev@example.com')
  assert.equal(payload.sandboxSlug, 'dev-1')
  assert.equal(payload.viewerName, '%E0%A4%A')
}

await ctx.fiber.dispose()
assert.equal(routes.length, 0, 'Route should unregister on context stop')
console.log('host-live ok')
