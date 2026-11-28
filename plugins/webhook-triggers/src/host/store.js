import { randomBytes, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import {
  HOOK_SLUG_RE,
  VALID_AUTH_MODES,
  VALID_SESSION_MODES,
  normalizeSlug,
} from '../shared/model.js'

const MAX_DELIVERIES = 100

function atomicWriteJson(filePath, data) {
  mkdirSync(join(filePath, '..'), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  renameSync(tmpPath, filePath)
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!existsSync(filePath)) return fallback
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

export function generateWebhookSecret() {
  return `whsec_${randomBytes(24).toString('hex')}`
}

export function createWebhookStore(options = {}) {
  const env = options.env || process.env
  const homeDir = options.homeDir || env.HOME || os.homedir()
  const sandboxDir = options.sandboxDir || join(homeDir, '.dsh-sandbox')
  const webhooksDir = options.webhooksDir || env.WEBHOOK_STORE_DIR || join(sandboxDir, 'webhooks')
  const rulesPath = join(webhooksDir, 'webhooks.json')
  const deliveriesPath = join(webhooksDir, 'deliveries.json')
  const payloadsDir = join(webhooksDir, 'payloads')

  mkdirSync(payloadsDir, { recursive: true })

  function readRulesDoc() {
    const doc = readJsonSafe(rulesPath, { version: 1, rules: [] })
    const rules = Array.isArray(doc?.rules) ? doc.rules.filter((r) => r && typeof r === 'object') : []
    return { version: 1, rules }
  }

  function writeRulesDoc(rules) {
    atomicWriteJson(rulesPath, {
      version: 1,
      updated_at: new Date().toISOString(),
      rules,
    })
  }

  function readDeliveriesDoc() {
    const doc = readJsonSafe(deliveriesPath, { version: 1, deliveries: [] })
    const deliveries = Array.isArray(doc?.deliveries)
      ? doc.deliveries.filter((d) => d && typeof d === 'object')
      : []
    return { version: 1, deliveries }
  }

  function writeDeliveriesDoc(deliveries) {
    atomicWriteJson(deliveriesPath, {
      version: 1,
      updated_at: new Date().toISOString(),
      deliveries: deliveries.slice(0, MAX_DELIVERIES),
    })
  }

  function readSandboxOrigin() {
    const info = readJsonSafe(join(sandboxDir, 'info.json'), {})
    const publicOrigin = String(info?.public_origin || env.SANDBOX_PUBLIC_ORIGIN || 'http://localhost:8080').replace(/\/+$/, '')
    return { publicOrigin, hooksBaseUrl: `${publicOrigin}/hooks` }
  }

  function formatRule(rule, includeSecret = true) {
    const { hooksBaseUrl } = readSandboxOrigin()
    return {
      ...rule,
      endpoint_url: `${hooksBaseUrl}/${rule.slug}`,
      secret: includeSecret ? rule.secret : `whsec_...${String(rule.secret || '').slice(-4)}`,
    }
  }

  function listRules({ includeSecret = true } = {}) {
    return readRulesDoc().rules.map((r) => formatRule(r, includeSecret))
  }

  function findRuleBySlug(slug) {
    const clean = normalizeSlug(slug)
    return readRulesDoc().rules.find((r) => r.slug === clean) || null
  }

  function findRuleById(id) {
    return readRulesDoc().rules.find((r) => r.id === id) || null
  }

  function saveRule(input = {}) {
    const slug = normalizeSlug(input.slug)
    if (!HOOK_SLUG_RE.test(slug)) {
      return { ok: false, status: 400, error: 'Webhook slug must match ^[a-z0-9][a-z0-9_-]{0,47}$' }
    }
    const authMode = VALID_AUTH_MODES.includes(String(input.auth_mode || '').toLowerCase())
      ? String(input.auth_mode).toLowerCase()
      : 'hmac_sha256'
    const sessionMode = VALID_SESSION_MODES.includes(String(input.session_mode || '').toLowerCase())
      ? String(input.session_mode).toLowerCase()
      : 'new'

    const rules = readRulesDoc().rules
    const existingIdx = rules.findIndex((r) => (input.id && r.id === input.id) || r.slug === slug)
    if (existingIdx >= 0 && input.id && rules[existingIdx].slug !== slug && rules.some((r) => r.slug === slug)) {
      return { ok: false, status: 409, error: `Slug already in use: ${slug}` }
    }

    const now = new Date().toISOString()
    const prev = existingIdx >= 0 ? rules[existingIdx] : null
    const cleanCallback = String(input.callback_url || '').trim()
    if (cleanCallback && !/^https?:\/\/\S+$/i.test(cleanCallback)) {
      return { ok: false, status: 400, error: 'callback_url must be an http:// or https:// URL' }
    }

    const record = {
      id: prev?.id || `wh_${randomUUID().slice(0, 8)}`,
      slug,
      name: String(input.name || slug).trim() || slug,
      enabled: input.enabled === undefined ? (prev?.enabled ?? true) : Boolean(input.enabled),
      auth_mode: authMode,
      secret: String(input.secret || '').trim() || prev?.secret || generateWebhookSecret(),
      prompt_template: String(input.prompt_template ?? prev?.prompt_template ?? ''),
      cwd: String(input.cwd || prev?.cwd || join(homeDir, 'default-workspace')).trim(),
      session_mode: sessionMode,
      pinned_session_id: sessionMode === 'pinned' ? String(input.pinned_session_id || prev?.pinned_session_id || '').trim() : '',
      callback_url: cleanCallback,
      created_at: prev?.created_at || now,
      updated_at: now,
    }

    if (existingIdx >= 0) rules[existingIdx] = record
    else rules.unshift(record)
    writeRulesDoc(rules)
    return { ok: true, rule: formatRule(record, true) }
  }

  function rotateSecret({ id, slug }) {
    const rules = readRulesDoc().rules
    const rule = rules.find((r) => (id && r.id === id) || (slug && r.slug === normalizeSlug(slug)))
    if (!rule) return { ok: false, status: 404, error: 'Webhook rule not found' }
    rule.secret = generateWebhookSecret()
    rule.updated_at = new Date().toISOString()
    writeRulesDoc(rules)
    return { ok: true, rule: formatRule(rule, true) }
  }

  function deleteRule({ id, slug }) {
    const rules = readRulesDoc().rules
    const cleanSlug = slug ? normalizeSlug(slug) : ''
    const next = rules.filter((r) => !((id && r.id === id) || (cleanSlug && r.slug === cleanSlug)))
    if (next.length === rules.length) {
      return { ok: false, status: 404, error: 'Webhook rule not found' }
    }
    writeRulesDoc(next)
    return { ok: true }
  }

  function listDeliveries(limit = 40) {
    return readDeliveriesDoc().deliveries.slice(0, Math.min(Math.max(Number(limit) || 40, 1), MAX_DELIVERIES))
  }

  function findDuplicateDelivery(ruleId, deliveryKey) {
    if (!deliveryKey) return null
    return readDeliveriesDoc().deliveries.find(
      (d) => d.rule_id === ruleId && d.delivery_key === deliveryKey && d.status !== 'failed',
    ) || null
  }

  function archivePayload(deliveryId, rawText, parsedPayload, headersSummary) {
    mkdirSync(payloadsDir, { recursive: true })
    const filePath = join(payloadsDir, `${deliveryId}.json`)
    const doc = {
      delivery_id: deliveryId,
      saved_at: new Date().toISOString(),
      headers: headersSummary,
      payload: parsedPayload !== undefined ? parsedPayload : null,
      raw_text: parsedPayload === undefined ? rawText : undefined,
    }
    atomicWriteJson(filePath, doc)
    return filePath
  }

  function readArchivedPayload(payloadPath) {
    if (!payloadPath || !existsSync(payloadPath)) return null
    return readJsonSafe(payloadPath, null)
  }

  function recordDelivery(entry) {
    const doc = readDeliveriesDoc()
    const idx = doc.deliveries.findIndex((d) => d.id === entry.id)
    if (idx >= 0) {
      doc.deliveries[idx] = { ...doc.deliveries[idx], ...entry }
    } else {
      doc.deliveries.unshift(entry)
    }
    // Prune payload files for evicted entries
    if (doc.deliveries.length > MAX_DELIVERIES) {
      const evicted = doc.deliveries.slice(MAX_DELIVERIES)
      for (const old of evicted) {
        if (old?.payload_path) {
          try { unlinkSync(old.payload_path) } catch {}
        }
      }
      doc.deliveries = doc.deliveries.slice(0, MAX_DELIVERIES)
    }
    writeDeliveriesDoc(doc.deliveries)
    return doc.deliveries.find((d) => d.id === entry.id) || entry
  }

  function getSnapshot(optionsSnapshot = {}) {
    const { hooksBaseUrl } = readSandboxOrigin()
    return {
      webhooks_base_url: hooksBaseUrl,
      listener_port: Number(optionsSnapshot.listenerPort || env.WEBHOOK_PORT || 4095),
      rules: listRules({ includeSecret: true }),
      deliveries: listDeliveries(50),
      updated_at: new Date().toISOString(),
    }
  }

  return {
    webhooksDir,
    listRules,
    findRuleBySlug,
    findRuleById,
    saveRule,
    rotateSecret,
    deleteRule,
    listDeliveries,
    findDuplicateDelivery,
    archivePayload,
    readArchivedPayload,
    recordDelivery,
    getSnapshot,
  }
}
