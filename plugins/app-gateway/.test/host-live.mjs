import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  APP_AUTH_ENDPOINT,
  APP_EXPOSE_ENDPOINT,
  APP_GATEWAY_TOOL_NAMES,
  APP_UNEXPOSE_ENDPOINT,
  SERVICE_ACTION_ENDPOINT,
  SERVICE_ADD_ENDPOINT,
  SERVICE_LOGS_ENDPOINT,
  SERVICE_REMOVE_ENDPOINT,
  STATE_ENDPOINT,
  createAppGatewayService,
} from '../index.js'
import { wireHarnessRuntime } from '../src/host/harness-bridge.js'

const ENDPOINT_RE = /^\/api\/[a-z0-9-]+(?:\.[a-z0-9-]+)+$/
for (const ep of [
  STATE_ENDPOINT,
  APP_EXPOSE_ENDPOINT,
  APP_AUTH_ENDPOINT,
  APP_UNEXPOSE_ENDPOINT,
  SERVICE_ACTION_ENDPOINT,
  SERVICE_ADD_ENDPOINT,
  SERVICE_REMOVE_ENDPOINT,
  SERVICE_LOGS_ENDPOINT,
]) {
  assert.match(ep, ENDPOINT_RE)
}

const tmpHome = mkdtempSync(join(tmpdir(), 'ag-host-test-'))
try {
  const appsDir = join(tmpHome, '.dsh-sandbox', 'caddy', 'apps.d')
  const servicesDir = join(tmpHome, '.dsh-sandbox', 'services', 'conf.d')
  const logsDir = join(tmpHome, 'logs')
  mkdirSync(appsDir, { recursive: true })
  mkdirSync(servicesDir, { recursive: true })
  mkdirSync(logsDir, { recursive: true })

  writeFileSync(join(appsDir, 'demo.caddy'), '# App: demo -> 127.0.0.1:5173 mounted at /apps/demo/\n# Auth: public\n', 'utf8')
  writeFileSync(join(servicesDir, 'api.conf'), '[program:api]\ncommand=node server.js\n', 'utf8')
  writeFileSync(join(logsDir, 'api.log'), 'api listening on 127.0.0.1:5173\n', 'utf8')

  const service = createAppGatewayService({
    homeDir: tmpHome,
    env: { SANDBOX_PUBLIC_ORIGIN: 'http://localhost:8080', CADDY_AUTH_MODE: 'basic' },
    execCmd: (cmd, args) => {
      if (cmd === '/usr/local/bin/sandbox-service' && args[0] === 'list') {
        return 'api                              RUNNING   pid 101, uptime 0:05:00\n'
      }
      if (cmd === '/usr/local/bin/sandbox-expose') {
        if (args[0] === '--set-auth') {
          writeFileSync(join(appsDir, `${args[1]}.caddy`), `# App: ${args[1]} -> 127.0.0.1:5173 mounted at /apps/${args[1]}/\n# Auth: ${args[2]}\n`, 'utf8')
        } else if (args[0] === '--auth') {
          writeFileSync(join(appsDir, `${args[2]}.caddy`), `# App: ${args[2]} -> 127.0.0.1:${args[3]} mounted at /apps/${args[2]}/\n# Auth: ${args[1]}\n`, 'utf8')
        }
      }
      return 'OK'
    },
  })

  const snap = service.getStateSnapshot()
  assert.equal(snap.gateway_auth_mode, 'basic')
  assert.equal(snap.exposed_apps.length, 1)
  assert.equal(snap.exposed_apps[0].auth_mode, 'public')
  assert.equal(snap.user_services.length, 1)
  assert.equal(snap.user_services[0].status, 'running')

  const tog = service.setAppAuth({ name: 'demo', authMode: 'caddy' })
  assert.equal(tog.ok, true)
  assert.equal(tog.app.auth_mode, 'caddy')

  const logsRes = service.readServiceLogs({ name: 'api', tail: 50 })
  assert.equal(logsRes.ok, true)
  assert.ok(logsRes.logs.includes('api listening'))

  const restartRes = service.controlService({ name: 'api', action: 'restart' })
  assert.equal(restartRes.ok, true)

  const tools = new Map()
  wireHarnessRuntime({
    inject(deps, fn) {
      if (deps.includes('tools')) fn({ tools: { register: (t) => { tools.set(t.name, t); return () => {} } }, effect() {} })
    },
  }, service)
  await new Promise((r) => setTimeout(r, 30))
  assert.deepEqual([...tools.keys()].sort(), [...APP_GATEWAY_TOOL_NAMES].sort())

  console.log('app-gateway host-live ok')
} finally {
  rmSync(tmpHome, { recursive: true, force: true })
}
