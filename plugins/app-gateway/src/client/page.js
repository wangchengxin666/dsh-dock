import { APP_NAME_RE } from '../shared/model.js'
import { createTranslator } from './locale.js'
import { AppGatewayNavIcon } from './icons.js'

export function createAppGatewayPage({ React, controller, getLocale, subscribeLocale }) {
  const h = React.createElement

  return function AppGatewayPage() {
    const [snap, setSnap] = React.useState(() => controller.getSnapshot())
    const [localeTick, setLocaleTick] = React.useState(0)
    const [showAppForm, setShowAppForm] = React.useState(false)
    const [appName, setAppName] = React.useState('')
    const [appPort, setAppPort] = React.useState('5173')
    const [appAuthMode, setAppAuthMode] = React.useState('public')
    const [showSvcForm, setShowSvcForm] = React.useState(false)
    const [svcName, setSvcName] = React.useState('')
    const [svcCmd, setSvcCmd] = React.useState('')
    const [activeLogSvc, setActiveLogSvc] = React.useState('')
    const [activeLogText, setActiveLogText] = React.useState('')

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

    const gatewayLabel = state.gateway_auth_mode === 'basic'
      ? t('gatewayBasic')
      : state.gateway_auth_mode === 'forward_auth'
        ? t('gatewayForward')
        : t('gatewayNone')

    async function handleExposeApp(e) {
      e.preventDefault()
      const cleanName = appName.trim().toLowerCase()
      const cleanPort = Number(appPort)
      if (!APP_NAME_RE.test(cleanName) || !Number.isInteger(cleanPort) || cleanPort < 1) return
      const res = await controller.exposeApp({ name: cleanName, port: cleanPort, authMode: appAuthMode })
      if (res.ok) {
        setAppName('')
        setShowAppForm(false)
      }
    }

    async function handleAddService(e) {
      e.preventDefault()
      if (!svcName.trim() || !svcCmd.trim()) return
      const res = await controller.addService({ name: svcName.trim(), command: svcCmd.trim() })
      if (res.ok) {
        setSvcName('')
        setSvcCmd('')
        setShowSvcForm(false)
      }
    }

    async function loadLogs(name) {
      setActiveLogSvc(name)
      setActiveLogText('...')
      const text = await controller.readServiceLogs(name)
      setActiveLogText(text)
    }

    return h(
      'div',
      { className: 'ag-page' },
      h(
        'div',
        { className: 'ag-scroll' },
        h(
          'div',
          { className: 'ag-container' },

          h(
            'div',
            { className: 'ag-header' },
            h(
              'div',
              { className: 'ag-title-wrap' },
              h('div', { className: 'ag-title-badge' }, h(AppGatewayNavIcon, { React, size: 20 })),
              h(
                'div',
                null,
                h(
                  'div',
                  { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' } },
                  h('h1', { className: 'ag-title' }, t('title')),
                  h('span', { className: 'ag-badge ag-badge-brand' }, gatewayLabel),
                ),
                h('p', { className: 'ag-subtitle' }, t('subtitle')),
              ),
            ),
            h(
              'button',
              { type: 'button', className: 'ag-btn', disabled: loading, onClick: () => void controller.syncFromHost() },
              loading ? t('refreshing') : t('refresh'),
            ),
          ),

          // Card 1: Exposed Web Apps (/apps/*)
          h(
            'div',
            { className: 'ag-card' },
            h(
              'div',
              { className: 'ag-card-head' },
              h(
                'div',
                { style: { display: 'flex', flexDirection: 'column', gap: '2px' } },
                h('span', { className: 'ag-card-title' }, `${t('appsTitle')} (${state.exposed_apps.length})`),
                h('span', { className: 'ag-muted', style: { fontSize: '12px' } }, t('appsHint')),
              ),
              h(
                'button',
                { type: 'button', className: 'ag-btn ag-btn-sm ag-btn-primary', onClick: () => setShowAppForm((v) => !v) },
                showAppForm ? t('cancel') : t('newAppBtn'),
              ),
            ),
            showAppForm
              ? h(
                  'form',
                  { className: 'ag-form', onSubmit: handleExposeApp },
                  h('input', { className: 'ag-input', placeholder: t('appNamePlaceholder'), value: appName, onChange: (e) => setAppName(e.target.value), required: true }),
                  h('input', { className: 'ag-input', type: 'number', min: 1, max: 65535, style: { width: '120px' }, placeholder: t('appPortPlaceholder'), value: appPort, onChange: (e) => setAppPort(e.target.value), required: true }),
                  h(
                    'select',
                    { className: 'ag-select', value: appAuthMode, onChange: (e) => setAppAuthMode(e.target.value) },
                    h('option', { value: 'public' }, t('authPublic')),
                    h('option', { value: 'caddy' }, t('authCaddy')),
                  ),
                  h('button', { type: 'submit', className: 'ag-btn ag-btn-primary ag-btn-sm', disabled: busy }, t('exposeBtn')),
                )
              : null,
            state.exposed_apps.length === 0
              ? h('p', { className: 'ag-muted' }, t('appsEmpty'))
              : h(
                  'div',
                  { className: 'ag-list' },
                  state.exposed_apps.map((app) => {
                    const isCaddy = app.auth_mode === 'caddy'
                    return h(
                      'div',
                      { key: app.name, className: 'ag-item' },
                      h(
                        'div',
                        { className: 'ag-item-main' },
                        h(
                          'div',
                          { className: 'ag-actions' },
                          h('strong', null, app.name),
                          h('span', { className: 'ag-mono' }, app.target),
                          h('span', { className: `ag-badge ${isCaddy ? 'ag-badge-brand' : 'ag-badge-ok'}` }, isCaddy ? t('authCaddy') : t('authPublic')),
                        ),
                        h('a', { href: app.url, target: '_blank', rel: 'noreferrer', className: 'ag-link' }, app.url),
                      ),
                      h(
                        'div',
                        { className: 'ag-actions' },
                        h('a', { href: app.url, target: '_blank', rel: 'noreferrer', className: 'ag-btn ag-btn-sm' }, t('open')),
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'ag-btn ag-btn-sm',
                            disabled: busy,
                            onClick: () => void controller.setAppAuth({ name: app.name, authMode: isCaddy ? 'public' : 'caddy' }),
                          },
                          isCaddy ? t('makePublic') : t('makeCaddy'),
                        ),
                        h(
                          'button',
                          { type: 'button', className: 'ag-btn ag-btn-sm ag-btn-danger', disabled: busy, onClick: () => void controller.unexposeApp({ name: app.name }) },
                          t('remove'),
                        ),
                      ),
                    )
                  }),
                ),
          ),

          // Card 2: Background Supervisor Services (Start/Stop/Restart + Live Logs)
          h(
            'div',
            { className: 'ag-card' },
            h(
              'div',
              { className: 'ag-card-head' },
              h('span', { className: 'ag-card-title' }, `${t('servicesTitle')} (${state.user_services.length})`),
              h(
                'button',
                { type: 'button', className: 'ag-btn ag-btn-sm ag-btn-primary', onClick: () => setShowSvcForm((v) => !v) },
                showSvcForm ? t('cancel') : t('newServiceBtn'),
              ),
            ),
            showSvcForm
              ? h(
                  'form',
                  { className: 'ag-form', onSubmit: handleAddService },
                  h('input', { className: 'ag-input', placeholder: t('svcNamePlaceholder'), value: svcName, onChange: (e) => setSvcName(e.target.value), required: true }),
                  h('input', { className: 'ag-input', style: { flex: '1 1 260px' }, placeholder: t('svcCmdPlaceholder'), value: svcCmd, onChange: (e) => setSvcCmd(e.target.value), required: true }),
                  h('button', { type: 'submit', className: 'ag-btn ag-btn-primary ag-btn-sm', disabled: busy }, t('addServiceBtn')),
                )
              : null,
            state.user_services.length === 0
              ? h('p', { className: 'ag-muted' }, t('servicesEmpty'))
              : h(
                  'div',
                  { className: 'ag-list' },
                  state.user_services.map((svc) => {
                    const logsOpen = activeLogSvc === svc.name
                    return h(
                      'div',
                      { key: svc.name, style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                      h(
                        'div',
                        { className: 'ag-item' },
                        h(
                          'div',
                          { className: 'ag-item-main' },
                          h(
                            'div',
                            { className: 'ag-actions' },
                            h('strong', null, svc.name),
                            h('span', { className: `ag-badge ${svc.status === 'running' ? 'ag-badge-ok' : 'ag-badge-warn'}` }, svc.status),
                          ),
                          svc.command ? h('div', { className: 'ag-mono' }, svc.command) : null,
                        ),
                        h(
                          'div',
                          { className: 'ag-actions' },
                          h('button', { type: 'button', className: 'ag-btn ag-btn-sm', disabled: busy, onClick: () => void controller.controlService({ name: svc.name, action: 'start' }) }, t('start')),
                          h('button', { type: 'button', className: 'ag-btn ag-btn-sm', disabled: busy, onClick: () => void controller.controlService({ name: svc.name, action: 'stop' }) }, t('stop')),
                          h('button', { type: 'button', className: 'ag-btn ag-btn-sm', disabled: busy, onClick: () => void controller.controlService({ name: svc.name, action: 'restart' }) }, t('restart')),
                          h(
                            'button',
                            {
                              type: 'button',
                              className: 'ag-btn ag-btn-sm',
                              onClick: () => (logsOpen ? setActiveLogSvc('') : void loadLogs(svc.name)),
                            },
                            logsOpen ? t('hideLogs') : t('logs'),
                          ),
                          h('button', { type: 'button', className: 'ag-btn ag-btn-sm ag-btn-danger', disabled: busy, onClick: () => void controller.removeService({ name: svc.name }) }, t('remove')),
                        ),
                      ),
                      logsOpen
                        ? h(
                            'div',
                            { className: 'ag-log-wrap' },
                            h(
                              'div',
                              { className: 'ag-card-head' },
                              h('span', { className: 'ag-mono' }, `~/logs/${svc.name}.log`),
                              h('button', { type: 'button', className: 'ag-btn ag-btn-sm', onClick: () => void loadLogs(svc.name) }, t('refreshLogs')),
                            ),
                            h('pre', { className: 'ag-log-box' }, activeLogText),
                          )
                        : null,
                    )
                  }),
                ),
          ),
        ),
      ),
      toast ? h('div', { className: `ag-toast ${toast.kind}` }, toast.key === 'toastError' ? t('toastError', { detail: toast.detail }) : t(toast.key)) : null,
    )
  }
}
