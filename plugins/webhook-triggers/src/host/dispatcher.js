import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { renderPromptTemplate } from '../shared/model.js'

const GLOBAL_DSH_NM = '/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai'

async function importDshPkg(pkgShortName, fullPkgName) {
  try {
    return await import(fullPkgName)
  } catch {
    const candidate = `${GLOBAL_DSH_NM}/${pkgShortName}/lib/index.js`
    if (existsSync(candidate)) {
      return import(pathToFileURL(candidate).href)
    }
    return null
  }
}

function inspectTurnOutcome(agent) {
  let replyPreview = ''
  let turnError = ''
  try {
    const events = typeof agent?.session?.snapshotEvents === 'function'
      ? agent.session.snapshotEvents()
      : (Array.isArray(agent?.session?.log) ? agent.session.log : [])

    for (let i = events.length - 1; i >= 0; i -= 1) {
      const ev = events[i]
      if (!ev || typeof ev !== 'object') continue
      if (!turnError && ev.type === 'turn/end' && ev.data?.reason?.kind === 'error') {
        turnError = String(
          ev.data.reason.error?.message || ev.data.reason.message || 'Agent turn ended with an error',
        ).trim().slice(0, 600)
        break
      }
      if (ev.type === 'assistant/message') {
        const parts = Array.isArray(ev.data?.message?.content) ? ev.data.message.content : []
        const text = parts
          .filter((p) => p && p.type === 'text' && typeof p.text === 'string')
          .map((p) => p.text.trim())
          .filter(Boolean)
          .join('\n')
        if (text) {
          replyPreview = text.slice(0, 600)
          break
        }
      }
      if (ev.type === 'turn/start') break
    }

    if (!replyPreview && !turnError && Array.isArray(agent?.session?.messages)) {
      const msgs = agent.session.messages
      for (let i = msgs.length - 1; i >= 0; i -= 1) {
        const m = msgs[i]
        if (!m || m.role !== 'assistant') continue
        const parts = Array.isArray(m.content) ? m.content : []
        const text = parts
          .filter((p) => p && p.type === 'text' && typeof p.text === 'string')
          .map((p) => p.text.trim())
          .filter(Boolean)
          .join('\n')
        if (text) {
          replyPreview = text.slice(0, 600)
          break
        }
      }
    }
  } catch {}
  return { replyPreview, turnError }
}

