import { createTranslator } from './locale.js'
import { WebhookNavIcon } from './icons.js'

export function createWebhookPage({ React, controller, getLocale, subscribeLocale }) {
  const h = React.createElement

  return function WebhookPage() {
    const [snap, setSnap] = React.useState(() => controller.getSnapshot())
    const [localeTick, setLocaleTick] = React.useState(0)
    const [showForm, setShowForm] = React.useState(false)
    const [slug, setSlug] = React.useState('')
    const [name, setName] = React.useState('')
    const [authMode, setAuthMode] = React.useState('hmac_sha256')
    const [sessionMode, setSessionMode] = React.useState('new')
    const [pinnedSessionId, setPinnedSessionId] = React.useState('')
    const [promptTemplate, setPromptTemplate] = React.useState('')
    const [callbackUrl, setCallbackUrl] = React.useState('')
    const [revealedIds, setRevealedIds] = React.useState(() => new Set())

    React.useEffect(() => {
      const unsub = controller.subscribe(() => setSnap(controller.getSnapshot()))
      const unsubLoc = typeof subscribeLocale === 'function'
        ? subscribeLocale(() => setLocaleTick((n) => n + 1))
        : () => {}
      void controller.syncFromHost()
      return () => { unsub(); unsubLoc() }
    }, [])

    void localeTick
    const t = createTranslator(typeof getLocale === 'function' ? getLocale() : 'en')
    const { state, loading, busy, toast } = snap

    async function copyText(text) {
      try {
        await globalThis.navigator?.clipboard?.writeText(String(text || ''))
        controller.notifyCopied()
      } catch {}
    }

    function toggleReveal(id) {
      setRevealedIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    }

    async function handleCreate(e) {
      e.preventDefault()
      if (!slug.trim()) return
      const res = await controller.saveRule({
        slug: slug.trim().toLowerCase(),
        name: name.trim() || slug.trim(),
        auth_mode: authMode,
        session_mode: sessionMode,
        pinned_session_id: pinnedSessionId.trim(),
        prompt_template: promptTemplate,
        callback_url: callbackUrl.trim(),
      })
      if (res.ok) {
        setSlug('')
        setName('')
        setPromptTemplate('')
        setCallbackUrl('')
        setShowForm(false)
      }
    }

    function buildCurlSample(rule) {
      if (rule.auth_mode === 'bearer') {
        return `curl -X POST "${rule.endpoint_url}" -H "Content-Type: application/json" -H "Authorization: Bearer ${rule.secret}" -d '{"event":"ping","source":"curl"}'`
      }
      if (rule.auth_mode === 'open') {
        return `curl -X POST "${rule.endpoint_url}" -H "Content-Type: application/json" -d '{"event":"ping"}'`
      }
      return `BODY='{"event":"ping"}'; SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "${rule.secret}" -r | awk '{print $1}'); curl -X POST "${rule.endpoint_url}" -H "Content-Type: application/json" -H "X-Webhook-Signature: sha256=$SIG" -d "$BODY"`
    }

    return h(
      'div',
      { className: 'wh-page' },
      h(
        'div',
        { className: 'wh-scroll' },
        h(
          'div',
          { className: 'wh-container' },

          h(
            'div',
            { className: 'wh-header' },
            h(
              'div',
              { className: 'wh-title-wrap' },
              h('div', { className: 'wh-title-badge' }, h(WebhookNavIcon, { React, size: 20 })),
              h(
                'div',
                null,
                h(
                  'div',
                  { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' } },
                  h('h1', { className: 'wh-title' }, t('title')),
                  h('span', { className: 'wh-badge wh-badge-brand' }, t('listenerBadge', { port: state.listener_port || 4095 })),
                ),
                h('p', { className: 'wh-subtitle' }, t('subtitle')),
              ),
            ),
            h(
              'div',
              { className: 'wh-actions' },
              h(
                'button',
                { type: 'button', className: 'wh-btn', disabled: loading, onClick: () => void controller.syncFromHost() },
                loading ? t('refreshing') : t('refresh'),
              ),
              h(
                'button',
                { type: 'button', className: 'wh-btn wh-btn-primary', onClick: () => setShowForm((v) => !v) },
                showForm ? t('cancel') : t('newRuleBtn'),
              ),
            ),
          ),

          showForm
            ? h(
                'form',
                { className: 'wh-card', onSubmit: handleCreate },
                h(
                  'div',
                  { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: '10px' } },
                  h('input', { className: 'wh-input', placeholder: t('slugPlaceholder'), value: slug, onChange: (e) => setSlug(e.target.value), required: true }),
                  h('input', { className: 'wh-input', placeholder: t('namePlaceholder'), value: name, onChange: (e) => setName(e.target.value) }),
                  h(
                    'select',
                    { className: 'wh-select', value: authMode, onChange: (e) => setAuthMode(e.target.value) },
                    h('option', { value: 'hmac_sha256' }, t('authHmac')),
                    h('option', { value: 'bearer' }, t('authBearer')),
                    h('option', { value: 'both' }, t('authBoth')),
                    h('option', { value: 'open' }, t('authOpen')),
                  ),
                  h(
                    'select',
                    { className: 'wh-select', value: sessionMode, onChange: (e) => setSessionMode(e.target.value) },
                    h('option', { value: 'new' }, t('sessionNew')),
                    h('option', { value: 'pinned' }, t('sessionPinned')),
                  ),
                ),
                sessionMode === 'pinned'
                  ? h('input', { className: 'wh-input', placeholder: t('pinnedSessionPlaceholder'), value: pinnedSessionId, onChange: (e) => setPinnedSessionId(e.target.value) })
                  : null,
                h('textarea', { className: 'wh-textarea', placeholder: t('promptPlaceholder'), value: promptTemplate, onChange: (e) => setPromptTemplate(e.target.value) }),
                h('input', { className: 'wh-input', placeholder: t('callbackPlaceholder'), value: callbackUrl, onChange: (e) => setCallbackUrl(e.target.value) }),
                h(
                  'div',
                  { className: 'wh-actions' },
                  h('button', { type: 'submit', className: 'wh-btn wh-btn-primary', disabled: busy }, t('saveRule')),
                ),
              )
            : null,

          h(
            'div',
            { className: 'wh-card' },
            h(
              'div',
              { className: 'wh-card-head' },
              h('span', { className: 'wh-card-title' }, `${t('rulesTitle')} (${state.rules.length})`),
            ),
            state.rules.length === 0
              ? h('p', { className: 'wh-muted' }, t('rulesEmpty'))
              : h(
                  'div',
                  { className: 'wh-list' },
                  state.rules.map((rule) => {
                    const isRevealed = revealedIds.has(rule.id)
                    return h(
                      'div',
                      { key: rule.id, className: 'wh-item' },
                      h(
                        'div',
                        { className: 'wh-row' },
                        h(
                          'div',
                          { className: 'wh-actions' },
                          h('strong', null, rule.name || rule.slug),
                          h('span', { className: `wh-badge ${rule.enabled ? 'wh-badge-ok' : 'wh-badge-warn'}` }, rule.enabled ? t('enabled') : t('disabled')),
                          h('span', { className: 'wh-badge' }, rule.auth_mode),
                        ),
                        h(
                          'div',
                          { className: 'wh-actions' },
                          h('button', { type: 'button', className: 'wh-btn wh-btn-sm', onClick: () => void copyText(rule.endpoint_url) }, t('copyEndpoint')),
                          h('button', { type: 'button', className: 'wh-btn wh-btn-sm', onClick: () => void copyText(buildCurlSample(rule)) }, t('copyCurl')),
                          h('button', { type: 'button', className: 'wh-btn wh-btn-sm wh-btn-primary', disabled: busy, onClick: () => void controller.testFire({ id: rule.id, slug: rule.slug }) }, t('testFire')),
                          h('button', { type: 'button', className: 'wh-btn wh-btn-sm', disabled: busy, onClick: () => void controller.saveRule({ ...rule, enabled: !rule.enabled }) }, rule.enabled ? t('disable') : t('enable')),
                          h('button', { type: 'button', className: 'wh-btn wh-btn-sm', disabled: busy, onClick: () => void controller.rotateSecret({ id: rule.id }) }, t('rotateSecret')),
                          h('button', { type: 'button', className: 'wh-btn wh-btn-sm wh-btn-danger', disabled: busy, onClick: () => void controller.deleteRule({ id: rule.id }) }, t('deleteRule')),
                        ),
                      ),
                      h('div', { className: 'wh-mono' }, rule.endpoint_url),
                      rule.auth_mode !== 'open'
                        ? h(
                            'div',
                            { className: 'wh-actions' },
                            h('span', { className: 'wh-mono' }, isRevealed ? rule.secret : `whsec_••••${String(rule.secret || '').slice(-4)}`),
                            h('button', { type: 'button', className: 'wh-btn wh-btn-sm', onClick: () => toggleReveal(rule.id) }, isRevealed ? t('hideSecret') : t('showSecret')),
                          )
                        : null,
                    )
                  }),
                ),
          ),

          h(
            'div',
            { className: 'wh-card' },
            h(
              'div',
              { className: 'wh-card-head' },
              h('span', { className: 'wh-card-title' }, `${t('deliveriesTitle')} (${state.deliveries.length})`),
            ),
            state.deliveries.length === 0
              ? h('p', { className: 'wh-muted' }, t('deliveriesEmpty'))
              : h(
                  'div',
                  { className: 'wh-list' },
                  state.deliveries.map((del) => {
                    const cls = del.status === 'completed'
                      ? 'wh-badge-ok'
                      : del.status === 'failed'
                        ? 'wh-badge-err'
                        : 'wh-badge-warn'
                    return h(
                      'div',
                      { key: del.id, className: 'wh-item' },
                      h(
                        'div',
                        { className: 'wh-row' },
                        h(
                          'div',
                          { className: 'wh-actions' },
                          h('span', { className: 'wh-mono' }, del.id),
                          h('strong', null, `/hooks/${del.rule_slug}`),
                          h('span', { className: `wh-badge ${cls}` }, del.status),
                          h('span', { className: 'wh-muted', style: { fontSize: '12px' } }, del.received_at),
                        ),
                        h(
                          'button',
                          { type: 'button', className: 'wh-btn wh-btn-sm', disabled: busy, onClick: () => void controller.replayDelivery(del.id) },
                          t('replay'),
                        ),
                      ),
                      del.session_id ? h('div', { className: 'wh-mono' }, `${t('sessionId')}: ${del.session_id}`) : null,
                      del.payload_path ? h('div', { className: 'wh-mono' }, `${t('payloadFile')}: ${del.payload_path}`) : null,
                      del.reply_preview ? h('pre', { className: 'wh-pre' }, `${t('replyPreview')}:\n${del.reply_preview}`) : null,
                      del.error ? h('pre', { className: 'wh-pre', style: { color: '#dc2626' } }, del.error) : null,
                    )
                  }),
                ),
          ),
        ),
      ),
      toast ? h('div', { className: `wh-toast ${toast.kind}` }, toast.key === 'toastError' ? t('toastError', { detail: toast.detail }) : t(toast.key)) : null,
    )
  }
}
