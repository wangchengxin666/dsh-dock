import {
  avatarInitials,
  fetchWorkspaceIdentity,
  formatDisplayName,
} from './identity.js'
import { createTranslator } from './locale.js'

function iconSvg(H, paths, size = 16) {
  return H(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.8,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true',
    },
    ...paths.map((attrs, idx) => H(attrs.tag || 'path', { key: idx, ...attrs.props })),
  )
}

function SettingsIcon(H) {
  return iconSvg(H, [
    {
      tag: 'circle',
      props: { cx: 12, cy: 12, r: 3 },
    },
    {
      props: {
        d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
      },
    },
  ])
}

function HomeIcon(H) {
  return iconSvg(H, [
    { props: { d: 'M3 10.5L12 3l9 7.5' } },
    { props: { d: 'M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5' } },
    { props: { d: 'M9.5 21v-6h5v6' } },
  ])
}

function ShieldIcon(H) {
  return iconSvg(H, [
    { props: { d: 'M12 3l7 3v5c0 4.6-2.9 8.6-7 10-4.1-1.4-7-5.4-7-10V6l7-3z' } },
    { props: { d: 'M9.5 12.2l1.8 1.8 3.4-3.6' } },
  ])
}

function LogoutIcon(H) {
  return iconSvg(H, [
    { props: { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' } },
    { props: { d: 'M16 17l5-5-5-5' } },
    { props: { d: 'M21 12H9' } },
  ])
}

function ChevronUpDownIcon(H) {
  return iconSvg(H, [
    { props: { d: 'M7 15l5 4 5-4' } },
    { props: { d: 'M7 9l5-4 5 4' } },
  ], 14)
}

function computeMenuCoords(triggerEl) {
  if (!triggerEl || typeof window === 'undefined') {
    return { left: 12, bottom: 64 }
  }
  const rect = triggerEl.getBoundingClientRect()
  const left = Math.max(8, Math.min(rect.left, Math.max(8, window.innerWidth - 280)))
  const bottom = Math.max(8, window.innerHeight - rect.top + 8)
  return { left, bottom }
}

function renderShortcutKeys(H, settingsShortcut) {
  if (!settingsShortcut || !Array.isArray(settingsShortcut.keys) || settingsShortcut.keys.length === 0) {
    return null
  }
  return H(
    'span',
    { className: 'wu-menu-item-shortcut', 'aria-hidden': 'true' },
    ...settingsShortcut.keys.map((token, idx) =>
      token === '+'
        ? H('span', { key: idx, className: 'wu-shortcut-sep' }, '+')
        : H('kbd', { key: idx, className: 'wu-shortcut-kbd' }, token),
    ),
  )
}

export function createWorkspaceUserLauncher({
  React,
  ReactDOM,
  getLocale,
  subscribeLocale,
  fetchImpl,
  initialIdentity = null,
  initialMenuOpen = false,
}) {
  const H = React.createElement
  return function WorkspaceUserLauncher({
    wide,
    settingsOpen,
    settingsShortcut,
    openSettings,
  }) {
    const [localeCode, setLocaleCode] = React.useState(() => getLocale?.())
    const [identity, setIdentity] = React.useState(() => initialIdentity || ({
      status: 'loading',
      viewerEmail: '',
      viewerName: '',
      isAdmin: false,
      ownerEmail: '',
      ownerName: '',
      sandboxSlug: '',
      authMode: 'unknown',
      isInspectingOther: false,
    }))
    const [menuOpen, setMenuOpen] = React.useState(Boolean(initialMenuOpen))
    const [menuCoords, setMenuCoords] = React.useState({ left: 12, bottom: 64 })

    const triggerRef = React.useRef(null)
    const menuRef = React.useRef(null)
    const prevSettingsOpenRef = React.useRef(false)
    const lastRefreshAtRef = React.useRef(0)

    const refreshIdentity = React.useCallback((force = false) => {
      const now = Date.now()
      if (!force && now - lastRefreshAtRef.current < 4000) return
      lastRefreshAtRef.current = now
      void fetchWorkspaceIdentity(fetchImpl).then((next) => {
        setIdentity(next)
      }).catch(() => undefined)
    }, [])

    React.useEffect(() => {
      refreshIdentity(true)
      if (typeof window === 'undefined') return undefined
      const onFocus = () => { refreshIdentity(false) }
      window.addEventListener('focus', onFocus)
      return () => { window.removeEventListener('focus', onFocus) }
    }, [refreshIdentity])

    React.useEffect(() => {
      if (typeof subscribeLocale !== 'function') return undefined
      return subscribeLocale((next) => {
        setLocaleCode(next || getLocale?.())
      })
    }, [])

    React.useEffect(() => {
      if (settingsOpen && !prevSettingsOpenRef.current) {
        setMenuOpen(false)
        refreshIdentity(true)
      }
      prevSettingsOpenRef.current = Boolean(settingsOpen)
    }, [settingsOpen, refreshIdentity])

    React.useLayoutEffect(() => {
      if (!menuOpen) return undefined
      const syncPosition = () => {
        setMenuCoords(computeMenuCoords(triggerRef.current))
      }
      syncPosition()
      window.addEventListener('resize', syncPosition)
      return () => { window.removeEventListener('resize', syncPosition) }
    }, [menuOpen, wide])

    React.useEffect(() => {
      if (!menuOpen || typeof document === 'undefined') return undefined
      const onPointerDown = (event) => {
        const target = event.target
        if (triggerRef.current?.contains(target)) return
        if (menuRef.current?.contains(target)) return
        setMenuOpen(false)
      }
      const onKeyDown = (event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          setMenuOpen(false)
          triggerRef.current?.focus()
        }
      }
      document.addEventListener('pointerdown', onPointerDown)
      document.addEventListener('keydown', onKeyDown)
      return () => {
        document.removeEventListener('pointerdown', onPointerDown)
        document.removeEventListener('keydown', onKeyDown)
      }
    }, [menuOpen])

    const t = createTranslator(localeCode)
    const displayName = identity.status === 'loading'
      ? t('loading')
      : formatDisplayName(identity.viewerName, identity.viewerEmail, t('unknownUser'))
    const emailText = identity.viewerEmail
    const ownerLabel = formatDisplayName(identity.ownerName, identity.ownerEmail, identity.ownerEmail)
    const initials = avatarInitials(identity.viewerName, identity.viewerEmail)

    const tooltipTitle = identity.isInspectingOther
      ? t('tooltipInspect', { viewer: displayName, email: emailText || '-', owner: ownerLabel })
      : emailText
        ? t('tooltipNormal', { viewer: displayName, email: emailText })
        : displayName

    const handleSettingsClick = () => {
      setMenuOpen(false)
      openSettings?.()
    }

    const portalTarget = typeof document !== 'undefined' ? document.body : null

    const menuNode = menuOpen && portalTarget
      ? ReactDOM.createPortal(
        H(
          'div',
          {
            ref: menuRef,
            className: 'wu-menu',
            role: 'menu',
            'aria-label': t('menuAria'),
            style: { left: `${menuCoords.left}px`, bottom: `${menuCoords.bottom}px` },
          },
          H(
            'div',
            { className: 'wu-menu-head' },
            H(
              'div',
              { className: 'wu-menu-head-top' },
              H(
                'span',
                {
                  className: 'wu-avatar',
                  'data-admin': identity.isAdmin ? 'true' : 'false',
                  'aria-hidden': 'true',
                },
                initials,
              ),
              H(
                'div',
                { className: 'wu-menu-name-wrap' },
                H(
                  'div',
                  { className: 'wu-menu-name-line' },
                  H('span', { className: 'wu-menu-name' }, displayName),
                  identity.isAdmin
                    ? H('span', { className: 'wu-badge wu-badge-admin' }, t('adminBadge'))
                    : null,
                  identity.isInspectingOther
                    ? H('span', { className: 'wu-badge wu-badge-inspect' }, t('inspectBadge'))
                    : null,
                ),
                emailText
                  ? H('div', { className: 'wu-menu-email' }, emailText)
                  : null,
              ),
            ),
            identity.isInspectingOther
              ? H(
                'div',
                { className: 'wu-menu-inspect-box' },
                t('inspectNotice', {
                  owner: identity.ownerName && identity.ownerEmail
                    ? `${identity.ownerName} (${identity.ownerEmail})`
                    : ownerLabel,
                }),
              )
              : null,
          ),
          H('div', { className: 'wu-divider', role: 'separator' }),
          H(
            'button',
            {
              type: 'button',
              role: 'menuitem',
              className: 'wu-menu-item',
              onClick: handleSettingsClick,
            },
            H('span', { className: 'wu-menu-item-icon' }, SettingsIcon(H)),
            H('span', { className: 'wu-menu-item-label' }, t('settings')),
            renderShortcutKeys(H, settingsShortcut),
          ),
          H(
            'a',
            {
              href: '/my',
              role: 'menuitem',
              className: 'wu-menu-item',
              onClick: () => { setMenuOpen(false) },
            },
            H('span', { className: 'wu-menu-item-icon' }, HomeIcon(H)),
            H('span', { className: 'wu-menu-item-label' }, t('backToMy')),
          ),
          identity.isAdmin
            ? H(
              'a',
              {
                href: '/admin',
                role: 'menuitem',
                className: 'wu-menu-item',
                onClick: () => { setMenuOpen(false) },
              },
              H('span', { className: 'wu-menu-item-icon' }, ShieldIcon(H)),
              H('span', { className: 'wu-menu-item-label' }, t('adminConsole')),
            )
            : null,
          identity.authMode !== 'none'
            ? H('div', { className: 'wu-divider', role: 'separator' })
            : null,
          identity.authMode !== 'none'
            ? H(
              'a',
              {
                href: '/auth/logout',
                role: 'menuitem',
                className: 'wu-menu-item wu-menu-item-danger',
                onClick: () => { setMenuOpen(false) },
              },
              H('span', { className: 'wu-menu-item-icon' }, LogoutIcon(H)),
              H('span', { className: 'wu-menu-item-label' }, t('signOut')),
            )
            : null,
        ),
        portalTarget,
      )
      : null

    return H(
      'div',
      {
        className: 'wu-root',
        'data-collapsed': !wide ? 'true' : 'false',
      },
      H(
        'button',
        {
          ref: triggerRef,
          type: 'button',
          className: 'wu-trigger',
          'data-collapsed': !wide ? 'true' : 'false',
          'data-admin': identity.isAdmin ? 'true' : 'false',
          'data-inspecting': identity.isInspectingOther ? 'true' : 'false',
          'aria-label': tooltipTitle,
          title: tooltipTitle,
          'aria-haspopup': 'menu',
          'aria-expanded': menuOpen,
          onClick: () => { setMenuOpen((prev) => !prev) },
        },
        H(
          'span',
          {
            className: 'wu-avatar',
            'data-admin': identity.isAdmin ? 'true' : 'false',
            'aria-hidden': 'true',
          },
          initials,
          identity.isAdmin ? H('span', { className: 'wu-avatar-dot' }) : null,
        ),
        wide
          ? H(
            'span',
            { className: 'wu-info' },
            H(
              'span',
              { className: 'wu-name-row' },
              H('span', { className: 'wu-name' }, displayName),
              identity.isAdmin
                ? H('span', { className: 'wu-badge wu-badge-admin' }, t('adminBadge'))
                : null,
              identity.isInspectingOther
                ? H('span', { className: 'wu-badge wu-badge-inspect' }, t('inspectBadge'))
                : null,
            ),
            emailText ? H('span', { className: 'wu-email' }, emailText) : null,
            identity.isInspectingOther
              ? H('span', { className: 'wu-inspect-sub' }, `${t('inspectOwnerPrefix')}${ownerLabel}`)
              : null,
          )
          : null,
        wide ? H('span', { className: 'wu-caret' }, ChevronUpDownIcon(H)) : null,
      ),
      menuNode,
    )
  }
}
