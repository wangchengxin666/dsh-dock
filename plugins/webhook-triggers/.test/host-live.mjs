import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  REPLAY_ENDPOINT,
  RULE_DELETE_ENDPOINT,
  RULE_ROTATE_SECRET_ENDPOINT,
  RULE_SAVE_ENDPOINT,
  STATE_ENDPOINT,
  TEST_FIRE_ENDPOINT,
  WEBHOOK_TOOL_NAMES,
  createWebhookHttpHandler,
  createWebhookStore,
} from '../index.js'
import { wireHarnessRuntime } from '../src/host/harness-bridge.js'

const ENDPOINT_RE = /^\/api\/[a-z0-9-]+(?:\.[a-z0-9-]+)+$/
for (const ep of [
  STATE_ENDPOINT,
  RULE_SAVE_ENDPOINT,
  RULE_DELETE_ENDPOINT,
  RULE_ROTATE_SECRET_ENDPOINT,
  REPLAY_ENDPOINT,
  TEST_FIRE_ENDPOINT,
]) {
  assert.match(ep, ENDPOINT_RE)
}

const tmpHome = mkdtempSync(join(tmpdir(), 'wh-host-test-'))
try {
  const store = createWebhookStore({
    homeDir: tmpHome,
    env: { SANDBOX_PUBLIC_ORIGIN: 'https://ai.example.com' },
  })
  const saved = store.saveRule({
    slug: 'github-ci',
    name: 'GitHub CI',
    auth_mode: 'hmac_sha256',
    prompt_template: 'Check event {{payload.action}} on {{payload.repo}} at {{payload_path}}',
  })
  assert.equal(saved.ok, true)
  assert.equal(saved.rule.endpoint_url, 'https://ai.example.com/hooks/github-ci')
  assert.ok(saved.rule.secret.startsWith('whsec_'))

  const dispatched = []
  const handler = createWebhookHttpHandler({
    store,
    dispatcher: {
      async dispatch(arg) {
        dispatched.push(arg)
        return { ok: true, session_id: 'webhook-github-ci-test' }
      },
    },
  })

  async function invokeHttp({ method = 'POST', url, headers = {}, rawBody = '' }) {
    const buf = Buffer.from(rawBody, 'utf8')
    const req = {
      method,
      url,
      headers: { 'content-type': 'application/json', ...headers },
      socket: { remoteAddress: '127.0.0.1' },
      on(ev, cb) {
        if (ev === 'data' && buf.length > 0) cb(buf)
        if (ev === 'end') cb()
        return this
      },
    }
    let resStatus = 0
    let resBody = ''
    const res = {
      headersSent: false,
      writeHead(code) { resStatus = code; this.headersSent = true },
      end(chunk) { resBody = String(chunk || '') },
    }
    await handler(req, res)
    return { status: resStatus, body: JSON.parse(resBody) }
  }

  // Bad signature -> 401
  const bad = await invokeHttp({
    url: '/hooks/github-ci',
    headers: { 'x-hub-signature-256': 'sha256=deadbeef' },
    rawBody: '{"action":"opened","repo":"demo"}',
  })
  assert.equal(bad.status, 401)

  // Valid HMAC signature + GitHub delivery key -> 202 + archived payload + dispatched
  const bodyStr = '{"action":"opened","repo":"dsh-dock"}'
  const sigHex = createHmac('sha256', saved.rule.secret).update(bodyStr).digest('hex')
  const okRes = await invokeHttp({
    url: '/hooks/github-ci',
    headers: {
      'x-hub-signature-256': `sha256=${sigHex}`,
      'x-github-delivery': 'evt-1001',
    },
    rawBody: bodyStr,
  })
  assert.equal(okRes.status, 202)
  assert.equal(okRes.body.accepted, true)
  assert.ok(existsSync(okRes.body.payload_path))
  const archived = JSON.parse(readFileSync(okRes.body.payload_path, 'utf8'))
  assert.equal(archived.payload.repo, 'dsh-dock')

  // Duplicate delivery header -> 200 duplicate=true
  const dupRes = await invokeHttp({
    url: '/hooks/github-ci',
    headers: {
      'x-hub-signature-256': `sha256=${sigHex}`,
      'x-github-delivery': 'evt-1001',
    },
    rawBody: bodyStr,
  })
  assert.equal(dupRes.status, 200)
  assert.equal(dupRes.body.duplicate, true)

  await new Promise((r) => setTimeout(r, 30))
  assert.equal(dispatched.length, 1)

  // Harness tools & skill
  const tools = new Map()
  let skillProv = null
  wireHarnessRuntime({
    inject(deps, fn) {
      if (deps.includes('skills')) fn({ skills: { registerProvider: (p) => { skillProv = p; return () => {} } }, effect() {} })
      if (deps.includes('tools')) fn({ tools: { register: (t) => { tools.set(t.name, t); return () => {} } }, effect() {} })
    },
  }, store)
  await new Promise((r) => setTimeout(r, 30))
  assert.ok(skillProv)
  assert.deepEqual([...tools.keys()].sort(), [...WEBHOOK_TOOL_NAMES].sort())

  console.log('webhook host-live ok')
} finally {
  rmSync(tmpHome, { recursive: true, force: true })
}
