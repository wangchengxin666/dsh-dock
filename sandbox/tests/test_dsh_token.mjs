import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const scriptPath = path.resolve(here, '../rootfs/usr/local/bin/dsh-token')

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      srv.close((err) => (err ? reject(err) : resolve(port)))
    })
  })
}

async function startTokenHelper(envOverrides) {
  const port = await getFreePort()
  const child = spawn(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      DSH_TOKEN_PORT: String(port),
      ...envOverrides,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  await new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => reject(new Error(`dsh-token startup timeout: ${stderr}`)), 5000)
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
      if (stdout.includes('dsh-token listening')) {
        clearTimeout(timer)
        resolve()
      }
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`dsh-token exited early (${code}): ${stderr}`))
    })
  })

  return {
    port,
    stop: () =>
      new Promise((resolve) => {
        if (child.killed || child.exitCode !== null) {
          resolve()
          return
        }
        child.once('exit', () => resolve())
        child.kill('SIGTERM')
      }),
  }
}

test('dsh-token returns 503 before web.log is ready and 404 on unknown routes', async (t) => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-token-empty-'))
  t.after(() => fs.rmSync(tmpHome, { recursive: true, force: true }))

  const srv = await startTokenHelper({ DSH_HOME: tmpHome })
  t.after(() => srv.stop())

  const notFound = await fetch(`http://127.0.0.1:${srv.port}/other`, { redirect: 'manual' })
  assert.equal(notFound.status, 404)

  const starting = await fetch(`http://127.0.0.1:${srv.port}/_dsh-token`, { redirect: 'manual' })
  assert.equal(starting.status, 503)
  assert.equal(starting.headers.get('retry-after'), '2')
})

test('dsh-token reads latest launch token and honors base path, HTTPS cookie, and cookie sanitization', async (t) => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-token-ready-'))
  t.after(() => fs.rmSync(tmpHome, { recursive: true, force: true }))

  fs.writeFileSync(
    path.join(tmpHome, 'web.log'),
    [
      'booting...',
      'dsh web: http://127.0.0.1:3080/?token=first-token',
      'malformed line without url',
      'dsh web: http://127.0.0.1:3080/?token=latest+token%2B1',
    ].join('\n'),
    'utf8',
  )

  const srv = await startTokenHelper({
    DSH_HOME: tmpHome,
    SANDBOX_BASE_PATH: '/s/alice/',
    PUBLIC_SCHEME: 'https',
    DSH_TOKEN_COOKIE_NAME: 'dsh.seen:alice',
  })
  t.after(() => srv.stop())

  const res = await fetch(`http://127.0.0.1:${srv.port}/s/alice/_dsh-token`, { redirect: 'manual' })
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), '/s/alice/dsh/?token=latest%20token%2B1')
  assert.equal(res.headers.get('cache-control'), 'no-store')

  const cookie = res.headers.get('set-cookie') || ''
  assert.match(cookie, /^dsh_seen_alice=1;/)
  assert.match(cookie, /Path=\/s\/alice\/dsh\/;/)
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /SameSite=Lax/)
  assert.match(cookie, /Secure/)
})
