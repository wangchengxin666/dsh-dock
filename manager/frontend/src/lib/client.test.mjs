import assert from 'node:assert/strict'
import test from 'node:test'
import { apiFetch, parseApiErrorDetail, resolveInitialView } from './client.ts'

test('parseApiErrorDetail handles string detail, Pydantic list detail, and fallbacks', () => {
  assert.equal(parseApiErrorDetail({ detail: '未授权访问' }, 401), '未授权访问')
  assert.equal(
    parseApiErrorDetail({ detail: [{ msg: 'field required' }, { msg: 'invalid email' }] }, 422),
    'field required; invalid email',
  )
  assert.equal(parseApiErrorDetail({}, 500), 'HTTP 500')
  assert.equal(parseApiErrorDetail(null, 502), 'HTTP 502')
})

test('resolveInitialView enforces login, user /my isolation, and admin /admin routing', () => {
  assert.equal(resolveInitialView({ authenticated: false, admin: false }, '/admin'), 'login')
  assert.equal(resolveInitialView({ authenticated: true, admin: false }, '/admin'), 'my')
  assert.equal(resolveInitialView({ authenticated: true, admin: true }, '/my'), 'my')
  assert.equal(resolveInitialView({ authenticated: true, admin: true }, '/admin'), 'admin')
  assert.equal(resolveInitialView({ authenticated: true, admin: true }, '/'), 'admin')
})

test('apiFetch returns parsed JSON on success and surfaces FastAPI detail on HTTP errors', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ status: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  const ok = await apiFetch('/healthz')
  assert.deepEqual(ok, { status: 'ok' })

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ detail: 'permission denied' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })

  await assert.rejects(() => apiFetch('/api/overview'), { message: 'permission denied' })
})
