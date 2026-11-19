import { canStartNewTopic } from '../shared/protocol.js'
import { createTranslator } from './locale.js'
import {
  MeshNavIcon,
  AgentIcon,
  HumanIcon,
  ModeratorCrownIcon,
  SystemBellIcon,
  RoundtableIcon,
  FileDocIcon,
  FolderIcon,
  BroadcastIcon,
  ClipIcon,
} from './icons.js'

export { MeshNavIcon }

function formatClock(ms) {
  if (!ms || typeof ms !== 'number') return ''
  try {
    const d = new Date(ms)
    const pad = (n) => String(n).padStart(2, '0')
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return ''
  }
}

function formatCountdown(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0))
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`
}

export function legacyCopyText(text, doc = typeof document !== 'undefined' ? document : null, fallbackInput = null) {
  if (!doc || typeof doc.createElement !== 'function') return false
  const container = fallbackInput?.parentElement || doc.activeElement?.parentElement || doc.body
  if (!container || typeof container.appendChild !== 'function') return false
  const ta = doc.createElement('textarea')
  ta.value = String(text ?? '')
  ta.setAttribute?.('readonly', '')
  ta.setAttribute?.('aria-hidden', 'true')
  if (ta.style) {
    ta.style.position = 'fixed'
    ta.style.top = '-9999px'
    ta.style.left = '-9999px'
    ta.style.opacity = '0'
    ta.style.fontSize = '16px'
  }
  const prevFocus = doc.activeElement
  container.appendChild(ta)
  let copied = false
  try {
    ta.focus?.({ preventScroll: true })
    ta.select?.()
    ta.setSelectionRange?.(0, ta.value.length)
    copied = Boolean(doc.execCommand?.('copy'))
  } catch {
    copied = false
  } finally {
    ta.remove?.()
  }

  if (!copied && fallbackInput && typeof fallbackInput.select === 'function') {
    try {
      fallbackInput.focus?.({ preventScroll: true })
      fallbackInput.select()
      fallbackInput.setSelectionRange?.(0, ta.value.length)
      copied = Boolean(doc.execCommand?.('copy'))
    } catch {
      copied = false
    }
  }

  if (prevFocus && prevFocus !== fallbackInput && typeof prevFocus.focus === 'function') {
    try { prevFocus.focus({ preventScroll: true }) } catch {}
  }
  return copied
}

export async function copyTextToClipboard(
  text,
  {
    fallbackInput = null,
    nav = typeof navigator !== 'undefined' ? navigator : null,
    win = typeof window !== 'undefined' ? window : null,
    doc = typeof document !== 'undefined' ? document : null,
  } = {},
) {
  const value = String(text ?? '')
  if (!value) return { ok: false, method: 'empty' }

  const isSecure = win ? win.isSecureContext !== false : true
  if (isSecure && nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(value)
      return { ok: true, method: 'clipboard' }
    } catch {
      // Fall through to execCommand fallback
    }
  }

  if (legacyCopyText(value, doc, fallbackInput)) {
    return { ok: true, method: 'execCommand' }
  }

  if (fallbackInput && typeof fallbackInput.select === 'function') {
    try {
      fallbackInput.focus?.()
      fallbackInput.select()
      fallbackInput.setSelectionRange?.(0, value.length)
    } catch {}
  }
  return { ok: false, method: 'manual' }
}

function selectInputAll(event) {
  const target = event?.currentTarget || event?.target
  if (target && typeof target.select === 'function') {
    target.select()
  }
}

function renderPeerStatusBadge(H, t, status) {
  const s = String(status || 'online')
  if (s === 'unpaired-by-peer') {
    return H('span', { className: 'sm-badge sm-badge-err' }, t('peerStatusUnpaired'))
  }
  if (s === 'offline') {
    return H('span', { className: 'sm-badge sm-badge-warn' }, t('peerStatusOffline'))
  }
  return H('span', { className: 'sm-badge sm-badge-ok' }, t('peerStatusOnline'))
}

function PairingSection({
  React,
  controller,
  t,
  activeInvite,
  busy,
  compact = false,
  onPaired = null,
}) {
  const H = React.createElement
  const { useState, useEffect, useRef } = React
  const [pairInput, setPairInput] = useState('')
  const [copiedField, setCopiedField] = useState('')
  const [nowMs, setNowMs] = useState(() => Date.now())
  const shortInputRef = useRef ? useRef(null) : { current: null }
  const uriInputRef = useRef ? useRef(null) : { current: null }
  const copyTimerRef = useRef ? useRef(null) : { current: null }

  const hasInvite = Boolean(activeInvite && activeInvite.shortCode)
  const remainingSec = hasInvite && typeof activeInvite.expiresAt === 'number'
    ? Math.max(0, Math.ceil((activeInvite.expiresAt - nowMs) / 1000))
    : 0
  const isExpired = Boolean(hasInvite && typeof activeInvite.expiresAt === 'number' && remainingSec <= 0)

  useEffect(() => {
    if (!hasInvite) return undefined
    setNowMs(Date.now())
    if (typeof setInterval !== 'function') return undefined
    const clockTimer = setInterval(() => setNowMs(Date.now()), 1000)
    const pollTimer = setInterval(() => { void controller.syncFromHost() }, 2500)
    return () => {
      clearInterval(clockTimer)
      clearInterval(pollTimer)
    }
  }, [hasInvite, activeInvite?.codeId])

  useEffect(() => () => {
    if (copyTimerRef?.current) {
      clearTimeout(copyTimerRef.current)
      copyTimerRef.current = null
    }
  }, [])

  const handleCopy = async (key, value, inputRef) => {
    const res = await copyTextToClipboard(value, { fallbackInput: inputRef?.current || null })
    if (res.ok) {
      setCopiedField(key)
      if (copyTimerRef?.current) clearTimeout(copyTimerRef.current)
      if (typeof setTimeout === 'function') {
        copyTimerRef.current = setTimeout(() => {
          setCopiedField('')
          if (copyTimerRef) copyTimerRef.current = null
        }, 1800)
      }
    } else {
      setCopiedField('')
      controller.setError?.(t('copyManualHint'))
    }
  }

  const handlePairSubmit = async () => {
    const code = pairInput.trim()
    if (!code) return
    const res = await controller.claimPairCode(code)
    if (res) {
      setPairInput('')
      onPaired?.(res)
    }
  }

  return H(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: compact ? '10px' : '12px' } },
    // Option 1: Generate & copy invite
    H(
      'div',
      { className: 'sm-pair-step' },
      H(
        'div',
        { className: 'sm-pair-step-head' },
        H('span', null, t('inviteStepTitle')),
        H(
          'button',
          {
            type: 'button',
            className: 'sm-btn sm-btn-sm',
            disabled: busy,
            onClick: () => void controller.generatePairCode(),
          },
          hasInvite && !isExpired ? t('regenerateCodeBtn') : t('generateCodeBtn'),
        ),
      ),
      hasInvite
        ? H(
            'div',
            { className: 'sm-invite-box' },
            H(
              'div',
              { className: 'sm-invite-expiry' },
              isExpired
                ? H('span', { style: { color: '#dc2626', fontWeight: 600 } }, t('inviteExpired'))
                : `${t('inviteExpiresIn')}: ${formatCountdown(remainingSec)} · ${t('waitingPeerJoin')}`,
            ),
            !isExpired
              ? H(
                  React.Fragment || 'div',
                  null,
                  H(
                    'div',
                    { className: 'sm-invite-item', style: compact ? { flexWrap: 'wrap', gap: '6px' } : undefined },
                    H('span', { className: 'sm-invite-label', style: compact ? { minWidth: 'auto' } : undefined }, t('shortCodeLabel')),
                    H('input', {
                      ref: shortInputRef,
                      type: 'text',
                      readOnly: true,
                      className: 'sm-invite-code',
                      value: activeInvite.shortCode || '',
                      title: activeInvite.shortCode || '',
                      'aria-label': t('shortCodeLabel'),
                      onFocus: selectInputAll,
                      onClick: selectInputAll,
                    }),
                    H(
                      'button',
                      {
                        type: 'button',
                        className: 'sm-btn sm-btn-sm',
                        onClick: () => void handleCopy('short', activeInvite.shortCode, shortInputRef),
                      },
                      copiedField === 'short' ? t('copiedBtn') : t('copyBtn'),
                    ),
                  ),
                  H(
                    'div',
                    { className: 'sm-invite-item', style: compact ? { flexWrap: 'wrap', gap: '6px' } : undefined },
                    H('span', { className: 'sm-invite-label', style: compact ? { minWidth: 'auto' } : undefined }, t('fullUriLabel')),
                    H('input', {
                      ref: uriInputRef,
                      type: 'text',
                      readOnly: true,
                      className: 'sm-invite-code',
                      value: activeInvite.inviteUri || '',
                      title: activeInvite.inviteUri || '',
                      'aria-label': t('fullUriLabel'),
                      onFocus: selectInputAll,
                      onClick: selectInputAll,
                    }),
                    H(
                      'button',
                      {
                        type: 'button',
                        className: 'sm-btn sm-btn-sm',
                        onClick: () => void handleCopy('uri', activeInvite.inviteUri, uriInputRef),
                      },
                      copiedField === 'uri' ? t('copiedBtn') : t('copyBtn'),
                    ),
                  ),
                )
              : null,
          )
        : null,
    ),

    // Option 2: Paste peer code / URL
    H(
      'div',
      { className: 'sm-pair-step' },
      H('div', { className: 'sm-pair-step-head' }, H('span', null, t('joinStepTitle'))),
      H(
        'div',
        { className: 'sm-row', style: compact ? { flexWrap: 'wrap' } : undefined },
        H('input', {
          type: 'text',
          className: 'sm-input',
          value: pairInput,
          placeholder: t('pairInputPlaceholder'),
          onChange: (e) => setPairInput(e.target?.value || ''),
          onKeyDown: (e) => {
            if (e.key === 'Enter') {
              e.preventDefault?.()
              void handlePairSubmit()
            }
          },
        }),
        H(
          'button',
          {
            type: 'button',
            className: 'sm-btn sm-btn-primary',
            disabled: busy || !pairInput.trim(),
            onClick: handlePairSubmit,
          },
          busy ? t('pairingBtn') : t('pairSubmitBtn'),
        ),
      ),
    ),
  )
}

export function renderRichMessageText(H, rawText) {
  const text = String(rawText ?? '')
  if (!text) return ''
  const fakeReact = { createElement: H }
  const tokenRe = /@\[([^\]\n]+)\]\(dsh-mesh(?:-[a-z]+)?:[^)\s]+\)|(?<!\S)@([a-zA-Z0-9_-]{2,64})|(?<!\S)#([^\s#,:;!?()[\]{}]+(?:\.[^\s#,:;!?()[\]{}]+|\/[^\s#,:;!?()[\]{}]*))/g
  const parts = []
  let lastIdx = 0
  let match
  while ((match = tokenRe.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index))
    }
    if (match[1] || match[2]) {
      const label = (match[1] || match[2]).replace(/^@/, '')
      parts.push(
        H(
          'span',
          { key: `m-${match.index}`, className: 'sm-inline-mention' },
          label === 'moderator'
            ? ModeratorCrownIcon({ React: fakeReact, size: 12 })
            : AgentIcon({ React: fakeReact, size: 12 }),
          `@${label}`,
        ),
      )
    } else if (match[3]) {
      parts.push(
        H(
          'span',
          { key: `f-${match.index}`, className: 'sm-inline-file' },
          FileDocIcon({ React: fakeReact, size: 12 }),
          `#${match[3]}`,
        ),
      )
    }
    lastIdx = match.index + match[0].length
  }
  if (parts.length === 0) return text
  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx))
  }
  return parts
}

