import { execFileSync } from 'node:child_process'
import {
  existsSync,
  readdirSync,
  readFileSync,
} from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import {
  APP_NAME_RE,
  SERVICE_NAME_RE,
  normalizeAppName,
  normalizeServiceName,
} from '../shared/model.js'

const VALID_AUTH_MODES = new Set(['public', 'caddy'])
const RESERVED_PORTS = new Set([2019, 3080, 4095, 8080])

function readJsonSafe(filePath) {
  try {
    if (!existsSync(filePath)) return null
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

export function createAppGatewayService(options = {}) {
  const env = options.env || process.env
  const homeDir = options.homeDir || env.HOME || os.homedir()
  const sandboxDir = options.sandboxDir || join(homeDir, '.dsh-sandbox')
  const dshHome = options.dshHome || (options.homeDir ? join(homeDir, '.dsh') : (env.DSH_HOME || join(homeDir, '.dsh')))
  const appsDir = options.appsDir || env.SANDBOX_APPS_DIR || join(sandboxDir, 'caddy', 'apps.d')
  const servicesDir = options.servicesDir || join(sandboxDir, 'services', 'conf.d')
  const logsDir = options.logsDir || join(homeDir, 'logs')
  const sandboxExposeBin = options.sandboxExposeBin || '/usr/local/bin/sandbox-expose'
  const sandboxServiceBin = options.sandboxServiceBin || '/usr/local/bin/sandbox-service'
  const logger = options.logger || null

  function runCli(binPath, args) {
    if (options.runCli) return options.runCli(binPath, args)
    if (options.execCmd) return options.execCmd(binPath, args)
    return execFileSync(binPath, args, {
      encoding: 'utf8',
      timeout: 15000,
      env: {
        ...env,
        HOME: homeDir,
        DSH_HOME: dshHome,
        SANDBOX_APPS_DIR: appsDir,
      },
    })
  }

  function readSandboxInfo() {
    const info = readJsonSafe(join(sandboxDir, 'info.json')) || {}
    return {
      public_origin: String(info.public_origin || env.SANDBOX_PUBLIC_ORIGIN || 'http://localhost:8080').replace(/\/+$/, ''),
      auth_mode: String(info.auth_mode || env.CADDY_AUTH_MODE || 'none').toLowerCase(),
    }
  }

  function listExposedApps() {
    if (!existsSync(appsDir)) return []
    const info = readSandboxInfo()
    let files = []
    try {
      files = readdirSync(appsDir).filter((f) => f.endsWith('.caddy') && f !== '00-empty.caddy').sort()
    } catch {
      return []
    }
    const out = []
    for (const file of files) {
      let content = ''
      try { content = readFileSync(join(appsDir, file), 'utf8') } catch { continue }
      const m = content.match(/^#\s*App:\s*(\S+)\s*->\s*(\S+)\s+mounted at\s+(\S+)/m)
      const name = m ? m[1] : file.replace(/\.caddy$/, '')
      const target = m ? m[2] : ''
      const portMatch = target.match(/:(\d+)$/)
      const port = portMatch ? Number(portMatch[1]) : null
      const mountPath = m ? m[3] : `/apps/${name}/`
      const authHdr = content.match(/^#\s*Auth:\s*(public|caddy)\b/m)
      const authMode = authHdr ? authHdr[1] : (content.includes('import auth_guard') ? 'caddy' : 'public')
      out.push({
        name,
        target,
        port,
        mount_path: mountPath,
        url: `${info.public_origin}${mountPath}`,
        auth_mode: authMode,
      })
    }
    return out
  }

  function parseSupervisorStatusMap() {
    const map = new Map()
    try {
      const output = runCli(sandboxServiceBin, ['list'])
      for (const rawLine of String(output || '').split('\n')) {
        const line = rawLine.trim()
        if (!line || line === 'no user services') continue
        const m = line.match(/^([^\s]+)\s+([^\s]+)(?:\s+(.*))?$/)
        if (m) {
          map.set(m[1], { status: m[2].toLowerCase(), detail: (m[3] || '').trim() })
        }
      }
    } catch {}
    return map
  }

  function listUserServices() {
    if (!existsSync(servicesDir)) return []
    let files = []
    try {
      files = readdirSync(servicesDir).filter((f) => f.endsWith('.conf')).sort()
    } catch {
      return []
    }
    const statusMap = parseSupervisorStatusMap()
    const out = []
    for (const file of files) {
      const name = file.replace(/\.conf$/, '')
      let content = ''
      try { content = readFileSync(join(servicesDir, file), 'utf8') } catch { continue }
      const cmdMatch = content.match(/^command=(.+)$/m)
      const st = statusMap.get(name)
      out.push({
        name,
        command: cmdMatch ? cmdMatch[1].trim() : '',
        status: st?.status || 'configured',
        detail: st?.detail || '',
      })
    }
    return out
  }

  function getStateSnapshot() {
    const info = readSandboxInfo()
    return {
      gateway_auth_mode: info.auth_mode,
      public_origin: info.public_origin,
      exposed_apps: listExposedApps(),
      user_services: listUserServices(),
      updated_at: new Date().toISOString(),
    }
  }

  function exposeApp({ name, port, authMode = 'public', prefix = '' }) {
    const cleanName = normalizeAppName(name)
    if (!APP_NAME_RE.test(cleanName)) {
      return { ok: false, status: 400, error: 'App name must match ^[a-z0-9][a-z0-9_-]{0,47}$' }
    }
    const portNum = Number(port)
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      return { ok: false, status: 400, error: 'Port must be an integer between 1 and 65535' }
    }
    if (RESERVED_PORTS.has(portNum)) {
      return { ok: false, status: 400, error: `Port ${portNum} is reserved` }
    }
    const cleanAuth = String(authMode || 'public').trim().toLowerCase()
    if (!VALID_AUTH_MODES.has(cleanAuth)) {
      return { ok: false, status: 400, error: 'authMode must be public or caddy' }
    }

    const args = ['--auth', cleanAuth, cleanName, String(portNum)]
    const cleanPrefix = String(prefix || '').trim()
    if (cleanPrefix) {
      if (!cleanPrefix.startsWith('/') || cleanPrefix === '/') {
        return { ok: false, status: 400, error: 'prefix must start with / and not be /' }
      }
      args.push(cleanPrefix)
    }

    try {
      const output = runCli(sandboxExposeBin, args)
      const state = getStateSnapshot()
      const app = state.exposed_apps.find((a) => a.name === cleanName) || null
      return { ok: true, output: String(output || '').trim(), app, state }
    } catch (err) {
      logger?.warn?.(`exposeApp failed: ${err?.message || err}`)
      return { ok: false, status: 500, error: err?.stderr?.toString() || err?.message || 'Failed to expose app' }
    }
  }

  function setAppAuth({ name, authMode }) {
    const cleanName = normalizeAppName(name)
    if (!APP_NAME_RE.test(cleanName)) {
      return { ok: false, status: 400, error: 'Invalid app name' }
    }
    const cleanAuth = String(authMode || '').trim().toLowerCase()
    if (!VALID_AUTH_MODES.has(cleanAuth)) {
      return { ok: false, status: 400, error: 'authMode must be public or caddy' }
    }
    try {
      const output = runCli(sandboxExposeBin, ['--set-auth', cleanName, cleanAuth])
      const state = getStateSnapshot()
      const app = state.exposed_apps.find((a) => a.name === cleanName) || null
      return { ok: true, output: String(output || '').trim(), app, state }
    } catch (err) {
      return { ok: false, status: 500, error: err?.stderr?.toString() || err?.message || 'Failed to update app auth' }
    }
  }

  function unexposeApp({ name }) {
    const cleanName = normalizeAppName(name)
    if (!APP_NAME_RE.test(cleanName)) {
      return { ok: false, status: 400, error: 'Invalid app name' }
    }
    try {
      const output = runCli(sandboxExposeBin, ['--remove', cleanName])
      return { ok: true, output: String(output || '').trim(), state: getStateSnapshot() }
    } catch (err) {
      return { ok: false, status: 500, error: err?.stderr?.toString() || err?.message || 'Failed to remove app' }
    }
  }

  function controlService({ name, action }) {
    const cleanName = normalizeServiceName(name)
    if (!SERVICE_NAME_RE.test(cleanName)) {
      return { ok: false, status: 400, error: 'Invalid service name' }
    }
    if (!['start', 'stop', 'restart'].includes(action)) {
      return { ok: false, status: 400, error: `Unsupported action: ${action}` }
    }
    try {
      const output = runCli(sandboxServiceBin, [action, cleanName])
      return { ok: true, output: String(output || '').trim(), state: getStateSnapshot() }
    } catch (err) {
      return { ok: false, status: 500, error: err?.stderr?.toString() || err?.message || `Failed to ${action} service` }
    }
  }

  function addService({ name, command }) {
    const cleanName = normalizeServiceName(name)
    const cleanCmd = String(command || '').trim()
    if (!SERVICE_NAME_RE.test(cleanName)) {
      return { ok: false, status: 400, error: 'Service name must match ^[a-z0-9_-]{1,48}$' }
    }
    if (!cleanCmd) {
      return { ok: false, status: 400, error: 'Service command is required' }
    }
    try {
      const output = runCli(sandboxServiceBin, ['add', cleanName, cleanCmd])
      return { ok: true, output: String(output || '').trim(), state: getStateSnapshot() }
    } catch (err) {
      return { ok: false, status: 500, error: err?.stderr?.toString() || err?.message || 'Failed to add service' }
    }
  }

  function removeService({ name }) {
    const cleanName = normalizeServiceName(name)
    if (!SERVICE_NAME_RE.test(cleanName)) {
      return { ok: false, status: 400, error: 'Invalid service name' }
    }
    try {
      const output = runCli(sandboxServiceBin, ['remove', cleanName])
      return { ok: true, output: String(output || '').trim(), state: getStateSnapshot() }
    } catch (err) {
      return { ok: false, status: 500, error: err?.stderr?.toString() || err?.message || 'Failed to remove service' }
    }
  }

  function readServiceLogs({ name, tail = 150 }) {
    const cleanName = normalizeServiceName(name)
    if (!SERVICE_NAME_RE.test(cleanName)) {
      return { ok: false, status: 400, error: 'Invalid service name' }
    }
    const logFile = join(logsDir, `${cleanName}.log`)
    const errFile = join(logsDir, `${cleanName}.err`)
    const maxLines = Math.min(Math.max(Number(tail) || 150, 10), 500)
    const parts = []
    for (const [label, file] of [['stdout', logFile], ['stderr', errFile]]) {
      if (!existsSync(file)) continue
      try {
        const lines = readFileSync(file, 'utf8').split('\n')
        const sliced = lines.slice(-maxLines).join('\n').trim()
        if (sliced) parts.push(`--- ${label} ---\n${sliced}`)
      } catch {}
    }
    return {
      ok: true,
      name: cleanName,
      logs: parts.length > 0 ? parts.join('\n\n') : '(no logs written yet)',
    }
  }

  return {
    getStateSnapshot,
    exposeApp,
    setAppAuth,
    unexposeApp,
    controlService,
    addService,
    removeService,
    readServiceLogs,
  }
}