export function createWebhookDispatcher(ctx, store, { logger, fetchImpl = globalThis.fetch } = {}) {
  let agentDeps = null

  if (typeof ctx?.inject === 'function') {
    ctx.inject(['sessions', 'sessionController'], (agentCtx) => {
      agentDeps = {
        sessions: agentCtx.sessions,
        sessionController: agentCtx.sessionController,
        getService: (k) => agentCtx.get?.(k),
      }
      agentCtx.effect?.(() => () => {
        agentDeps = null
      }, 'webhook-triggers: session dispatcher')
    })
  }

  async function buildUserMessage(text) {
    const llmMod = await importDshPkg('dsh-llm', '@deepseek-ai/dsh-llm')
    if (typeof llmMod?.createUserMessage === 'function') {
      return llmMod.createUserMessage({
        content: [{ type: 'text', text }],
        source: { kind: 'user' },
      })
    }
    return {
      id: randomUUID(),
      role: 'user',
      content: [{ type: 'text', text }],
      source: { kind: 'user' },
      timestamp: Date.now(),
    }
  }

  async function postCallback(rule, payload) {
    if (!rule?.callback_url || typeof fetchImpl !== 'function') return
    try {
      await fetchImpl(rule.callback_url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      })
    } catch (err) {
      logger?.warn?.(`webhook callback POST failed (${rule.callback_url}): ${err?.message || err}`)
    }
  }

  async function dispatch({ rule, deliveryId, payload, rawText, headers, payloadPath }) {
    const previewSource = payload !== undefined
      ? JSON.stringify(payload, null, 2)
      : String(rawText || '')
    const payloadPreview = previewSource.length > 4000
      ? `${previewSource.slice(0, 4000)}\n... (truncated; read full file at ${payloadPath})`
      : previewSource

    const promptText = renderPromptTemplate(rule.prompt_template, {
      hook: rule,
      delivery: { id: deliveryId },
      payload,
      headers,
      payload_path: payloadPath,
      payload_preview: payloadPreview,
    })

    const requestedSessionId = rule.session_mode === 'pinned' && rule.pinned_session_id
      ? rule.pinned_session_id
      : `webhook-${rule.slug}-${deliveryId.replace(/^del_/, '')}`

    if (!agentDeps?.sessionController || !agentDeps?.sessions) {
      store.recordDelivery({
        id: deliveryId,
        session_id: requestedSessionId,
        status: 'failed',
        error: 'DSH sessionController is not ready yet',
        finished_at: new Date().toISOString(),
      })
      return { ok: false, error: 'DSH sessionController unavailable' }
    }

    let resolved = null
    let sessionId = requestedSessionId
    try {
      if (rule.session_mode === 'pinned' && rule.pinned_session_id) {
        try {
          resolved = await agentDeps.sessionController.resolveAgent(sessionId)
        } catch {
          resolved = null
        }
      }
      if (!resolved) {
        await agentDeps.sessionController.create({
          sessionId,
          ...(rule.cwd ? { cwd: rule.cwd } : {}),
        })
        resolved = await agentDeps.sessionController.resolveAgent(sessionId)
        try {
          const wsRegistry = agentDeps.getService('workspaceRegistry')
          if (wsRegistry && rule.cwd) {
            await (await wsRegistry.resolveByPath(rule.cwd))?.attachSession?.(sessionId)
          }
        } catch {}
      }

      const agent = resolved?.agent || resolved
      if (!agent || typeof agent.followup !== 'function') {
        throw new Error(`Failed to resolve agent for session ${sessionId}`)
      }

      try {
        const titles = agentDeps.getService('sessionTitle')
        if (titles && titles.get?.(agent.session) === undefined) {
          titles.rename?.(agent.session, `Hook: ${rule.name} (${deliveryId})`)
        }
      } catch {}

      const msg = await buildUserMessage(promptText)
      agent.followup(msg)
      await agentDeps.sessions.flush(agent.session)

      store.recordDelivery({
        id: deliveryId,
        session_id: agent.session?.id || sessionId,
        status: 'running',
      })

      void (async () => {
        try {
          if (typeof agent.whenIdle === 'function') {
            await agent.whenIdle()
          }
          const { replyPreview, turnError } = inspectTurnOutcome(agent)
          const finishedAt = new Date().toISOString()
          const failed = Boolean(turnError && !replyPreview)
          store.recordDelivery({
            id: deliveryId,
            session_id: agent.session?.id || sessionId,
            status: failed ? 'failed' : 'completed',
            reply_preview: replyPreview,
            error: turnError,
            finished_at: finishedAt,
          })
          await postCallback(rule, {
            ok: !failed,
            delivery_id: deliveryId,
            rule_slug: rule.slug,
            session_id: agent.session?.id || sessionId,
            status: failed ? 'failed' : 'completed',
            reply_preview: replyPreview,
            ...(turnError ? { error: turnError } : {}),
            finished_at: finishedAt,
          })
        } catch (err) {
          const finishedAt = new Date().toISOString()
          store.recordDelivery({
            id: deliveryId,
            session_id: sessionId,
            status: 'failed',
            error: err?.message || String(err),
            finished_at: finishedAt,
          })
          await postCallback(rule, {
            ok: false,
            delivery_id: deliveryId,
            rule_slug: rule.slug,
            session_id: sessionId,
            status: 'failed',
            error: err?.message || String(err),
            finished_at: finishedAt,
          })
        }
      })()

      return { ok: true, session_id: agent.session?.id || sessionId }
    } catch (err) {
      store.recordDelivery({
        id: deliveryId,
        session_id: sessionId,
        status: 'failed',
        error: err?.message || String(err),
        finished_at: new Date().toISOString(),
      })
      return { ok: false, error: err?.message || String(err) }
    }
  }

  return { dispatch }
}