/**
 * Detect trailing `@query` or `#query` trigger token in the unified input box.
 */
export function detectComposerTrigger(text) {
  if (typeof text !== 'string') return null
  const match = text.match(/(?:^|\s)([@#])([^\s@#]*)$/)
  if (!match) return null
  return {
    trigger: match[1],
    query: match[2] || '',
    replaceStart: text.length - match[1].length - (match[2] || '').length,
  }
}

/**
 * Left Sidebar Main Page: Minimalist IM Chat + Quick Pair + LLM-Moderated Groups + Context Thread Isolation.
 */
export function createMeshChatPage({
  React,
  controller,
  getLocale,
  subscribeLocale,
}) {
  const H = React.createElement
  const { useState, useEffect, useRef } = React

  return function SandboxMeshChatPage() {
    const [, setTick] = useState(0)
    const [showNewGroup, setShowNewGroup] = useState(false)
    const [showPairDrawer, setShowPairDrawer] = useState(false)
    const [showGroupManage, setShowGroupManage] = useState(false)
    const [confirmAction, setConfirmAction] = useState(null) // { type: 'unpair'|'leave-group'|'kick', slug?, roomId? }
    const [roomFilter, setRoomFilter] = useState('')
    const [groupName, setGroupName] = useState('')
    const [checkedPeers, setCheckedPeers] = useState({})
    const [newGroupModerator, setNewGroupModerator] = useState('')
    const [invitePeerSlug, setInvitePeerSlug] = useState('')
    const [draftText, setDraftText] = useState('')
    const [attachedFiles, setAttachedFiles] = useState([])
    const [activeTrigger, setActiveTrigger] = useState(null)
    const [menuIndex, setMenuIndex] = useState(0)
    const popoverRef = useRef ? useRef(null) : { current: null }
    const messagesRef = useRef ? useRef(null) : { current: null }
    const composerRef = useRef ? useRef(null) : { current: null }
    const nearBottomRef = useRef ? useRef(true) : { current: true }
    const prevRoomIdRef = useRef ? useRef('') : { current: '' }

    useEffect(() => {
      const container = popoverRef?.current
      if (!container || typeof container.querySelector !== 'function') return
      const activeEl = container.querySelector('.sm-popover-item.active')
      if (activeEl && typeof activeEl.scrollIntoView === 'function') {
        activeEl.scrollIntoView({ block: 'nearest' })
      }
    }, [menuIndex])

    useEffect(() => {
      const offCtrl = controller.subscribe(() => setTick((n) => n + 1))
      const offLoc = typeof subscribeLocale === 'function'
        ? subscribeLocale(() => setTick((n) => n + 1))
        : () => {}
      void controller.syncFromHost()
      return () => {
        offCtrl()
        offLoc()
      }
    }, [])

    const t = createTranslator(typeof getLocale === 'function' ? getLocale() : 'en')
    const snap = controller.getSnapshot()
    const { state, selectedRoomId, workspaceFiles, busy, errorText, statusKey } = snap
    const self = state.self || {}
    const activeInvite = state.activeInvite
    const peers = state.peers || []
    const rooms = state.rooms || []
    const activeStatusesMap = state.activeStatuses && typeof state.activeStatuses === 'object'
      ? state.activeStatuses
      : {}
    const hasAnyActivity = Object.values(activeStatusesMap).some(
      (list) => Array.isArray(list) && list.length > 0,
    )

    useEffect(() => {
      if (typeof setInterval !== 'function') return undefined
      const intervalMs = hasAnyActivity ? 1200 : 4000
      const timer = setInterval(() => { void controller.syncFromHost() }, intervalMs)
      return () => clearInterval(timer)
    }, [hasAnyActivity])

    const filteredRooms = roomFilter.trim()
      ? rooms.filter((r) => {
          const q = roomFilter.trim().toLowerCase()
          return (
            String(r.name || '').toLowerCase().includes(q)
            || (r.members || []).some((m) => String(m.slug || '').toLowerCase().includes(q))
          )
        })
      : rooms

    const activeRoom = rooms.find((r) => r.id === selectedRoomId) || rooms[0] || null
    const activeRoomId = activeRoom?.id || ''
    const activeMessages = activeRoom ? (state.messages?.[activeRoom.id] || []) : []
    const activeStatusesList = activeRoomId && Array.isArray(activeStatusesMap[activeRoomId])
      ? activeStatusesMap[activeRoomId]
      : []
    const activeSlugSet = new Set(activeStatusesList.map((s) => s.slug))
    const lastMsgId = activeMessages.length > 0 ? activeMessages[activeMessages.length - 1].id : ''

    useEffect(() => {
      const el = messagesRef?.current
      if (!el || !activeRoomId) return
      const roomChanged = prevRoomIdRef.current !== activeRoomId
      if (roomChanged) {
        prevRoomIdRef.current = activeRoomId
        nearBottomRef.current = true
        setConfirmAction(null)
        setShowGroupManage(false)
      }
      if ((roomChanged || nearBottomRef.current) && typeof el.scrollHeight === 'number') {
        el.scrollTop = el.scrollHeight
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => {
            if (messagesRef?.current) {
              messagesRef.current.scrollTop = messagesRef.current.scrollHeight
            }
          })
        }
      }
    }, [activeRoomId, activeMessages.length, lastMsgId, activeStatusesList.length])

    const activeModeratorSlug = activeRoom?.type === 'group'
      ? (activeRoom.moderatorSlug || activeRoom.createdBy || self.slug)
      : ''
    const canRotateTopic = canStartNewTopic(activeRoom, activeMessages)
    const isRoomUnpaired = Boolean(activeRoom?.unpaired)
    const isGroupCreator = Boolean(activeRoom?.type === 'group' && (!activeRoom.createdBy || activeRoom.createdBy === self.slug))

    // Build `@` mention candidates
    const mentionCandidates = []
    if (activeRoom && !isRoomUnpaired) {
      if (activeRoom.type === 'group' && activeModeratorSlug) {
        mentionCandidates.push({
          token: '@moderator',
          iconKind: 'moderator',
          label: `@moderator (@${activeModeratorSlug})`,
          desc: t('moderatorMentionDesc'),
        })
      }
      for (const m of activeRoom.members || []) {
        if (!m.slug) continue
        mentionCandidates.push({
          token: `@${m.slug}`,
          iconKind: m.slug === activeModeratorSlug ? 'moderator' : 'agent',
          label: `@${m.slug}${m.role ? ` (${m.role})` : ''}`,
          desc: m.description || `${m.ownerName || m.slug}`,
        })
      }
      if ((activeRoom.members || []).length > 1) {
        mentionCandidates.push({
          token: '@all',
          iconKind: 'broadcast',
          label: '@all',
          desc: t('membersLabel'),
        })
      }
    }

    const triggerInfo = activeTrigger || detectComposerTrigger(draftText)
    let popoverItems = []
    if (triggerInfo?.trigger === '@') {
      const q = (triggerInfo.query || '').toLowerCase()
      popoverItems = mentionCandidates.filter(
        (item) => !q || item.token.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q),
      )
    } else if (triggerInfo?.trigger === '#') {
      popoverItems = (workspaceFiles || []).map((f) => {
        const isDir = f.type === 'directory' || String(f.relativePath || '').endsWith('/')
        return {
          token: `#${f.relativePath}`,
          fileRef: isDir ? '' : f.relativePath,
          isDir,
          iconKind: isDir ? 'folder' : 'file',
          dirQuery: f.relativePath,
          label: f.relativePath,
          desc: isDir ? 'dir' : `${f.size || 0} B`,
        }
      })
    }

    const renderPopoverIcon = (iconKind) => {
      if (iconKind === 'moderator') return ModeratorCrownIcon({ React, size: 13 })
      if (iconKind === 'broadcast') return BroadcastIcon({ React, size: 13 })
      if (iconKind === 'folder') return FolderIcon({ React, size: 13 })
      if (iconKind === 'file') return FileDocIcon({ React, size: 13 })
      return AgentIcon({ React, size: 13 })
    }

    const handleDraftChange = (nextText) => {
      setDraftText(nextText)
      setActiveTrigger(null)
      setMenuIndex(0)
      const detected = detectComposerTrigger(nextText)
      if (detected?.trigger === '#') {
        void controller.searchFiles(detected.query)
      }
    }

    const applyPopoverSelection = (item) => {
      if (!item) return
      const detected = detectComposerTrigger(draftText)
      if (item.isDir) {
        const prefix = detected ? draftText.slice(0, detected.replaceStart) : draftText
        setDraftText(`${prefix}${item.token}`)
        setActiveTrigger(null)
        setMenuIndex(0)
        void controller.searchFiles(item.dirQuery)
        return
      }
      if (detected) {
        const prefix = draftText.slice(0, detected.replaceStart)
        setDraftText(`${prefix}${item.token} `)
      } else {
        const sep = draftText && !draftText.endsWith(' ') ? ' ' : ''
        setDraftText(`${draftText}${sep}${item.token} `)
      }
      if (item.fileRef && !attachedFiles.includes(item.fileRef)) {
        setAttachedFiles((prev) => [...prev, item.fileRef])
      }
      setActiveTrigger(null)
      setMenuIndex(0)
      composerRef?.current?.focus?.()
    }

    const togglePeerCheck = (slug) => {
      setCheckedPeers((prev) => ({ ...prev, [slug]: !prev[slug] }))
    }

    const selectedGroupPeerSlugs = Object.keys(checkedPeers).filter((k) => checkedPeers[k])
    const moderatorCandidateSlugs = [self.slug, ...selectedGroupPeerSlugs].filter(Boolean)
    const allPeersChecked = peers.length > 0 && peers.every((p) => checkedPeers[p.slug])

    const handleCreateGroup = async () => {
      const name = groupName.trim()
      if (!name) return
      const chosenModerator = newGroupModerator && moderatorCandidateSlugs.includes(newGroupModerator)
        ? newGroupModerator
        : self.slug
      const res = await controller.createGroup({
        name,
        memberSlugs: selectedGroupPeerSlugs,
        moderatorSlug: chosenModerator,
      })
      if (res) {
        setGroupName('')
        setCheckedPeers({})
        setNewGroupModerator('')
        setShowNewGroup(false)
      }
    }

    const handleSend = async () => {
      if (!activeRoom || isRoomUnpaired) return
      if (!draftText.trim() && attachedFiles.length === 0) return
      nearBottomRef.current = true
      const res = await controller.sendMessage({
        roomId: activeRoom.id,
        text: draftText.trim(),
        files: attachedFiles,
      })
      if (res) {
        setDraftText('')
        setAttachedFiles([])
        setActiveTrigger(null)
      }
    }

    const uninvitedPeers = activeRoom && activeRoom.type === 'group' && !isRoomUnpaired
      ? peers.filter((p) => !(activeRoom.members || []).some((m) => m.slug === p.slug))
      : []

    const activePairPeer = activeRoom?.type === 'pair'
      ? peers.find((p) => p.slug === activeRoom.peerSlug) || null
      : null

    const ownedGroupsWithTarget = (targetSlug) =>
      rooms.filter(
        (r) => r.type === 'group' && !r.unpaired && r.createdBy === self.slug
          && (r.members || []).some((m) => m.slug === targetSlug),
      )

    return H(
      'div',
      { className: 'sm-chat-shell' },
      // Left Column: Room List + Quick Pair / New Group Drawers
      H(
        'aside',
        { className: 'sm-conv-sidebar' },
        H(
          'div',
          { className: 'sm-conv-top' },
          H(
            'div',
            { className: 'sm-conv-title-row' },
            H(
              'h2',
              { className: 'sm-conv-title sm-row' },
              MeshNavIcon({ React, size: 16 }),
              t('chatHeaderTitle'),
            ),
            H(
              'div',
              { className: 'sm-row', style: { gap: '5px' } },
              H(
                'button',
                {
                  type: 'button',
                  className: `sm-btn sm-btn-sm${showPairDrawer ? ' sm-btn-primary' : ''}`,
                  onClick: () => {
                    setShowPairDrawer((v) => !v)
                    setShowNewGroup(false)
                  },
                },
                showPairDrawer ? t('cancelBtn') : t('newPairBtn'),
              ),
              H(
                'button',
                {
                  type: 'button',
                  className: 'sm-btn sm-btn-sm sm-btn-primary',
                  onClick: () => {
                    setShowNewGroup((v) => !v)
                    setShowPairDrawer(false)
                  },
                },
                showNewGroup ? t('cancelBtn') : t('newGroupBtn'),
              ),
            ),
          ),
          H('input', {
            type: 'text',
            className: 'sm-input',
            value: roomFilter,
            placeholder: t('searchRoomsPlaceholder'),
            onChange: (e) => setRoomFilter(e.target?.value || ''),
          }),
          showPairDrawer
            ? H(
                'div',
                { className: 'sm-group-drawer' },
                H(PairingSection, {
                  React,
                  controller,
                  t,
                  activeInvite,
                  busy,
                  compact: true,
                  onPaired: () => setShowPairDrawer(false),
                }),
              )
            : null,
          showNewGroup
            ? H(
                'div',
                { className: 'sm-group-drawer' },
                H(
                  'div',
                  { className: 'sm-row', style: { justifyContent: 'space-between' } },
                  H('strong', { style: { fontSize: '12px' } }, t('groupSectionTitle')),
                  peers.length > 1
                    ? H(
                        'button',
                        {
                          type: 'button',
                          className: 'sm-btn-ghost',
                          onClick: () => {
                            if (allPeersChecked) {
                              setCheckedPeers({})
                            } else {
                              const all = {}
                              for (const p of peers) all[p.slug] = true
                              setCheckedPeers(all)
                            }
                          },
                        },
                        allPeersChecked ? t('clearAllBtn') : t('selectAllBtn'),
                      )
                    : null,
                ),
                H('input', {
                  type: 'text',
                  className: 'sm-input',
                  value: groupName,
                  placeholder: t('groupNamePlaceholder'),
                  onChange: (e) => setGroupName(e.target?.value || ''),
                }),
                peers.length > 0
                  ? H(
                      'div',
                      { className: 'sm-peer-checks' },
                      ...peers.map((peer) =>
                        H(
                          'label',
                          { key: peer.slug, className: 'sm-peer-chip' },
                          H('input', {
                            type: 'checkbox',
                            checked: Boolean(checkedPeers[peer.slug]),
                            onChange: () => togglePeerCheck(peer.slug),
                          }),
                          H('span', null, `${peer.ownerName} (${peer.slug})`),
                        ),
                      ),
                    )
                  : H('div', { style: { fontSize: '11.5px', opacity: 0.75 } }, t('noPeersYet')),
                moderatorCandidateSlugs.length > 0
                  ? H(
                      'div',
                      { className: 'sm-row' },
                      H(
                        'span',
                        { style: { fontSize: '11.5px', opacity: 0.8, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' } },
                        ModeratorCrownIcon({ React, size: 12 }),
                        t('moderatorSelectLabel'),
                      ),
                      H(
                        'select',
                        {
                          className: 'sm-input',
                          value: newGroupModerator || self.slug || '',
                          onChange: (e) => setNewGroupModerator(e.target?.value || ''),
                        },
                        ...moderatorCandidateSlugs.map((slug) =>
                          H('option', { key: slug, value: slug }, `@${slug}${slug === self.slug ? ' (Self)' : ''}`),
                        ),
                      ),
                    )
                  : null,
                H(
                  'button',
                  {
                    type: 'button',
                    className: 'sm-btn sm-btn-primary',
                    disabled: busy || !groupName.trim(),
                    onClick: handleCreateGroup,
                  },
                  t('createGroupBtn'),
                ),
              )
            : null,
        ),

        H(
          'div',
          { className: 'sm-conv-list' },
          filteredRooms.length === 0
            ? H(
                'div',
                { style: { padding: '16px 8px', fontSize: '12px', opacity: 0.75, lineHeight: 1.5 } },
                t('noRoomsYet'),
              )
            : filteredRooms.map((room) => {
                const isActive = activeRoom && activeRoom.id === room.id
                return H(
                  'div',
                  {
                    key: room.id,
                    className: `sm-room-item${isActive ? ' active' : ''}`,
                    onClick: () => {
                      nearBottomRef.current = true
                      void controller.selectRoom(room.id)
                    },
                  },
                  H(
                    'div',
                    { style: { display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 } },
                    H(
                      'div',
                      { className: 'sm-row' },
                      H(
                        'span',
                        { className: 'sm-badge' },
                        room.type === 'group' ? RoundtableIcon({ React, size: 11 }) : AgentIcon({ React, size: 11 }),
                        room.type === 'group' ? t('roomTypeGroup') : t('roomTypePair'),
                      ),
                      H(
                        'strong',
                        {
                          style: {
                            fontSize: '12.5px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            opacity: room.unpaired ? 0.65 : 1,
                          },
                        },
                        room.name,
                      ),
                      room.unpaired
                        ? H('span', { className: 'sm-badge sm-badge-warn' }, t('unpairedRoomBadge'))
                        : null,
                    ),
                    H(
                      'span',
                      {
                        style: {
                          fontSize: '11px',
                          opacity: 0.7,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        },
                      },
                      (room.members || []).map((m) => `@${m.slug}`).join(' · '),
                    ),
                  ),
                  room.unreadCount > 0
                    ? H('span', { className: 'sm-badge sm-badge-unread' }, String(room.unreadCount))
                    : null,
                )
              }),
        ),
      ),

      // Right Column: Streamlined Chat View or Onboarding Quick-Pair
      H(
        'section',
        { className: 'sm-chat-main' },
        errorText ? H('div', { className: 'sm-alert', role: 'alert', style: { margin: '10px 16px 0' } }, errorText) : null,
        statusKey ? H('div', { className: 'sm-toast', style: { margin: '10px 16px 0' } }, t(statusKey)) : null,
        !activeRoom
          ? H(
              'div',
              { style: { display: 'flex', flex: 1, padding: '24px', overflowY: 'auto' } },
              H(
                'div',
                { className: 'sm-onboarding-card' },
                H(
                  'div',
                  null,
                  H('h3', { className: 'sm-title sm-row', style: { fontSize: '16px' } }, MeshNavIcon({ React, size: 18 }), t('quickStartTitle')),
                  H('p', { className: 'sm-subtitle' }, t('quickStartDesc')),
                ),
                H(PairingSection, {
                  React,
                  controller,
                  t,
                  activeInvite,
                  busy,
                  compact: false,
                }),
              ),
            )
          : H(
              React.Fragment || 'div',
              null,
              // Minimalist Chat Header
              H(
                'div',
                { className: 'sm-chat-header' },
                H(
                  'div',
                  { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
                  H(
                    'div',
                    { className: 'sm-row', style: { flexWrap: 'wrap' } },
                    H(
                      'span',
                      { className: 'sm-badge' },
                      activeRoom.type === 'group' ? RoundtableIcon({ React, size: 11 }) : AgentIcon({ React, size: 11 }),
                      activeRoom.type === 'group' ? t('roomTypeGroup') : t('roomTypePair'),
                    ),
                    H('strong', { style: { fontSize: '14px' } }, activeRoom.name),
                    isRoomUnpaired
                      ? H('span', { className: 'sm-badge sm-badge-warn' }, t('unpairedRoomBadge'))
                      : activePairPeer
                        ? renderPeerStatusBadge(H, t, activePairPeer.status)
                        : null,
                    activeRoom.type === 'group' && activeModeratorSlug
                      ? H(
                          'span',
                          { className: 'sm-badge sm-badge-moderator' },
                          ModeratorCrownIcon({ React, size: 11 }),
                          `${t('moderatorBadge')}: @${activeModeratorSlug}`,
                        )
                      : null,
                  ),
                  H(
                    'div',
                    { className: 'sm-row', style: { flexWrap: 'wrap', gap: '5px' } },
                    ...(activeRoom.members || []).map((m) => {
                      const isMod = activeRoom.type === 'group' && m.slug === activeModeratorSlug
                      const isBusy = activeSlugSet.has(m.slug)
                      return H(
                        'button',
                        {
                          key: m.slug,
                          type: 'button',
                          className: `sm-member-tag${isMod ? ' moderator' : ''}${isBusy ? ' busy' : ''}`,
                          title: m.description || `@${m.slug}`,
                          disabled: isRoomUnpaired,
                          onClick: () => {
                            if (isRoomUnpaired) return
                            const mention = `@${m.slug}`
                            const sep = draftText && !draftText.endsWith(' ') ? ' ' : ''
                            setDraftText(`${draftText}${sep}${mention} `)
                            composerRef?.current?.focus?.()
                          },
                        },
                        isMod ? ModeratorCrownIcon({ React, size: 12 }) : AgentIcon({ React, size: 12 }),
                        `${m.ownerName} (@${m.slug})${m.role ? ` · ${m.role}` : ''}`,
                        isBusy ? H('span', { className: 'sm-dot-live' }) : null,
                      )
                    }),
                  ),
                ),
                H(
                  'div',
                  { className: 'sm-row', style: { flexWrap: 'wrap' } },
                  activeRoom.type === 'group' && !isRoomUnpaired
                    ? H(
                        'select',
                        {
                          className: 'sm-input',
                          title: t('moderatorSelectLabel'),
                          style: { flex: '0 0 auto', width: 'auto', padding: '4px 8px', fontSize: '12px' },
                          value: activeModeratorSlug,
                          disabled: busy,
                          onChange: (e) => {
                            const nextMod = e.target?.value
                            if (nextMod) {
                              void controller.updateGroupModeration({
                                roomId: activeRoom.id,
                                moderatorSlug: nextMod,
                              })
                            }
                          },
                        },
                        ...(activeRoom.members || []).map((m) =>
                          H('option', { key: m.slug, value: m.slug }, `${t('moderatorBadge')}: @${m.slug}`),
                        ),
                      )
                    : null,
                  activeRoom.type === 'group' && !isRoomUnpaired && uninvitedPeers.length > 0
                    ? H(
                        'div',
                        { className: 'sm-row' },
                        H(
                          'select',
                          {
                            className: 'sm-input',
                            style: { flex: '0 0 auto', width: 'auto', padding: '4px 8px', fontSize: '12px' },
                            value: invitePeerSlug,
                            onChange: (e) => setInvitePeerSlug(e.target?.value || ''),
                          },
                          H('option', { value: '' }, t('invitePeerPlaceholder')),
                          ...uninvitedPeers.map((p) =>
                            H('option', { key: p.slug, value: p.slug }, `${p.ownerName} (${p.slug})`),
                          ),
                        ),
                        H(
                          'button',
                          {
                            type: 'button',
                            className: 'sm-btn',
                            disabled: busy || !invitePeerSlug,
                            onClick: () => {
                              if (!invitePeerSlug) return
                              void controller.inviteToGroup({
                                roomId: activeRoom.id,
                                memberSlugs: [invitePeerSlug],
                              })
                              setInvitePeerSlug('')
                            },
                          },
                          t('inviteBtn'),
                        ),
                      )
                    : null,
                  activeRoom.type === 'group' && !isRoomUnpaired
                    ? H(
                        'button',
                        {
                          type: 'button',
                          className: `sm-btn${showGroupManage ? ' sm-btn-primary' : ''}`,
                          disabled: busy,
                          onClick: () => {
                            setShowGroupManage((v) => !v)
                            setConfirmAction(null)
                          },
                        },
                        t('manageGroupBtn'),
                      )
                    : null,
                  activeRoom.type === 'pair' && !isRoomUnpaired && activeRoom.peerSlug
                    ? H(
                        'button',
                        {
                          type: 'button',
                          className: 'sm-btn',
                          disabled: busy,
                          onClick: () => void controller.pingPeer(activeRoom.peerSlug),
                        },
                        t('pingBtn'),
                      )
                    : null,
                  !isRoomUnpaired
                    ? H(
                        'button',
                        {
                          type: 'button',
                          className: 'sm-btn',
                          disabled: busy || !canRotateTopic,
                          title: canRotateTopic ? '' : t('alreadyFreshTopicHint'),
                          onClick: () => {
                            if (!canRotateTopic) return
                            nearBottomRef.current = true
                            void controller.startNewTopic(activeRoom.id)
                          },
                        },
                        t('newTopicBtn'),
                      )
                    : null,
                  activeRoom.type === 'pair' && !isRoomUnpaired && activeRoom.peerSlug
                    ? H(
                        'button',
                        {
                          type: 'button',
                          className: 'sm-btn',
                          disabled: busy,
                          onClick: () => setConfirmAction({ type: 'unpair', slug: activeRoom.peerSlug }),
                        },
                        t('unpairBtn'),
                      )
                    : null,
                  isRoomUnpaired
                    ? H(
                        'button',
                        {
                          type: 'button',
                          className: 'sm-btn sm-btn-danger',
                          disabled: busy,
                          onClick: () => void controller.removeRoom(activeRoom.id),
                        },
                        t('removeRoomBtn'),
                      )
                    : null,
                  H(
                    'button',
                    {
                      type: 'button',
                      className: 'sm-btn',
                      disabled: busy,
                      onClick: () => void controller.syncFromHost(),
                    },
                    t('refreshBtn'),
                  ),
                ),
              ),

              // Inline two-step Unpair confirmation inside Chat header
              confirmAction?.type === 'unpair' && confirmAction.slug === activeRoom.peerSlug
                ? H(
                    'div',
                    { className: 'sm-confirm-bar', style: { margin: '8px 16px 0' } },
                    H(
                      'div',
                      { style: { display: 'flex', flexDirection: 'column', gap: '2px' } },
                      H('strong', null, `${t('unpairConfirmTitle')} @${confirmAction.slug}`),
                      ownedGroupsWithTarget(confirmAction.slug).length > 0
                        ? H('span', { style: { fontSize: '11.5px', opacity: 0.85 } }, t('unpairGroupWarn'))
                        : null,
                    ),
                    H(
                      'div',
                      { className: 'sm-row', style: { gap: '6px' } },
                      H(
                        'button',
                        {
                          type: 'button',
                          className: 'sm-btn sm-btn-sm sm-btn-danger',
                          disabled: busy,
                          onClick: async () => {
                            const slugToRemove = confirmAction.slug
                            setConfirmAction(null)
                            await controller.removePeer(slugToRemove)
                          },
                        },
                        t('confirmUnpairBtn'),
                      ),
                      H(
                        'button',
                        {
                          type: 'button',
                          className: 'sm-btn sm-btn-sm',
                          disabled: busy,
                          onClick: () => setConfirmAction(null),
                        },
                        t('cancelBtn'),
                      ),
                    ),
                  )
                : null,

              // Group Member Management Strip
              showGroupManage && activeRoom.type === 'group' && !isRoomUnpaired
                ? H(
                    'div',
                    { className: 'sm-manage-strip' },
                    H(
                      'div',
                      { className: 'sm-row', style: { flexWrap: 'wrap', justifyContent: 'space-between' } },
                      H(
                        'div',
                        { className: 'sm-row', style: { flexWrap: 'wrap', gap: '6px' } },
                        ...(activeRoom.members || []).map((m) =>
                          H(
                            'span',
                            { key: m.slug, className: 'sm-peer-chip', style: { cursor: 'default' } },
                            H('span', null, `@${m.slug}`),
                            m.slug === activeRoom.createdBy
                              ? H('span', { className: 'sm-badge' }, t('creatorBadge'))
                              : null,
                            isGroupCreator && m.slug !== self.slug && m.slug !== activeRoom.createdBy
                              ? (confirmAction?.type === 'kick' && confirmAction.slug === m.slug
                                ? H(
                                    'span',
                                    { className: 'sm-row', style: { gap: '4px' } },
                                    H(
                                      'button',
                                      {
                                        type: 'button',
                                        className: 'sm-btn sm-btn-sm sm-btn-danger',
                                        disabled: busy,
                                        onClick: async () => {
                                          setConfirmAction(null)
                                          await controller.removeFromGroup({ roomId: activeRoom.id, slug: m.slug })
                                        },
                                      },
                                      t('removeMemberBtn'),
                                    ),
                                    H(
                                      'button',
                                      {
                                        type: 'button',
                                        className: 'sm-btn sm-btn-sm',
                                        onClick: () => setConfirmAction(null),
                                      },
                                      t('cancelBtn'),
                                    ),
                                  )
                                : H(
                                    'button',
                                    {
                                      type: 'button',
                                      className: 'sm-btn-ghost',
                                      style: { padding: '0 4px', color: '#dc2626' },
                                      disabled: busy,
                                      onClick: () => setConfirmAction({ type: 'kick', slug: m.slug }),
                                    },
                                    '×',
                                  ))
                              : null,
                          ),
                        ),
                      ),
                      confirmAction?.type === 'leave-group'
                        ? H(
                            'div',
                            { className: 'sm-row', style: { gap: '6px' } },
                            H('span', null, t('confirmLeaveGroup')),
                            H(
                              'button',
                              {
                                type: 'button',
                                className: 'sm-btn sm-btn-sm sm-btn-danger',
                                disabled: busy,
                                onClick: async () => {
                                  setConfirmAction(null)
                                  setShowGroupManage(false)
                                  await controller.leaveGroup(activeRoom.id)
                                },
                              },
                              isGroupCreator ? t('dissolveGroupBtn') : t('leaveGroupBtn'),
                            ),
                            H(
                              'button',
                              {
                                type: 'button',
                                className: 'sm-btn sm-btn-sm',
                                onClick: () => setConfirmAction(null),
                              },
                              t('cancelBtn'),
                            ),
                          )
                        : H(
                            'button',
                            {
                              type: 'button',
                              className: 'sm-btn sm-btn-sm sm-btn-danger',
                              disabled: busy,
                              onClick: () => setConfirmAction({ type: 'leave-group', roomId: activeRoom.id }),
                            },
                            isGroupCreator ? t('dissolveGroupBtn') : t('leaveGroupBtn'),
                          ),
                    ),
                  )
                : null,

              // Minimalist Message Stream (with automatic thread boundary dividers & default scroll-to-bottom)
              H(
                'div',
                {
                  ref: messagesRef,
                  className: 'sm-messages',
                  onScroll: (e) => {
                    const el = e?.currentTarget
                    if (!el || typeof el.scrollHeight !== 'number') return
                    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 120
                  },
                },
                activeMessages.length === 0 && activeStatusesList.length === 0
                  ? H('div', { style: { opacity: 0.7, fontSize: '12.5px' } }, t('noMessagesYet'))
                  : (() => {
                      const nodes = []
                      let prevThreadId = ''
                      activeMessages.forEach((msg, idx) => {
                        const curThreadId = String(msg.threadId || '').trim()
                        const clockStr = formatClock(msg.createdAt)
                        if (msg.kind === 'system' && String(msg.text || '').startsWith('───')) {
                          if (curThreadId) prevThreadId = curThreadId
                          nodes.push(
                            H(
                              'div',
                              { key: msg.id, className: 'sm-topic-divider', title: curThreadId || undefined },
                              `─── ${t('newTopicDivider')}${clockStr ? ` · ${clockStr}` : ''} ───`,
                            ),
                          )
                          return
                        }

                        if (idx > 0 && curThreadId && curThreadId !== prevThreadId) {
                          const label = msg.kind === 'task' ? t('taskThreadDivider') : t('newTopicDivider')
                          nodes.push(
                            H(
                              'div',
                              { key: `thr-${msg.id}`, className: 'sm-topic-divider', title: curThreadId },
                              `─── ${label}${clockStr ? ` · ${clockStr}` : ''} ───`,
                            ),
                          )
                        }
                        if (curThreadId) {
                          prevThreadId = curThreadId
                        }

                        const isSelf = msg.sender?.slug === self.slug
                        const isAgent = msg.sender?.actor === 'agent'
                        const isModSender = activeRoom.type === 'group' && msg.sender?.slug === activeModeratorSlug
                        const actorIcon = isAgent
                          ? (isModSender ? ModeratorCrownIcon({ React, size: 12 }) : AgentIcon({ React, size: 12 }))
                          : msg.sender?.actor === 'system'
                            ? SystemBellIcon({ React, size: 12 })
                            : HumanIcon({ React, size: 12 })
                        const pending = msg.delivery?.pendingPeers || []

                        nodes.push(
                          H(
                            'div',
                            {
                              key: msg.id,
                              className: `sm-msg${isSelf ? ' self' : ''}${isAgent ? ' agent' : ''}`,
                            },
                            H(
                              'div',
                              { className: 'sm-msg-meta' },
                              H(
                                'span',
                                { className: 'sm-msg-author' },
                                actorIcon,
                                `${msg.sender?.ownerName || msg.sender?.slug} (@${msg.sender?.slug})`,
                                isModSender && isAgent
                                  ? H('span', { className: 'sm-badge sm-badge-moderator' }, t('moderatorBadge'))
                                  : isAgent
                                    ? H('span', { className: 'sm-badge' }, t('actorAgent'))
                                    : null,
                              ),
                              H('span', null, clockStr),
                            ),
                            H('div', { style: { whiteSpace: 'pre-wrap', lineHeight: 1.5 } }, renderRichMessageText(H, msg.text)),
                            msg.attachment
                              ? H(
                                  'div',
                                  { className: 'sm-file-card' },
                                  H(
                                    'strong',
                                    { style: { display: 'inline-flex', alignItems: 'center', gap: '5px' } },
                                    ClipIcon({ React, size: 12 }),
                                    `${msg.attachment.name} (${msg.attachment.size || 0} B)`,
                                  ),
                                  msg.attachment.savedPath
                                    ? H('code', { className: 'sm-code-inline' }, `${t('savedAtLabel')} ${msg.attachment.savedPath}`)
                                    : msg.attachment.sourcePath
                                      ? H('code', { className: 'sm-code-inline' }, `${t('sourceAtLabel')} ${msg.attachment.sourcePath}`)
                                      : null,
                                )
                              : null,
                            pending.length > 0
                              ? H(
                                  'div',
                                  { style: { fontSize: '11px', opacity: 0.72 } },
                                  `⏳ ${t('pendingOutbox')} ${pending.join(', ')}`,
                                )
                              : null,
                          ),
                        )
                      })
                      return nodes
                    })(),
                ...activeStatusesList.map((st) => {
                  const stageText = st.stage === 'coordinating'
                    ? t('stageCoordinating')
                    : st.stage === 'waiting_peer'
                      ? `${t('stageWaitingPeer')}${st.detail ? ` @${st.detail}` : ''}…`
                      : st.stage === 'answering'
                        ? t('stageAnswering')
                        : t('stagePreparing')
                  return H(
                    'div',
                    { key: `typing-${st.slug}`, className: 'sm-typing-bubble' },
                    st.isModerator
                      ? ModeratorCrownIcon({ React, size: 13 })
                      : AgentIcon({ React, size: 13 }),
                    H(
                      'span',
                      null,
                      H('strong', null, `@${st.slug}`),
                      st.isModerator ? ` (${t('moderatorBadge')})` : '',
                      ` ${stageText}`,
                    ),
                    H(
                      'span',
                      { className: 'sm-typing-dots', 'aria-hidden': 'true' },
                      H('span', { className: 'sm-typing-dot' }),
                      H('span', { className: 'sm-typing-dot' }),
                      H('span', { className: 'sm-typing-dot' }),
                    ),
                  )
                }),
              ),

              // Unified Single Composer or Disconnected Banner
              isRoomUnpaired
                ? H(
                    'div',
                    { className: 'sm-composer-wrap' },
                    H(
                      'div',
                      { className: 'sm-unpaired-banner' },
                      H('span', null, t('unpairedRoomBanner')),
                      H(
                        'div',
                        { className: 'sm-row', style: { gap: '6px' } },
                        H(
                          'button',
                          {
                            type: 'button',
                            className: 'sm-btn sm-btn-sm sm-btn-primary',
                            onClick: () => {
                              setShowPairDrawer(true)
                              setShowNewGroup(false)
                            },
                          },
                          t('repairBtn'),
                        ),
                        H(
                          'button',
                          {
                            type: 'button',
                            className: 'sm-btn sm-btn-sm sm-btn-danger',
                            disabled: busy,
                            onClick: () => void controller.removeRoom(activeRoom.id),
                          },
                          t('removeRoomBtn'),
                        ),
                      ),
                    ),
                  )
                : H(
                    'div',
                    { className: 'sm-composer-wrap' },
                    triggerInfo
                      ? H(
                          'div',
                          { ref: popoverRef, className: 'sm-popover', role: 'listbox' },
                          H(
                            'div',
                            { className: 'sm-popover-header' },
                            triggerInfo.trigger === '@' ? t('mentionMenuTitle') : t('fileMenuTitle'),
                          ),
                          popoverItems.length === 0
                            ? H(
                                'div',
                                { style: { padding: '6px 10px', fontSize: '12px', opacity: 0.7 } },
                                t('noMatchingFiles'),
                              )
                            : popoverItems.map((item, idx) =>
                                H(
                                  'button',
                                  {
                                    key: item.token,
                                    type: 'button',
                                    className: `sm-popover-item${idx === menuIndex ? ' active' : ''}`,
                                    onClick: () => applyPopoverSelection(item),
                                  },
                                  H(
                                    'strong',
                                    { style: { display: 'inline-flex', alignItems: 'center', gap: '6px' } },
                                    renderPopoverIcon(item.iconKind),
                                    item.label,
                                  ),
                                  H('span', { style: { fontSize: '11px', opacity: 0.72 } }, item.desc),
                                ),
                              ),
                        )
                      : null,

                    attachedFiles.length > 0
                      ? H(
                          'div',
                          { className: 'sm-attached-files' },
                          ...attachedFiles.map((fileRef) =>
                            H(
                              'span',
                              { key: fileRef, className: 'sm-attached-pill' },
                              FileDocIcon({ React, size: 12 }),
                              `#${fileRef}`,
                              H(
                                'button',
                                {
                                  type: 'button',
                                  className: 'sm-btn-ghost',
                                  style: { padding: '0 4px' },
                                  onClick: () => setAttachedFiles((prev) => prev.filter((f) => f !== fileRef)),
                                },
                                '×',
                              ),
                            ),
                          ),
                        )
                      : null,

                    H(
                      'div',
                      { className: 'sm-composer-box' },
                      H(
                        'button',
                        {
                          type: 'button',
                          className: `sm-trigger-btn${triggerInfo?.trigger === '@' ? ' active' : ''}`,
                          title: t('mentionTriggerTitle'),
                          onClick: () => {
                            setMenuIndex(0)
                            setActiveTrigger((prev) => (prev?.trigger === '@' ? null : { trigger: '@', query: '', replaceStart: draftText.length }))
                          },
                        },
                        '@',
                      ),
                      H(
                        'button',
                        {
                          type: 'button',
                          className: `sm-trigger-btn${triggerInfo?.trigger === '#' ? ' active' : ''}`,
                          title: t('fileTriggerTitle'),
                          onClick: () => {
                            setMenuIndex(0)
                            setActiveTrigger((prev) => {
                              if (prev?.trigger === '#') return null
                              void controller.searchFiles('')
                              return { trigger: '#', query: '', replaceStart: draftText.length }
                            })
                          },
                        },
                        '#',
                      ),
                      H('textarea', {
                        ref: composerRef,
                        rows: 1,
                        className: 'sm-composer-input',
                        value: draftText,
                        placeholder: t('composerPlaceholder'),
                        onChange: (e) => handleDraftChange(e.target?.value || ''),
                        onKeyDown: (e) => {
                          if (triggerInfo && popoverItems.length > 0) {
                            if (e.key === 'ArrowDown') {
                              e.preventDefault?.()
                              setMenuIndex((i) => (i + 1) % popoverItems.length)
                              return
                            }
                            if (e.key === 'ArrowUp') {
                              e.preventDefault?.()
                              setMenuIndex((i) => (i - 1 + popoverItems.length) % popoverItems.length)
                              return
                            }
                            if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                              e.preventDefault?.()
                              applyPopoverSelection(popoverItems[menuIndex] || popoverItems[0])
                              return
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault?.()
                              setActiveTrigger(null)
                              return
                            }
                          }
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault?.()
                            void handleSend()
                          }
                        },
                      }),
                      H(
                        'button',
                        {
                          type: 'button',
                          className: 'sm-btn sm-btn-primary',
                          disabled: busy || (!draftText.trim() && attachedFiles.length === 0),
                          onClick: handleSend,
                        },
                        t('sendBtn'),
                      ),
                    ),
                  ),
            ),
      ),
    )
  }
}

/**
 * Settings Section Page: Node Endpoint Info + 1-on-1 Pairing + Paired Peers Management.
 */
export function createMeshSettingsPage({
  React,
  controller,
  getLocale,
  subscribeLocale,
}) {
  const H = React.createElement
  const { useState, useEffect, useRef } = React

  return function SandboxMeshSettingsPage() {
    const [, setTick] = useState(0)
    const [copiedField, setCopiedField] = useState('')
    const [confirmUnpairSlug, setConfirmUnpairSlug] = useState('')
    const [pingingSlug, setPingingSlug] = useState('')
    const initialSelf = controller.getSnapshot().state?.self || {}
    const [roleInput, setRoleInput] = useState(initialSelf.role || '')
    const [descInput, setDescInput] = useState(initialSelf.description || '')
    const [profileDirty, setProfileDirty] = useState(false)
    const endpointInputRef = useRef ? useRef(null) : { current: null }
    const copyTimerRef = useRef ? useRef(null) : { current: null }

    useEffect(() => {
      const offCtrl = controller.subscribe(() => {
        const latestSelf = controller.getSnapshot().state?.self || {}
        if (!profileDirty) {
          setRoleInput(latestSelf.role || '')
          setDescInput(latestSelf.description || '')
        }
        setTick((n) => n + 1)
      })
      const offLoc = typeof subscribeLocale === 'function'
        ? subscribeLocale(() => setTick((n) => n + 1))
        : () => {}
      void controller.syncFromHost()
      return () => {
        offCtrl()
        offLoc()
      }
    }, [profileDirty])

    useEffect(() => () => {
      if (copyTimerRef?.current) {
        clearTimeout(copyTimerRef.current)
        copyTimerRef.current = null
      }
    }, [])

    const t = createTranslator(typeof getLocale === 'function' ? getLocale() : 'en')
    const snap = controller.getSnapshot()
    const { state, busy, errorText, statusKey } = snap
    const self = state.self || {}
    const activeInvite = state.activeInvite
    const peers = state.peers || []
    const rooms = state.rooms || []

    const copyText = async (key, value, inputRef) => {
      const res = await copyTextToClipboard(value, { fallbackInput: inputRef?.current || null })
      if (res.ok) {
        setCopiedField(key)
        if (copyTimerRef?.current) clearTimeout(copyTimerRef.current)
        if (typeof setTimeout === 'function') {
          copyTimerRef.current = setTimeout(() => {
            setCopiedField('')
            if (copyTimerRef) copyTimerRef.current = null
          }, 1800)
        }
      } else {
        setCopiedField('')
        controller.setError?.(t('copyManualHint'))
      }
    }

    const handleSaveProfile = async () => {
      const res = await controller.saveProfile({
        role: roleInput,
        description: descInput,
      })
      if (res) {
        setProfileDirty(false)
      }
    }

    const handlePing = async (slug) => {
      setPingingSlug(slug)
      try {
        await controller.pingPeer(slug)
      } finally {
        setPingingSlug('')
      }
    }

    const ownedGroupsWithTarget = (targetSlug) =>
      rooms.filter(
        (r) => r.type === 'group' && !r.unpaired && r.createdBy === self.slug
          && (r.members || []).some((m) => m.slug === targetSlug),
      )

    return H(
      'div',
      { className: 'sm-root' },
      H(
        'div',
        { className: 'sm-header' },
        H(
          'div',
          null,
          H('h1', { className: 'sm-title sm-row' }, MeshNavIcon({ React, size: 20 }), t('title')),
          H('p', { className: 'sm-subtitle' }, t('subtitle')),
        ),
        H(
          'button',
          {
            type: 'button',
            className: 'sm-btn',
            disabled: busy,
            onClick: () => void controller.syncFromHost(),
          },
          t('refreshBtn'),
        ),
      ),

      errorText ? H('div', { className: 'sm-alert', role: 'alert' }, errorText) : null,
      statusKey ? H('div', { className: 'sm-toast' }, t(statusKey)) : null,

      // 1. This Sandbox Agent Specialty Profile Card
      H(
        'div',
        { className: 'sm-card' },
        H(
          'div',
          { className: 'sm-card-title' },
          H('span', { className: 'sm-row' }, AgentIcon({ React, size: 15 }), t('selfTitle')),
          H(
            'button',
            {
              type: 'button',
              className: 'sm-btn sm-btn-primary',
              disabled: busy,
              onClick: handleSaveProfile,
            },
            t('saveProfileBtn'),
          ),
        ),
        H(
          'div',
          { className: 'sm-invite-item' },
          H('span', { className: 'sm-invite-label' }, t('slugLabel')),
          H('code', { className: 'sm-invite-code' }, self.slug || 'sandbox'),
        ),
        H(
          'div',
          { className: 'sm-invite-item' },
          H('span', { className: 'sm-invite-label' }, t('roleLabel')),
          H('input', {
            type: 'text',
            className: 'sm-input',
            value: roleInput,
            placeholder: t('rolePlaceholder'),
            onChange: (e) => {
              setProfileDirty(true)
              setRoleInput(e.target?.value || '')
            },
          }),
        ),
        H(
          'div',
          { className: 'sm-invite-item' },
          H('span', { className: 'sm-invite-label' }, t('descLabel')),
          H('input', {
            type: 'text',
            className: 'sm-input',
            value: descInput,
            placeholder: t('descPlaceholder'),
            onChange: (e) => {
              setProfileDirty(true)
              setDescInput(e.target?.value || '')
            },
          }),
        ),
        H('p', { className: 'sm-subtitle', style: { margin: 0 } }, t('cliHint')),
        H(
          'details',
          { className: 'sm-advanced-details' },
          H('summary', null, t('advancedInfoToggle')),
          H(
            'div',
            { className: 'sm-advanced-body' },
            H(
              'div',
              { className: 'sm-invite-item' },
              H('span', { className: 'sm-invite-label' }, t('endpointLabel')),
              H('input', {
                ref: endpointInputRef,
                type: 'text',
                readOnly: true,
                className: 'sm-invite-code',
                value: self.endpointUrl || '',
                title: self.endpointUrl || '',
                'aria-label': t('endpointLabel'),
                onFocus: selectInputAll,
                onClick: selectInputAll,
              }),
              H(
                'button',
                {
                  type: 'button',
                  className: 'sm-btn sm-btn-sm',
                  onClick: () => void copyText('endpoint', self.endpointUrl || '', endpointInputRef),
                },
                copiedField === 'endpoint' ? t('copiedBtn') : t('copyBtn'),
              ),
            ),
            H('code', { className: 'sm-code-inline' }, 'mesh_list_peers | mesh_ask_peer | mesh_discuss_group | mesh_share_file'),
          ),
        ),
      ),

      // 2. 1-on-1 Pairing Card (Shared streamlined component with live countdown & reliable copy)
      H(
        'div',
        { className: 'sm-card' },
        H(
          'div',
          { className: 'sm-card-title' },
          H('span', null, t('pairSectionTitle')),
        ),
        H('p', { className: 'sm-subtitle', style: { marginTop: 0 } }, t('pairSectionDesc')),
        H(PairingSection, {
          React,
          controller,
          t,
          activeInvite,
          busy,
          compact: false,
        }),
      ),

      // 3. Connected Remote Sandbox Agents Card
      H(
        'div',
        { className: 'sm-card' },
        H('div', { className: 'sm-card-title' }, `${t('pairedPeersTitle')} (${peers.length})`),
        peers.length === 0
          ? H('div', { style: { fontSize: '12.5px', opacity: 0.72 } }, t('noPairedPeersDesc'))
          : H(
              'div',
              { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
              ...peers.map((peer) =>
                H(
                  'div',
                  { key: peer.slug, style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
                  H(
                    'div',
                    { className: 'sm-peer-row' },
                    H(
                      'div',
                      { style: { display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0, flex: 1 } },
                      H(
                        'div',
                        { className: 'sm-row', style: { flexWrap: 'wrap' } },
                        H(
                          'strong',
                          { style: { fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '5px' } },
                          AgentIcon({ React, size: 13 }),
                          `${peer.ownerName} (@${peer.slug})`,
                        ),
                        peer.role
                          ? H('span', { className: 'sm-badge' }, peer.role)
                          : null,
                        renderPeerStatusBadge(H, t, peer.status),
                      ),
                      H(
                        'div',
                        { style: { fontSize: '12px', opacity: peer.description ? 0.88 : 0.55 } },
                        peer.description || t('noSpecialtyYet'),
                      ),
                      H(
                        'code',
                        {
                          className: 'sm-code-inline',
                          style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                        },
                        peer.endpointUrl || '',
                      ),
                    ),
                    H(
                      'div',
                      { className: 'sm-row', style: { gap: '6px' } },
                      H(
                        'button',
                        {
                          type: 'button',
                          className: 'sm-btn sm-btn-sm',
                          disabled: busy,
                          onClick: () => void handlePing(peer.slug),
                        },
                        pingingSlug === peer.slug ? t('pingingBtn') : t('pingBtn'),
                      ),
                      H(
                        'button',
                        {
                          type: 'button',
                          className: 'sm-btn sm-btn-sm',
                          disabled: busy,
                          onClick: () => setConfirmUnpairSlug((prev) => (prev === peer.slug ? '' : peer.slug)),
                        },
                        t('unpairBtn'),
                      ),
                    ),
                  ),
                  confirmUnpairSlug === peer.slug
                    ? H(
                        'div',
                        { className: 'sm-confirm-bar' },
                        H(
                          'div',
                          { style: { display: 'flex', flexDirection: 'column', gap: '2px' } },
                          H('strong', null, `${t('unpairConfirmTitle')} @${peer.slug}`),
                          ownedGroupsWithTarget(peer.slug).length > 0
                            ? H('span', { style: { fontSize: '11.5px', opacity: 0.85 } }, t('unpairGroupWarn'))
                            : null,
                        ),
                        H(
                          'div',
                          { className: 'sm-row', style: { gap: '6px' } },
                          H(
                            'button',
                            {
                              type: 'button',
                              className: 'sm-btn sm-btn-sm sm-btn-danger',
                              disabled: busy,
                              onClick: async () => {
                                setConfirmUnpairSlug('')
                                await controller.removePeer(peer.slug)
                              },
                            },
                            t('confirmUnpairBtn'),
                          ),
                          H(
                            'button',
                            {
                              type: 'button',
                              className: 'sm-btn sm-btn-sm',
                              disabled: busy,
                              onClick: () => setConfirmUnpairSlug(''),
                            },
                            t('cancelBtn'),
                          ),
                        ),
                      )
                    : null,
                ),
              ),
            ),
      ),
    )
  }
}

export const createMeshPage = createMeshSettingsPage
