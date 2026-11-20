import {
  areTaskDependenciesMet,
  canStartNewTopic,
  DEFAULT_MAX_FILE_BYTES,
  summarizeRoomTasks,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '../shared/protocol.js'
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
  CopyIcon,
  CheckIcon,
  DownloadIcon,
  EyeIcon,
  UploadIcon,
  ReplyIcon,
  ChevronIcon,
  SlidersIcon,
  TopicIcon,
  RefreshIcon,
  EditIcon,
  CloseIcon,
  TasksBoardIcon,
  ShieldCheckIcon,
} from './icons.js'
import {
  avatarToneForSlug,
  formatBytes,
  formatRelativeTime,
  localizeSystemMessage,
  renderMarkdownMessage,
  stripMarkdownForPreview,
} from './markdown.js'

export { MeshNavIcon }

function taskStatusLabel(t, status) {
  switch (status) {
    case 'in_progress': return t('taskStatusInProgress')
    case 'in_review': return t('taskStatusInReview')
    case 'blocked': return t('taskStatusBlocked')
    case 'done': return t('taskStatusDone')
    case 'cancelled': return t('taskStatusCancelled')
    default: return t('taskStatusTodo')
  }
}

function taskPriorityLabel(t, priority) {
  switch (priority) {
    case 'urgent': return t('taskPriorityUrgent')
    case 'high': return t('taskPriorityHigh')
    case 'low': return t('taskPriorityLow')
    default: return t('taskPriorityMedium')
  }
}

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

function renderPeerStatusBadge(H, t, status, latencyMs = null) {
  const s = String(status || 'online')
  if (s === 'unpaired-by-peer') {
    return H('span', { className: 'sm-badge sm-badge-err' }, t('peerStatusUnpaired'))
  }
  if (s === 'offline') {
    return H('span', { className: 'sm-badge sm-badge-warn' }, t('peerStatusOffline'))
  }
  const latPart = typeof latencyMs === 'number' && Number.isFinite(latencyMs)
    ? ` · ${Math.round(latencyMs)}${t('latencyUnit')}`
    : ''
  return H('span', { className: 'sm-badge sm-badge-ok' }, `${t('peerStatusOnline')}${latPart}`)
}

function renderRoomAvatar(H, React, room, { status = 'online', isBusy = false, small = false } = {}) {
  const seed = room.type === 'group' ? (room.id || room.name) : (room.peerSlug || room.name)
  const tone = avatarToneForSlug(seed)
  const initial = String(room.name || room.peerSlug || '?').trim().slice(0, 1).toUpperCase()
  const dotClass = isBusy
    ? 'sm-avatar-dot live'
    : room.unpaired || status === 'unpaired-by-peer'
      ? 'sm-avatar-dot err'
      : status === 'offline'
        ? 'sm-avatar-dot offline'
        : 'sm-avatar-dot'

  return H(
    'span',
    {
      className: `sm-avatar${small ? ' sm-avatar-sm' : ''}`,
      style: { background: tone.bg, color: tone.fg, borderColor: tone.border },
      'aria-hidden': 'true',
    },
    room.type === 'group' ? RoundtableIcon({ React, size: small ? 14 : 16 }) : initial,
    H('span', { className: dotClass }),
  )
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
            if (e.isComposing || e.nativeEvent?.isComposing || e.keyCode === 229) return
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

export function renderRichMessageText(H, rawText, opts = {}) {
  return renderMarkdownMessage(H, rawText, opts)
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
 * Group consecutive messages into renderable items:
 * - topic dividers (explicit system divider or threadId boundary)
 * - centered localized system pills
 * - collapsible collaboration clusters for group `phase === 'turn'` messages
 * - standard human / agent / file chat messages
 */
export function buildMessageRenderItems(messages, { isGroup = false } = {}) {
  const list = Array.isArray(messages) ? messages : []
  const items = []
  const topics = []
  let prevThreadId = ''
  let pendingTurns = []

  const flushTurns = (hasFollowingMessage) => {
    if (pendingTurns.length === 0) return
    items.push({
      kind: 'collab-group',
      id: `collab-${pendingTurns[0].id}`,
      messages: pendingTurns,
      hasFollowingMessage,
    })
    pendingTurns = []
  }

  list.forEach((msg, idx) => {
    const curThreadId = String(msg.threadId || '').trim()
    const isExplicitDivider = msg.kind === 'system' && String(msg.text || '').startsWith('───')

    if (isExplicitDivider) {
      flushTurns(true)
      if (curThreadId) prevThreadId = curThreadId
      const anchorId = `sm-topic-${msg.id}`
      items.push({
        kind: 'divider',
        id: msg.id,
        anchorId,
        dividerKind: 'new-topic',
        threadId: curThreadId,
        createdAt: msg.createdAt,
      })
      topics.push({
        id: msg.id,
        anchorId,
        threadId: curThreadId,
        createdAt: msg.createdAt,
        preview: '',
      })
      return
    }

    if (idx > 0 && curThreadId && curThreadId !== prevThreadId) {
      flushTurns(true)
      const anchorId = `sm-topic-thr-${msg.id}`
      items.push({
        kind: 'divider',
        id: `thr-${msg.id}`,
        anchorId,
        dividerKind: msg.kind === 'task' ? 'task' : 'new-topic',
        threadId: curThreadId,
        createdAt: msg.createdAt,
      })
      topics.push({
        id: `thr-${msg.id}`,
        anchorId,
        threadId: curThreadId,
        createdAt: msg.createdAt,
        preview: stripMarkdownForPreview(msg.text, 44),
      })
    } else if (topics.length === 0 && msg.kind !== 'system') {
      topics.push({
        id: `first-${msg.id}`,
        anchorId: `sm-msg-${msg.id}`,
        threadId: curThreadId,
        createdAt: msg.createdAt,
        preview: stripMarkdownForPreview(msg.text, 44),
      })
    } else if (topics.length > 0 && !topics[topics.length - 1].preview && msg.kind !== 'system') {
      topics[topics.length - 1].preview = stripMarkdownForPreview(msg.text, 44)
    }

    if (curThreadId) {
      prevThreadId = curThreadId
    }

    if (msg.kind === 'system') {
      flushTurns(true)
      items.push({ kind: 'system', id: msg.id, msg })
      return
    }

    if (msg.kind === 'approval') {
      flushTurns(true)
      items.push({ kind: 'approval', id: msg.id, msg })
      return
    }

    if (isGroup && msg.phase === 'turn' && msg.sender?.actor === 'agent') {
      pendingTurns.push(msg)
      return
    }

    flushTurns(true)
    items.push({ kind: 'message', id: msg.id, msg })
  })

  flushTurns(false)
  return { items, topics }
}

/**
 * Left Sidebar Main Page: Signature Multi-Sandbox Collaboration Hub.
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
    const [rightPanel, setRightPanel] = useState('') // '' | 'tasks' | 'files' | 'details'
    const [taskFilterAll, setTaskFilterAll] = useState(false)
    const [showNewTaskForm, setShowNewTaskForm] = useState(false)
    const [newTaskTitle, setNewTaskTitle] = useState('')
    const [newTaskDesc, setNewTaskDesc] = useState('')
    const [newTaskAssignee, setNewTaskAssignee] = useState('')
    const [newTaskPriority, setNewTaskPriority] = useState('medium')
    const [newTaskApproval, setNewTaskApproval] = useState(false)
    const [approvalComments, setApprovalComments] = useState({})
    const [confirmAction, setConfirmAction] = useState(null)
    const [roomFilter, setRoomFilter] = useState('')
    const [groupName, setGroupName] = useState('')
    const [renameInput, setRenameInput] = useState('')
    const [editingName, setEditingName] = useState(false)
    const [checkedPeers, setCheckedPeers] = useState({})
    const [newGroupModerator, setNewGroupModerator] = useState('')
    const [invitePeerSlug, setInvitePeerSlug] = useState('')
    const [draftText, setDraftText] = useState('')
    const [attachedFiles, setAttachedFiles] = useState([])
    const [replyTarget, setReplyTarget] = useState(null)
    const [activeTrigger, setActiveTrigger] = useState(null)
    const [menuIndex, setMenuIndex] = useState(0)
    const [expandedCollabs, setExpandedCollabs] = useState({})
    const [copiedKey, setCopiedKey] = useState('')
    const [dragOver, setDragOver] = useState(false)
    const [previewState, setPreviewState] = useState(null) // { roomId, msgId, name, size, loading, kind, text, url, rawMode, error }

    const popoverRef = useRef ? useRef(null) : { current: null }
    const messagesRef = useRef ? useRef(null) : { current: null }
    const composerRef = useRef ? useRef(null) : { current: null }
    const fileInputRef = useRef ? useRef(null) : { current: null }
    const nearBottomRef = useRef ? useRef(true) : { current: true }
    const prevRoomIdRef = useRef ? useRef('') : { current: '' }
    const copyFlashTimerRef = useRef ? useRef(null) : { current: null }

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
        if (copyFlashTimerRef?.current) {
          clearTimeout(copyFlashTimerRef.current)
          copyFlashTimerRef.current = null
        }
      }
    }, [])

    useEffect(() => {
      if (!previewState || typeof window === 'undefined') return undefined
      const onKey = (ev) => {
        if (ev.key === 'Escape') setPreviewState(null)
      }
      window.addEventListener?.('keydown', onKey)
      return () => window.removeEventListener?.('keydown', onKey)
    }, [Boolean(previewState)])

    const t = createTranslator(typeof getLocale === 'function' ? getLocale() : 'en')
    const snap = controller.getSnapshot()
    const { state, selectedRoomId, workspaceFiles, busy, errorText, statusKey } = snap
    const self = state.self || {}
    const activeInvite = state.activeInvite
    const peers = state.peers || []
    const rooms = state.rooms || []
    const peerBySlug = new Map(peers.map((p) => [p.slug, p]))
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
        setEditingName(false)
        setReplyTarget(null)
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
    const canRenameGroup = Boolean(
      activeRoom?.type === 'group'
      && !isRoomUnpaired
      && (isGroupCreator || activeModeratorSlug === self.slug),
    )

    const roomSharedFiles = activeMessages
      .filter((m) => m && m.attachment && (m.attachment.savedPath || m.attachment.sourcePath || m.attachment.name))
      .slice()
      .reverse()

    const allRoomTasks = activeRoom && Array.isArray(state.tasks?.[activeRoom.id])
      ? state.tasks[activeRoom.id]
      : []
    const visibleRoomTasks = taskFilterAll || !activeRoom?.activeThreadId
      ? allRoomTasks
      : allRoomTasks.filter((tk) => !tk.threadId || tk.threadId === activeRoom.activeThreadId)
    const taskSummary = summarizeRoomTasks(allRoomTasks, activeRoom?.activeThreadId || '')
    const taskById = new Map(allRoomTasks.map((tk) => [tk.id, tk]))
    const taskSortRank = (tk) => {
      if (tk.approvalRequired && tk.approvalStatus === 'pending') return 0
      if (tk.status === 'blocked') return 1
      if (tk.status === 'in_review') return 2
      if (tk.status === 'in_progress') return 3
      if (tk.status === 'todo') return 4
      if (tk.status === 'done') return 5
      return 6
    }
    const sortedVisibleTasks = visibleRoomTasks
      .slice()
      .sort((a, b) => (taskSortRank(a) - taskSortRank(b)) || ((b.updatedAt || 0) - (a.updatedAt || 0)))

    const { items: renderItems, topics: roomTopics } = buildMessageRenderItems(activeMessages, {
      isGroup: activeRoom?.type === 'group',
    })

    const flashCopy = async (text, key) => {
      const res = await copyTextToClipboard(text)
      if (res.ok) {
        setCopiedKey(key)
        if (copyFlashTimerRef?.current) clearTimeout(copyFlashTimerRef.current)
        if (typeof setTimeout === 'function') {
          copyFlashTimerRef.current = setTimeout(() => {
            setCopiedKey('')
            if (copyFlashTimerRef) copyFlashTimerRef.current = null
          }, 1600)
        }
      } else {
        controller.setError?.(t('copyManualHint'))
      }
    }

    const openFilePreview = async (msg) => {
      if (!activeRoom || !msg?.attachment) return
      const base = {
        roomId: activeRoom.id,
        msgId: msg.id,
        name: msg.attachment.name || 'file',
        size: msg.attachment.size || 0,
        downloadUrl: controller.getAttachmentUrl(activeRoom.id, msg.id, { inline: false }),
        loading: true,
        kind: '',
        text: '',
        url: '',
        rawMode: false,
        error: '',
      }
      setPreviewState(base)
      const res = await controller.fetchAttachmentPreview({ roomId: activeRoom.id, msgId: msg.id })
      setPreviewState((cur) => {
        if (!cur || cur.msgId !== msg.id) return cur
        if (!res.ok) {
          return { ...cur, loading: false, error: res.error || 'Preview unavailable' }
        }
        return {
          ...cur,
          loading: false,
          kind: res.kind || 'text',
          text: res.text || '',
          url: res.url || '',
        }
      })
    }

    const uploadBrowserFile = (file) => {
      if (!file || !activeRoom || isRoomUnpaired) return
      if (file.size > DEFAULT_MAX_FILE_BYTES) {
        controller.setError?.(t('fileTooLargeError'))
        return
      }
      if (typeof FileReader !== 'function') return
      const reader = new FileReader()
      reader.onload = () => {
        const result = String(reader.result || '')
        const base64 = result.includes(',') ? result.split(',').slice(1).join(',') : result
        void controller.uploadFile({
          roomId: activeRoom.id,
          fileName: file.name || 'upload.bin',
          contentBase64: base64,
          text: draftText.trim(),
        }).then((res) => {
          if (res && draftText.trim()) setDraftText('')
        })
      }
      reader.readAsDataURL(file)
    }

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
          desc: isDir ? 'dir' : formatBytes(f.size || 0),
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

    const resizeComposer = () => {
      const el = composerRef?.current
      if (!el || !el.style) return
      el.style.height = 'auto'
      el.style.height = `${Math.min(140, Math.max(30, el.scrollHeight || 30))}px`
    }

    const handleDraftChange = (nextText) => {
      setDraftText(nextText)
      setActiveTrigger(null)
      setMenuIndex(0)
      const detected = detectComposerTrigger(nextText)
      if (detected?.trigger === '#') {
        void controller.searchFiles(detected.query)
      }
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(resizeComposer)
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
      const rawDraft = draftText.trim()
      if (!rawDraft && attachedFiles.length === 0) return
      const finalText = replyTarget
        ? `> @${replyTarget.slug}: ${replyTarget.preview}\n\n${rawDraft}`
        : rawDraft
      nearBottomRef.current = true
      const res = await controller.sendMessage({
        roomId: activeRoom.id,
        text: finalText,
        files: attachedFiles,
      })
      if (res) {
        setDraftText('')
        setAttachedFiles([])
        setReplyTarget(null)
        setActiveTrigger(null)
        if (composerRef?.current?.style) composerRef.current.style.height = 'auto'
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

    const scrollToAnchor = (anchorId) => {
      const container = messagesRef?.current
      if (!container || typeof container.querySelector !== 'function') return
      const target = container.querySelector(`[data-anchor-id="${anchorId}"]`)
      if (target && typeof target.scrollIntoView === 'function') {
        nearBottomRef.current = false
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }

    const renderFileCard = (msg, compactCard = false) => {
      const att = msg?.attachment
      if (!att) return null
      const downloadUrl = controller.getAttachmentUrl(activeRoom.id, msg.id, { inline: false })
      const pathToCopy = att.savedPath || att.sourcePath || ''
      const copyId = `path-${msg.id}`
      return H(
        'div',
        { className: 'sm-file-card' },
        H(
          'div',
          { className: 'sm-file-card-info' },
          H('span', { className: 'sm-file-icon-box' }, FileDocIcon({ React, size: 15 })),
          H(
            'div',
            { className: 'sm-file-meta' },
            H('span', { className: 'sm-file-name', title: att.name }, att.name),
            H(
              'span',
              { className: 'sm-file-sub', title: pathToCopy || undefined },
              `${formatBytes(att.size || 0)}${att.sha256 ? ` · ${String(att.sha256).slice(0, 8)}` : ''}`,
            ),
          ),
        ),
        H(
          'div',
          { className: 'sm-file-actions' },
          H(
            'button',
            {
              type: 'button',
              className: 'sm-btn sm-btn-sm',
              onClick: () => void openFilePreview(msg),
            },
            EyeIcon({ React, size: 12 }),
            t('previewBtn'),
          ),
          H(
            'a',
            {
              className: 'sm-btn sm-btn-sm',
              href: downloadUrl,
              download: att.name || 'file',
              style: { textDecoration: 'none' },
            },
            DownloadIcon({ React, size: 12 }),
            t('downloadBtn'),
          ),
          !compactCard && pathToCopy
            ? H(
                'button',
                {
                  type: 'button',
                  className: 'sm-btn-ghost',
                  title: pathToCopy,
                  onClick: () => void flashCopy(pathToCopy, copyId),
                },
                copiedKey === copyId ? CheckIcon({ React, size: 12 }) : CopyIcon({ React, size: 12 }),
                copiedKey === copyId ? t('copiedCodeBtn') : t('copyPathBtn'),
              )
            : null,
        ),
      )
    }

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
                const roomMsgs = state.messages?.[room.id] || []
                const lastMsg = roomMsgs.length > 0 ? roomMsgs[roomMsgs.length - 1] : null
                const roomTasksSummary = summarizeRoomTasks(state.tasks?.[room.id] || [])
                const roomActivities = Array.isArray(activeStatusesMap[room.id]) ? activeStatusesMap[room.id] : []
                const isRoomBusy = roomActivities.length > 0
                const pairPeer = room.type === 'pair' ? peerBySlug.get(room.peerSlug) : null
                const previewText = isRoomBusy
                  ? `@${roomActivities[0].slug} ${roomActivities[0].stage === 'coordinating' ? t('stageCoordinating') : t('stageAnswering')}`
                  : lastMsg
                    ? lastMsg.kind === 'system'
                      ? localizeSystemMessage(lastMsg.text, t)
                      : lastMsg.attachment
                        ? `[${lastMsg.attachment.name}] ${stripMarkdownForPreview(lastMsg.text, 40)}`
                        : `${lastMsg.sender?.slug ? `@${lastMsg.sender.slug}: ` : ''}${stripMarkdownForPreview(lastMsg.text, 46)}`
                    : (room.members || []).map((m) => `@${m.slug}`).join(' · ')
                const relTime = formatRelativeTime(lastMsg?.createdAt || room.updatedAt, t)

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
                  renderRoomAvatar(H, React, room, {
                    status: pairPeer?.status || 'online',
                    isBusy: isRoomBusy,
                  }),
                  H(
                    'div',
                    { className: 'sm-room-body' },
                    H(
                      'div',
                      { className: 'sm-room-top-line' },
                      H(
                        'div',
                        { className: 'sm-row', style: { gap: '5px', minWidth: 0, overflow: 'hidden' } },
                        H('span', { className: 'sm-room-name', style: room.unpaired ? { opacity: 0.6 } : undefined }, room.name),
                        room.unpaired
                          ? H('span', { className: 'sm-badge sm-badge-warn' }, t('unpairedRoomBadge'))
                          : null,
                      ),
                      relTime ? H('span', { className: 'sm-room-time' }, relTime) : null,
                    ),
                    H(
                      'div',
                      { className: 'sm-room-preview-line' },
                      H('span', { className: `sm-room-preview${isRoomBusy ? ' live' : ''}` }, previewText),
                      roomTasksSummary.pendingApprovals > 0
                        ? H('span', { className: 'sm-badge sm-badge-approval' }, `${roomTasksSummary.pendingApprovals} ${t('taskApprovalBadgeShort')}`)
                        : null,
                      room.unreadCount > 0
                        ? H('span', { className: 'sm-badge sm-badge-unread' }, String(room.unreadCount))
                        : null,
                    ),
                  ),
                )
              }),
        ),
      ),

      // Right Stage: Main Chat + Optional Right Inspector/Files Drawer
      H(
        'div',
        { className: 'sm-chat-stage' },
        H(
          'section',
          {
            className: 'sm-chat-main',
            onDragOver: (e) => {
              if (!activeRoom || isRoomUnpaired) return
              e.preventDefault?.()
              if (!dragOver) setDragOver(true)
            },
            onDragLeave: (e) => {
              if (e.currentTarget === e.target) setDragOver(false)
            },
            onDrop: (e) => {
              e.preventDefault?.()
              setDragOver(false)
              if (!activeRoom || isRoomUnpaired) return
              const file = e.dataTransfer?.files?.[0]
              if (file) uploadBrowserFile(file)
            },
          },
          dragOver
            ? H(
                'div',
                { className: 'sm-drop-overlay' },
                UploadIcon({ React, size: 24 }),
                H('span', null, t('dropFilesHint')),
              )
            : null,
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
                // Streamlined Chat Header
                H(
                  'div',
                  { className: 'sm-chat-header' },
                  H(
                    'div',
                    { className: 'sm-header-left' },
                    renderRoomAvatar(H, React, activeRoom, {
                      status: activePairPeer?.status || 'online',
                      isBusy: activeStatusesList.length > 0,
                      small: true,
                    }),
                    H(
                      'div',
                      { className: 'sm-header-meta' },
                      H(
                        'div',
                        { className: 'sm-row', style: { flexWrap: 'wrap', gap: '6px' } },
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
                            ? renderPeerStatusBadge(H, t, activePairPeer.status, activePairPeer.lastLatencyMs)
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
                            isMod ? ModeratorCrownIcon({ React, size: 11 }) : AgentIcon({ React, size: 11 }),
                            `${m.ownerName} (@${m.slug})${m.role ? ` · ${m.role}` : ''}`,
                            isBusy ? H('span', { className: 'sm-dot-live' }) : null,
                          )
                        }),
                      ),
                    ),
                  ),

                  H(
                    'div',
                    { className: 'sm-header-actions' },
                    !isRoomUnpaired
                      ? H(
                          'button',
                          {
                            type: 'button',
                            className: 'sm-btn sm-btn-sm',
                            disabled: busy || !canRotateTopic,
                            title: canRotateTopic ? '' : t('alreadyFreshTopicHint'),
                            onClick: () => {
                              if (!canRotateTopic) return
                              nearBottomRef.current = true
                              void controller.startNewTopic(activeRoom.id)
                            },
                          },
                          TopicIcon({ React, size: 12 }),
                          t('newTopicBtn'),
                        )
                      : null,
                    H(
                      'button',
                      {
                        type: 'button',
                        className: `sm-btn sm-btn-sm${rightPanel === 'tasks' ? ' sm-btn-primary' : ''}`,
                        onClick: () => setRightPanel((p) => (p === 'tasks' ? '' : 'tasks')),
                      },
                      TasksBoardIcon({ React, size: 12 }),
                      `${t('tasksBtn')}${taskSummary.total > 0 ? ` ${taskSummary.done}/${taskSummary.total}` : ''}`,
                      taskSummary.pendingApprovals > 0
                        ? H('span', { className: 'sm-badge sm-badge-approval', style: { marginLeft: '3px', padding: '0 5px' } }, String(taskSummary.pendingApprovals))
                        : null,
                    ),
                    H(
                      'button',
                      {
                        type: 'button',
                        className: `sm-btn sm-btn-sm${rightPanel === 'files' ? ' sm-btn-primary' : ''}`,
                        onClick: () => setRightPanel((p) => (p === 'files' ? '' : 'files')),
                      },
                      ClipIcon({ React, size: 12 }),
                      `${t('filesDrawerBtn')}${roomSharedFiles.length > 0 ? ` (${roomSharedFiles.length})` : ''}`,
                    ),
                    !isRoomUnpaired
                      ? H(
                          'button',
                          {
                            type: 'button',
                            className: `sm-btn sm-btn-sm${rightPanel === 'details' ? ' sm-btn-primary' : ''}`,
                            onClick: () => {
                              setRightPanel((p) => (p === 'details' ? '' : 'details'))
                              setConfirmAction(null)
                            },
                          },
                          SlidersIcon({ React, size: 12 }),
                          t('roomDetailsBtn'),
                        )
                      : H(
                          'button',
                          {
                            type: 'button',
                            className: 'sm-btn sm-btn-sm sm-btn-danger',
                            disabled: busy,
                            onClick: () => void controller.removeRoom(activeRoom.id),
                          },
                          t('removeRoomBtn'),
                        ),
                    H(
                      'button',
                      {
                        type: 'button',
                        className: 'sm-btn sm-btn-sm',
                        disabled: busy,
                        title: t('refreshBtn'),
                        onClick: () => void controller.syncFromHost(),
                      },
                      RefreshIcon({ React, size: 12 }),
                    ),
                  ),
                ),

                // Live Collaboration Topology Strip (appears when any Agent is actively coordinating/responding)
                activeStatusesList.length > 0
                  ? H(
                      'div',
                      { className: 'sm-topology-bar' },
                      H(
                        'span',
                        { className: 'sm-topo-label' },
                        H('span', { className: 'sm-dot-live' }),
                        t('collabActiveLabel'),
                      ),
                      H(
                        'div',
                        { className: 'sm-topo-flow' },
                        ...activeStatusesList.map((st, sIdx) =>
                          H(
                            React.Fragment || 'span',
                            { key: `topo-${st.slug}` },
                            sIdx > 0 ? H('span', { className: 'sm-topo-edge' }, '·') : null,
                            H(
                              'span',
                              { className: 'sm-topo-node' },
                              st.isModerator ? ModeratorCrownIcon({ React, size: 11 }) : AgentIcon({ React, size: 11 }),
                              `@${st.slug}`,
                              st.stage === 'waiting_peer' && st.detail
                                ? H(
                                    React.Fragment || 'span',
                                    null,
                                    H('span', { className: 'sm-topo-edge' }, '──▶'),
                                    H('strong', null, `@${st.detail}`),
                                  )
                                : null,
                            ),
                          ),
                        ),
                      ),
                    )
                  : null,

                // Message Stream
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
                    ? H('div', { style: { opacity: 0.72, fontSize: '12.5px', padding: '12px 4px' } }, t('noMessagesYet'))
                    : renderItems.map((item) => {
                        if (item.kind === 'divider') {
                          const clockStr = formatClock(item.createdAt)
                          const label = item.dividerKind === 'task' ? t('taskThreadDivider') : t('newTopicDivider')
                          return H(
                            'div',
                            {
                              key: item.id,
                              'data-anchor-id': item.anchorId,
                              className: 'sm-topic-divider',
                              title: item.threadId || undefined,
                            },
                            `${label}${clockStr ? ` · ${clockStr}` : ''}`,
                          )
                        }

                        if (item.kind === 'system') {
                          const clockStr = formatClock(item.msg.createdAt)
                          return H(
                            'div',
                            { key: item.id, className: 'sm-system-pill' },
                            SystemBellIcon({ React, size: 11 }),
                            H('span', null, localizeSystemMessage(item.msg.text, t)),
                            clockStr ? H('span', { style: { opacity: 0.65, fontSize: '10.5px' } }, clockStr) : null,
                          )
                        }

                        if (item.kind === 'approval') {
                          const msg = item.msg
                          const linkedTask = msg.taskId ? taskById.get(msg.taskId) : null
                          const apprStatus = linkedTask?.approvalStatus || 'pending'
                          const cardClass = apprStatus === 'approved'
                            ? 'sm-approval-card approved'
                            : apprStatus === 'rejected'
                              ? 'sm-approval-card rejected'
                              : 'sm-approval-card'
                          const commentVal = linkedTask ? (approvalComments[linkedTask.id] || '') : ''
                          const clockStr = formatClock(msg.createdAt)
                          return H(
                            'div',
                            {
                              key: item.id,
                              'data-anchor-id': `sm-msg-${msg.id}`,
                              className: cardClass,
                            },
                            H(
                              'div',
                              { className: 'sm-approval-head' },
                              H(
                                'span',
                                { className: 'sm-approval-title' },
                                ShieldCheckIcon({ React, size: 15 }),
                                linkedTask?.title || t('taskApprovalGateTitle'),
                              ),
                              H(
                                'div',
                                { className: 'sm-row', style: { gap: '6px' } },
                                H(
                                  'span',
                                  {
                                    className: `sm-task-status ${apprStatus === 'approved' ? 'done' : apprStatus === 'rejected' ? 'blocked' : 'in_review'}`,
                                  },
                                  apprStatus === 'approved'
                                    ? t('taskApprovalApproved')
                                    : apprStatus === 'rejected'
                                      ? t('taskApprovalRejected')
                                      : t('taskApprovalPending'),
                                ),
                                clockStr ? H('span', { style: { fontSize: '11px', opacity: 0.65 } }, clockStr) : null,
                              ),
                            ),
                            H(
                              'div',
                              { className: 'sm-approval-body' },
                              renderMarkdownMessage(H, msg.text || linkedTask?.approvalPrompt || '', { keyPrefix: `appr-${msg.id}`, t }),
                            ),
                            linkedTask && apprStatus === 'pending' && !isRoomUnpaired
                              ? H(
                                  'div',
                                  { className: 'sm-approval-actions' },
                                  H('input', {
                                    type: 'text',
                                    className: 'sm-input',
                                    value: commentVal,
                                    placeholder: t('taskApprovalCommentPlaceholder'),
                                    onChange: (e) => {
                                      const val = e.target?.value || ''
                                      setApprovalComments((prev) => ({ ...prev, [linkedTask.id]: val }))
                                    },
                                  }),
                                  H(
                                    'div',
                                    { className: 'sm-approval-btns' },
                                    H(
                                      'button',
                                      {
                                        type: 'button',
                                        className: 'sm-btn sm-btn-sm sm-btn-approve',
                                        disabled: busy,
                                        onClick: async () => {
                                          const c = (approvalComments[linkedTask.id] || '').trim()
                                          const res = await controller.decideApproval({
                                            roomId: activeRoom.id,
                                            taskId: linkedTask.id,
                                            decision: 'approved',
                                            comment: c,
                                          })
                                          if (res) {
                                            setApprovalComments((prev) => {
                                              const next = { ...prev }
                                              delete next[linkedTask.id]
                                              return next
                                            })
                                          }
                                        },
                                      },
                                      CheckIcon({ React, size: 12 }),
                                      t('taskApproveBtn'),
                                    ),
                                    H(
                                      'button',
                                      {
                                        type: 'button',
                                        className: 'sm-btn sm-btn-sm sm-btn-danger',
                                        disabled: busy,
                                        onClick: async () => {
                                          const c = (approvalComments[linkedTask.id] || '').trim()
                                          const res = await controller.decideApproval({
                                            roomId: activeRoom.id,
                                            taskId: linkedTask.id,
                                            decision: 'rejected',
                                            comment: c,
                                          })
                                          if (res) {
                                            setApprovalComments((prev) => {
                                              const next = { ...prev }
                                              delete next[linkedTask.id]
                                              return next
                                            })
                                          }
                                        },
                                      },
                                      CloseIcon({ React, size: 11 }),
                                      t('taskRejectBtn'),
                                    ),
                                  ),
                                )
                              : linkedTask && (apprStatus === 'approved' || apprStatus === 'rejected')
                                ? H(
                                    'div',
                                    { className: 'sm-approval-decided' },
                                    H(
                                      'span',
                                      null,
                                      `${t('taskApprovalDecidedBy')}: ${linkedTask.approvalDecidedBy || 'Human'}${linkedTask.approvalDecidedAt ? ` · ${formatClock(linkedTask.approvalDecidedAt)}` : ''}`,
                                    ),
                                    linkedTask.approvalComment
                                      ? H('span', { style: { fontStyle: 'italic' } }, linkedTask.approvalComment)
                                      : null,
                                  )
                                : null,
                          )
                        }

                        if (item.kind === 'collab-group') {
                          const defaultOpen = !item.hasFollowingMessage && activeStatusesList.length > 0
                          const isOpen = expandedCollabs[item.id] !== undefined
                            ? Boolean(expandedCollabs[item.id])
                            : defaultOpen
                          const firstStep = item.messages[0]
                          const preview = stripMarkdownForPreview(firstStep?.text || '', 64)
                          const actors = [...new Set(item.messages.map((m) => `@${m.sender?.slug || 'agent'}`))]
                          return H(
                            'div',
                            { key: item.id, className: 'sm-collab-group' },
                            H(
                              'button',
                              {
                                type: 'button',
                                className: 'sm-collab-toggle',
                                onClick: () => setExpandedCollabs((prev) => ({ ...prev, [item.id]: !isOpen })),
                              },
                              H(
                                'span',
                                { className: 'sm-collab-summary' },
                                ChevronIcon({ React, size: 12, rotated: isOpen }),
                                RoundtableIcon({ React, size: 13 }),
                                H('strong', null, t('collabStepsTitle')),
                                H('span', { className: 'sm-badge' }, `${item.messages.length} ${t('collabStepsCount')}`),
                                H('span', { className: 'sm-collab-preview' }, `${actors.join(' → ')}${preview ? ` · ${preview}` : ''}`),
                              ),
                              H('span', { style: { fontSize: '10.5px', opacity: 0.65, whiteSpace: 'nowrap' } }, formatClock(firstStep?.createdAt)),
                            ),
                            isOpen
                              ? H(
                                  'div',
                                  { className: 'sm-collab-steps' },
                                  ...item.messages.map((stepMsg) => {
                                    const isDispatch = stepMsg.kind === 'task'
                                    const targets = Array.isArray(stepMsg.mentions) && stepMsg.mentions.length > 0
                                      ? stepMsg.mentions.map((s) => `@${s}`).join(', ')
                                      : ''
                                    return H(
                                      'div',
                                      {
                                        key: stepMsg.id,
                                        className: `sm-collab-step ${isDispatch ? 'dispatch' : 'report'}`,
                                      },
                                      H(
                                        'div',
                                        { className: 'sm-collab-step-head' },
                                        H(
                                          'span',
                                          { className: 'sm-row', style: { gap: '5px' } },
                                          isDispatch
                                            ? ModeratorCrownIcon({ React, size: 11 })
                                            : AgentIcon({ React, size: 11 }),
                                          H('strong', { style: { color: 'var(--sm-fg-primary)' } }, `@${stepMsg.sender?.slug}`),
                                          H(
                                            'span',
                                            null,
                                            isDispatch
                                              ? `${t('collabStepDispatch')} ${targets || ''}`.trim()
                                              : t('collabStepReport'),
                                          ),
                                        ),
                                        H('span', null, formatClock(stepMsg.createdAt)),
                                      ),
                                      renderMarkdownMessage(H, stepMsg.text, {
                                        keyPrefix: stepMsg.id,
                                        onCopyCode: flashCopy,
                                        copiedCodeKey: copiedKey,
                                        t,
                                      }),
                                    )
                                  }),
                                )
                              : null,
                          )
                        }

                        // Standard human / agent / file bubble
                        const msg = item.msg
                        const clockStr = formatClock(msg.createdAt)
                        const isSelf = msg.sender?.slug === self.slug
                        const isAgent = msg.sender?.actor === 'agent'
                        const isModSender = activeRoom.type === 'group' && msg.sender?.slug === activeModeratorSlug
                        const actorIcon = isAgent
                          ? (isModSender ? ModeratorCrownIcon({ React, size: 12 }) : AgentIcon({ React, size: 12 }))
                          : HumanIcon({ React, size: 12 })
                        const pending = msg.delivery?.pendingPeers || []
                        const hideRedundantFileCaption = Boolean(
                          msg.kind === 'file'
                          && msg.attachment?.name
                          && String(msg.text || '').trim() === `#${msg.attachment.name}`,
                        )
                        const msgCopyId = `msg-${msg.id}`

                        return H(
                          'div',
                          {
                            key: msg.id,
                            'data-anchor-id': `sm-msg-${msg.id}`,
                            className: `sm-msg${isSelf ? ' self' : ''}${isAgent ? (isModSender ? ' agent moderator-agent' : ' agent') : ''}`,
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
                            H(
                              'span',
                              { className: 'sm-row', style: { gap: '6px' } },
                              H(
                                'span',
                                { className: 'sm-msg-actions' },
                                H(
                                  'button',
                                  {
                                    type: 'button',
                                    className: 'sm-msg-act-btn',
                                    title: t('copyMsgBtn'),
                                    onClick: () => void flashCopy(msg.text || '', msgCopyId),
                                  },
                                  copiedKey === msgCopyId ? CheckIcon({ React, size: 11 }) : CopyIcon({ React, size: 11 }),
                                  copiedKey === msgCopyId ? t('copiedCodeBtn') : t('copyMsgBtn'),
                                ),
                                !isRoomUnpaired
                                  ? H(
                                      'button',
                                      {
                                        type: 'button',
                                        className: 'sm-msg-act-btn',
                                        title: t('replyMsgBtn'),
                                        onClick: () => {
                                          setReplyTarget({
                                            slug: msg.sender?.slug || 'peer',
                                            ownerName: msg.sender?.ownerName || msg.sender?.slug || 'peer',
                                            preview: stripMarkdownForPreview(msg.text || msg.attachment?.name || '', 72),
                                          })
                                          composerRef?.current?.focus?.()
                                        },
                                      },
                                      ReplyIcon({ React, size: 11 }),
                                      t('replyMsgBtn'),
                                    )
                                  : null,
                              ),
                              H('span', null, clockStr),
                            ),
                          ),
                          !hideRedundantFileCaption && msg.text
                            ? renderMarkdownMessage(H, msg.text, {
                                keyPrefix: msg.id,
                                onCopyCode: flashCopy,
                                copiedCodeKey: copiedKey,
                                t,
                              })
                            : null,
                          msg.attachment ? renderFileCard(msg) : null,
                          pending.length > 0
                            ? H(
                                'div',
                                { style: { fontSize: '11px', opacity: 0.72 } },
                                `${t('pendingOutbox')} ${pending.join(', ')}`,
                              )
                            : null,
                        )
                      }),
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

                // Composer or Disconnected Banner
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

                      replyTarget
                        ? H(
                            'div',
                            { className: 'sm-reply-bar' },
                            H(
                              'span',
                              { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                              `${t('replyingToLabel')} @${replyTarget.slug}: ${replyTarget.preview}`,
                            ),
                            H(
                              'button',
                              {
                                type: 'button',
                                className: 'sm-btn-ghost',
                                title: t('clearReplyBtn'),
                                onClick: () => setReplyTarget(null),
                              },
                              CloseIcon({ React, size: 11 }),
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
                        H('input', {
                          ref: fileInputRef,
                          type: 'file',
                          style: { display: 'none' },
                          onChange: (e) => {
                            const f = e.target?.files?.[0]
                            if (f) uploadBrowserFile(f)
                            if (e.target) e.target.value = ''
                          },
                        }),
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
                        H(
                          'button',
                          {
                            type: 'button',
                            className: 'sm-trigger-btn',
                            title: t('uploadFileTitle'),
                            disabled: busy,
                            onClick: () => fileInputRef?.current?.click?.(),
                          },
                          UploadIcon({ React, size: 13 }),
                        ),
                        H('textarea', {
                          ref: composerRef,
                          rows: 1,
                          className: 'sm-composer-input',
                          value: draftText,
                          placeholder: t('composerPlaceholder'),
                          onChange: (e) => handleDraftChange(e.target?.value || ''),
                          onKeyDown: (e) => {
                            // Never submit while an IME (Chinese/Japanese/Korean) composition is active
                            if (e.isComposing || e.nativeEvent?.isComposing || e.keyCode === 229) {
                              return
                            }
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

        // Right Drawer: Shared Task Board, Shared Files Box, OR Room Details & Management
        activeRoom && rightPanel
          ? H(
              'aside',
              { className: 'sm-detail-drawer' },
              H(
                'div',
                { className: 'sm-drawer-head' },
                H(
                  'span',
                  { className: 'sm-row', style: { gap: '6px' } },
                  rightPanel === 'tasks'
                    ? TasksBoardIcon({ React, size: 13 })
                    : rightPanel === 'files'
                      ? ClipIcon({ React, size: 13 })
                      : SlidersIcon({ React, size: 13 }),
                  rightPanel === 'tasks'
                    ? t('tasksDrawerTitle')
                    : rightPanel === 'files'
                      ? t('filesDrawerTitle')
                      : t('roomDetailsTitle'),
                ),
                H(
                  'button',
                  {
                    type: 'button',
                    className: 'sm-btn-ghost',
                    onClick: () => setRightPanel(''),
                  },
                  CloseIcon({ React, size: 13 }),
                ),
              ),
              rightPanel === 'tasks'
                ? H(
                    'div',
                    { className: 'sm-drawer-body' },
                    // Progress Summary + Filter + New Task button
                    H(
                      'div',
                      { className: 'sm-task-progress-wrap' },
                      H(
                        'div',
                        { className: 'sm-row', style: { justifyContent: 'space-between', fontSize: '11.5px' } },
                        H('span', { style: { fontWeight: 600 } }, `${t('tasksProgressLabel')}: ${taskSummary.done}/${taskSummary.total}`),
                        taskSummary.pendingApprovals > 0
                          ? H('span', { className: 'sm-badge sm-badge-approval' }, `${taskSummary.pendingApprovals} ${t('taskApprovalBadgeShort')}`)
                          : null,
                      ),
                      H(
                        'div',
                        { className: 'sm-task-progress-bar' },
                        H('div', {
                          className: 'sm-task-progress-fill',
                          style: { width: `${taskSummary.total > 0 ? Math.round((taskSummary.done / taskSummary.total) * 100) : 0}%` },
                        }),
                      ),
                      H(
                        'div',
                        { className: 'sm-row', style: { justifyContent: 'space-between', gap: '6px', marginTop: '4px' } },
                        H(
                          'div',
                          { className: 'sm-row', style: { gap: '4px' } },
                          H(
                            'button',
                            {
                              type: 'button',
                              className: `sm-btn sm-btn-sm${!taskFilterAll ? ' sm-btn-primary' : ''}`,
                              onClick: () => setTaskFilterAll(false),
                            },
                            t('tasksFilterThread'),
                          ),
                          H(
                            'button',
                            {
                              type: 'button',
                              className: `sm-btn sm-btn-sm${taskFilterAll ? ' sm-btn-primary' : ''}`,
                              onClick: () => setTaskFilterAll(true),
                            },
                            t('tasksFilterAll'),
                          ),
                        ),
                        !isRoomUnpaired
                          ? H(
                              'button',
                              {
                                type: 'button',
                                className: 'sm-btn sm-btn-sm',
                                onClick: () => setShowNewTaskForm((v) => !v),
                              },
                              showNewTaskForm ? t('cancelBtn') : t('taskNewBtn'),
                            )
                          : null,
                      ),
                    ),
                    // Inline New Task Form
                    showNewTaskForm && !isRoomUnpaired
                      ? H(
                          'div',
                          { className: 'sm-task-form' },
                          H('input', {
                            type: 'text',
                            className: 'sm-input',
                            value: newTaskTitle,
                            placeholder: t('taskTitlePlaceholder'),
                            onChange: (e) => setNewTaskTitle(e.target?.value || ''),
                          }),
                          H('textarea', {
                            className: 'sm-sop-textarea',
                            style: { minHeight: '56px' },
                            value: newTaskDesc,
                            placeholder: t('taskDescPlaceholder'),
                            onChange: (e) => setNewTaskDesc(e.target?.value || ''),
                          }),
                          H(
                            'div',
                            { className: 'sm-row', style: { gap: '6px' } },
                            H(
                              'select',
                              {
                                className: 'sm-input',
                                value: newTaskAssignee,
                                onChange: (e) => setNewTaskAssignee(e.target?.value || ''),
                              },
                              H('option', { value: '' }, t('taskAssigneeNone')),
                              ...(activeRoom.members || []).map((m) =>
                                H('option', { key: m.slug, value: m.slug }, `@${m.slug}${m.role ? ` · ${m.role}` : ''}`),
                              ),
                            ),
                            H(
                              'select',
                              {
                                className: 'sm-input',
                                style: { width: '92px', flex: 'none' },
                                value: newTaskPriority,
                                onChange: (e) => setNewTaskPriority(e.target?.value || 'medium'),
                              },
                              ...TASK_PRIORITIES.map((pr) =>
                                H('option', { key: pr, value: pr }, taskPriorityLabel(t, pr)),
                              ),
                            ),
                          ),
                          H(
                            'label',
                            { className: 'sm-row', style: { fontSize: '11.5px', cursor: 'pointer', gap: '6px' } },
                            H('input', {
                              type: 'checkbox',
                              checked: newTaskApproval,
                              onChange: (e) => setNewTaskApproval(Boolean(e.target?.checked)),
                            }),
                            t('taskApprovalGateTitle'),
                          ),
                          H(
                            'button',
                            {
                              type: 'button',
                              className: 'sm-btn sm-btn-sm sm-btn-primary',
                              disabled: busy || !newTaskTitle.trim(),
                              onClick: async () => {
                                const res = await controller.createTask({
                                  roomId: activeRoom.id,
                                  threadId: activeRoom.activeThreadId || '',
                                  title: newTaskTitle.trim(),
                                  description: newTaskDesc.trim(),
                                  assigneeSlug: newTaskAssignee,
                                  priority: newTaskPriority,
                                  approvalRequired: newTaskApproval,
                                  approvalPrompt: newTaskApproval ? (newTaskDesc.trim() || newTaskTitle.trim()) : '',
                                  notifyAssignees: true,
                                })
                                if (res) {
                                  setNewTaskTitle('')
                                  setNewTaskDesc('')
                                  setNewTaskAssignee('')
                                  setNewTaskPriority('medium')
                                  setNewTaskApproval(false)
                                  setShowNewTaskForm(false)
                                }
                              },
                            },
                            t('taskCreateSubmit'),
                          ),
                        )
                      : null,
                    // Task Cards List
                    sortedVisibleTasks.length === 0
                      ? H('div', { style: { fontSize: '12px', opacity: 0.72, lineHeight: 1.5 } }, t('tasksEmptyHint'))
                      : sortedVisibleTasks.map((tk) => {
                          const isPendingAppr = Boolean(tk.approvalRequired && tk.approvalStatus === 'pending')
                          const depsMet = areTaskDependenciesMet(tk, allRoomTasks)
                          const cardCls = `sm-task-card${isPendingAppr ? ' is-approval-pending' : ''}${tk.status === 'blocked' ? ' is-blocked' : ''}${tk.status === 'done' ? ' is-done' : ''}`
                          return H(
                            'div',
                            { key: tk.id, className: cardCls },
                            H(
                              'div',
                              { className: 'sm-task-top' },
                              H('span', { className: 'sm-task-title' }, tk.title),
                              H('span', { className: `sm-task-priority ${tk.priority || 'medium'}` }, taskPriorityLabel(t, tk.priority)),
                            ),
                            H(
                              'div',
                              { className: 'sm-task-meta' },
                              !isRoomUnpaired
                                ? H(
                                    'select',
                                    {
                                      className: `sm-task-status ${tk.status}`,
                                      style: { border: '1px solid var(--sm-border-l2)', cursor: 'pointer' },
                                      value: tk.status,
                                      disabled: busy,
                                      onChange: (e) => {
                                        const nextSt = e.target?.value
                                        if (nextSt && nextSt !== tk.status) {
                                          void controller.updateTask({
                                            roomId: activeRoom.id,
                                            taskId: tk.id,
                                            status: nextSt,
                                          })
                                        }
                                      },
                                    },
                                    ...TASK_STATUSES.map((st) =>
                                      H('option', { key: st, value: st }, taskStatusLabel(t, st)),
                                    ),
                                  )
                                : H('span', { className: `sm-task-status ${tk.status}` }, taskStatusLabel(t, tk.status)),
                              tk.assigneeSlug
                                ? H('span', { className: 'sm-badge' }, `@${tk.assigneeSlug}`)
                                : H('span', { style: { opacity: 0.6 } }, t('taskAssigneeNone')),
                              isPendingAppr
                                ? H('span', { className: 'sm-badge sm-badge-approval' }, t('taskApprovalPending'))
                                : tk.approvalStatus === 'approved'
                                  ? H('span', { className: 'sm-task-status done' }, t('taskApprovalApproved'))
                                  : tk.approvalStatus === 'rejected'
                                    ? H('span', { className: 'sm-task-status blocked' }, t('taskApprovalRejected'))
                                    : null,
                            ),
                            Array.isArray(tk.dependsOn) && tk.dependsOn.length > 0
                              ? H(
                                  'div',
                                  { style: { fontSize: '11px', opacity: 0.78 } },
                                  `${t('taskDepsLabel')}: ${tk.dependsOn.map((id) => taskById.get(id)?.title || id).join(', ')} (${depsMet ? '✓' : '⏳'})`,
                                )
                              : null,
                            tk.summary
                              ? H('div', { className: 'sm-task-summary' }, tk.summary)
                              : tk.description
                                ? H('div', { className: 'sm-task-summary' }, tk.description)
                                : null,
                            Array.isArray(tk.artifacts) && tk.artifacts.length > 0
                              ? H(
                                  'div',
                                  { className: 'sm-task-artifacts' },
                                  ...tk.artifacts.map((art, aIdx) => {
                                    const isHttp = /^https?:\/\//i.test(art)
                                    return isHttp
                                      ? H(
                                          'a',
                                          {
                                            key: `${tk.id}-art-${aIdx}`,
                                            className: 'sm-task-artifact-chip',
                                            href: art,
                                            target: '_blank',
                                            rel: 'noopener noreferrer',
                                            title: art,
                                          },
                                          art,
                                        )
                                      : H(
                                          'button',
                                          {
                                            key: `${tk.id}-art-${aIdx}`,
                                            type: 'button',
                                            className: 'sm-task-artifact-chip',
                                            title: art,
                                            onClick: () => void flashCopy(art, `art-${tk.id}-${aIdx}`),
                                          },
                                          copiedKey === `art-${tk.id}-${aIdx}` ? t('copiedBtn') : art,
                                        )
                                  }),
                                )
                              : null,
                            isPendingAppr && !isRoomUnpaired
                              ? H(
                                  'div',
                                  { className: 'sm-approval-btns', style: { marginTop: '4px' } },
                                  H(
                                    'button',
                                    {
                                      type: 'button',
                                      className: 'sm-btn sm-btn-sm sm-btn-approve',
                                      disabled: busy,
                                      onClick: () => void controller.decideApproval({
                                        roomId: activeRoom.id,
                                        taskId: tk.id,
                                        decision: 'approved',
                                      }),
                                    },
                                    CheckIcon({ React, size: 11 }),
                                    t('taskApproveBtn'),
                                  ),
                                  H(
                                    'button',
                                    {
                                      type: 'button',
                                      className: 'sm-btn sm-btn-sm sm-btn-danger',
                                      disabled: busy,
                                      onClick: () => void controller.decideApproval({
                                        roomId: activeRoom.id,
                                        taskId: tk.id,
                                        decision: 'rejected',
                                      }),
                                    },
                                    CloseIcon({ React, size: 11 }),
                                    t('taskRejectBtn'),
                                  ),
                                )
                              : null,
                          )
                        }),
                  )
                : rightPanel === 'files'
                ? H(
                    'div',
                    { className: 'sm-drawer-body' },
                    roomSharedFiles.length === 0
                      ? H('div', { style: { fontSize: '12px', opacity: 0.72 } }, t('noSharedFilesYet'))
                      : roomSharedFiles.map((fMsg) =>
                          H(
                            'div',
                            { key: `file-row-${fMsg.id}`, style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
                            H(
                              'div',
                              { style: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', opacity: 0.75 } },
                              H('span', null, `@${fMsg.sender?.slug || 'peer'}`),
                              H('span', null, formatRelativeTime(fMsg.createdAt, t)),
                            ),
                            renderFileCard(fMsg, true),
                          ),
                        ),
                  )
                : H(
                    'div',
                    { className: 'sm-drawer-body' },
                    // Group Rename & Moderator
                    activeRoom.type === 'group' && !isRoomUnpaired
                      ? H(
                          React.Fragment || 'div',
                          null,
                          canRenameGroup
                            ? H(
                                'div',
                                { className: 'sm-drawer-section' },
                                H('span', { className: 'sm-drawer-label' }, t('renameGroupLabel')),
                                editingName
                                  ? H(
                                      'div',
                                      { className: 'sm-row' },
                                      H('input', {
                                        type: 'text',
                                        className: 'sm-input',
                                        value: renameInput,
                                        onChange: (e) => setRenameInput(e.target?.value || ''),
                                        onKeyDown: (e) => {
                                          if (e.isComposing || e.nativeEvent?.isComposing || e.keyCode === 229) return
                                          if (e.key === 'Enter' && renameInput.trim()) {
                                            e.preventDefault?.()
                                            void controller.renameGroup({ roomId: activeRoom.id, name: renameInput.trim() }).then((r) => {
                                              if (r) setEditingName(false)
                                            })
                                          }
                                        },
                                      }),
                                      H(
                                        'button',
                                        {
                                          type: 'button',
                                          className: 'sm-btn sm-btn-sm sm-btn-primary',
                                          disabled: busy || !renameInput.trim(),
                                          onClick: async () => {
                                            const r = await controller.renameGroup({ roomId: activeRoom.id, name: renameInput.trim() })
                                            if (r) setEditingName(false)
                                          },
                                        },
                                        t('saveBtn'),
                                      ),
                                    )
                                  : H(
                                      'div',
                                      { className: 'sm-row', style: { justifyContent: 'space-between' } },
                                      H('strong', { style: { fontSize: '13px' } }, activeRoom.name),
                                      H(
                                        'button',
                                        {
                                          type: 'button',
                                          className: 'sm-btn sm-btn-sm',
                                          onClick: () => {
                                            setRenameInput(activeRoom.name || '')
                                            setEditingName(true)
                                          },
                                        },
                                        EditIcon({ React, size: 11 }),
                                        t('renameGroupBtn'),
                                      ),
                                    ),
                              )
                            : null,
                          H(
                            'div',
                            { className: 'sm-drawer-section' },
                            H('span', { className: 'sm-drawer-label' }, t('moderatorBadge')),
                            H(
                              'select',
                              {
                                className: 'sm-input',
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
                            ),
                          ),
                          uninvitedPeers.length > 0
                            ? H(
                                'div',
                                { className: 'sm-drawer-section' },
                                H('span', { className: 'sm-drawer-label' }, t('inviteBtn')),
                                H(
                                  'div',
                                  { className: 'sm-row' },
                                  H(
                                    'select',
                                    {
                                      className: 'sm-input',
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
                                      className: 'sm-btn sm-btn-sm sm-btn-primary',
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
                                ),
                              )
                            : null,
                          H(
                            'div',
                            { className: 'sm-drawer-section' },
                            H('span', { className: 'sm-drawer-label' }, `${t('membersLabel')} (${(activeRoom.members || []).length})`),
                            ...(activeRoom.members || []).map((m) =>
                              H(
                                'div',
                                { key: m.slug, className: 'sm-peer-row', style: { padding: '7px 9px' } },
                                H(
                                  'div',
                                  { style: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 } },
                                  H(
                                    'div',
                                    { className: 'sm-row', style: { gap: '5px', flexWrap: 'wrap' } },
                                    H('strong', { style: { fontSize: '12px' } }, `@${m.slug}`),
                                    m.slug === activeRoom.createdBy ? H('span', { className: 'sm-badge' }, t('creatorBadge')) : null,
                                    m.slug === activeModeratorSlug ? H('span', { className: 'sm-badge sm-badge-moderator' }, t('moderatorBadge')) : null,
                                  ),
                                  m.role ? H('span', { style: { fontSize: '11px', opacity: 0.72 } }, m.role) : null,
                                ),
                                isGroupCreator && m.slug !== self.slug && m.slug !== activeRoom.createdBy
                                  ? (confirmAction?.type === 'kick' && confirmAction.slug === m.slug
                                    ? H(
                                        'div',
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
                                          style: { color: '#dc2626' },
                                          disabled: busy,
                                          onClick: () => setConfirmAction({ type: 'kick', slug: m.slug }),
                                        },
                                        t('removeMemberBtn'),
                                      ))
                                  : null,
                              ),
                            ),
                          ),
                        )
                      : null,

                    // Pair Room Peer Controls
                    activeRoom.type === 'pair' && !isRoomUnpaired && activeRoom.peerSlug
                      ? H(
                          'div',
                          { className: 'sm-drawer-section' },
                          H('span', { className: 'sm-drawer-label' }, activeRoom.name),
                          activePairPeer?.role
                            ? H('span', { className: 'sm-badge', style: { alignSelf: 'flex-start' } }, activePairPeer.role)
                            : null,
                          H('div', { style: { fontSize: '12px', opacity: 0.8 } }, activePairPeer?.description || t('noSpecialtyYet')),
                          H(
                            'div',
                            { className: 'sm-row', style: { flexWrap: 'wrap' } },
                            H(
                              'button',
                              {
                                type: 'button',
                                className: 'sm-btn sm-btn-sm',
                                disabled: busy,
                                onClick: () => void controller.pingPeer(activeRoom.peerSlug),
                              },
                              t('pingBtn'),
                            ),
                            H(
                              'button',
                              {
                                type: 'button',
                                className: 'sm-btn sm-btn-sm sm-btn-danger',
                                disabled: busy,
                                onClick: () => setConfirmAction({ type: 'unpair', slug: activeRoom.peerSlug }),
                              },
                              t('unpairBtn'),
                            ),
                          ),
                          confirmAction?.type === 'unpair' && confirmAction.slug === activeRoom.peerSlug
                            ? H(
                                'div',
                                { className: 'sm-confirm-bar' },
                                H(
                                  'div',
                                  { style: { display: 'flex', flexDirection: 'column', gap: '2px' } },
                                  H('strong', null, `${t('unpairConfirmTitle')} @${confirmAction.slug}`),
                                  ownedGroupsWithTarget(confirmAction.slug).length > 0
                                    ? H('span', { style: { fontSize: '11px', opacity: 0.85 } }, t('unpairGroupWarn'))
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
                                        setRightPanel('')
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
                                      onClick: () => setConfirmAction(null),
                                    },
                                    t('cancelBtn'),
                                  ),
                                ),
                              )
                            : null,
                        )
                      : null,

                    // Topic Directory Jump List
                    roomTopics.length > 0
                      ? H(
                          'div',
                          { className: 'sm-drawer-section' },
                          H('span', { className: 'sm-drawer-label' }, `${t('topicsSectionTitle')} (${roomTopics.length})`),
                          ...roomTopics.slice().reverse().map((tp, tIdx) =>
                            H(
                              'button',
                              {
                                key: tp.id,
                                type: 'button',
                                className: 'sm-topic-jump-btn',
                                onClick: () => scrollToAnchor(tp.anchorId),
                              },
                              H(
                                'span',
                                { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                                tp.preview || `${t('topicItemLabel')} #${roomTopics.length - tIdx}`,
                              ),
                              H('span', { style: { fontSize: '10.5px', opacity: 0.65, flexShrink: 0 } }, formatClock(tp.createdAt)),
                            ),
                          ),
                        )
                      : null,

                    // Leave / Dissolve Group
                    activeRoom.type === 'group' && !isRoomUnpaired
                      ? H(
                          'div',
                          { className: 'sm-drawer-section', style: { marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid var(--sm-border-l1)' } },
                          confirmAction?.type === 'leave-group'
                            ? H(
                                'div',
                                { className: 'sm-confirm-bar' },
                                H('span', null, t('confirmLeaveGroup')),
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
                                        setConfirmAction(null)
                                        setRightPanel('')
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
                        )
                      : null,
                  ),
            )
          : null,
      ),

      // Shared File Online Preview Modal
      previewState
        ? H(
            'div',
            {
              className: 'sm-preview-backdrop',
              onClick: (e) => {
                if (e.target === e.currentTarget) setPreviewState(null)
              },
            },
            H(
              'div',
              { className: 'sm-preview-modal', role: 'dialog', 'aria-label': previewState.name },
              H(
                'div',
                { className: 'sm-preview-head' },
                H(
                  'div',
                  { className: 'sm-row', style: { minWidth: 0 } },
                  FileDocIcon({ React, size: 15 }),
                  H('strong', { style: { fontSize: '13.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, previewState.name),
                  H('span', { className: 'sm-badge' }, formatBytes(previewState.size)),
                ),
                H(
                  'div',
                  { className: 'sm-row', style: { gap: '6px' } },
                  previewState.kind === 'markdown'
                    ? H(
                        'button',
                        {
                          type: 'button',
                          className: 'sm-btn sm-btn-sm',
                          onClick: () => setPreviewState((cur) => (cur ? { ...cur, rawMode: !cur.rawMode } : cur)),
                        },
                        previewState.rawMode ? t('previewRenderedBtn') : t('previewRawBtn'),
                      )
                    : null,
                  previewState.text
                    ? H(
                        'button',
                        {
                          type: 'button',
                          className: 'sm-btn sm-btn-sm',
                          onClick: () => void flashCopy(previewState.text, 'preview-copy'),
                        },
                        copiedKey === 'preview-copy' ? CheckIcon({ React, size: 12 }) : CopyIcon({ React, size: 12 }),
                        copiedKey === 'preview-copy' ? t('copiedCodeBtn') : t('copyCodeBtn'),
                      )
                    : null,
                  H(
                    'a',
                    {
                      className: 'sm-btn sm-btn-sm sm-btn-primary',
                      href: previewState.downloadUrl,
                      download: previewState.name,
                      style: { textDecoration: 'none' },
                    },
                    DownloadIcon({ React, size: 12 }),
                    t('downloadBtn'),
                  ),
                  H(
                    'button',
                    {
                      type: 'button',
                      className: 'sm-btn-ghost',
                      onClick: () => setPreviewState(null),
                    },
                    CloseIcon({ React, size: 14 }),
                  ),
                ),
              ),
              H(
                'div',
                { className: 'sm-preview-body' },
                previewState.loading
                  ? H('div', { style: { opacity: 0.72, fontSize: '12.5px' } }, t('previewLoading'))
                  : previewState.error
                    ? H('div', { className: 'sm-alert' }, previewState.error)
                    : previewState.kind === 'image'
                      ? H('img', { className: 'sm-preview-img', src: previewState.url, alt: previewState.name })
                      : previewState.kind === 'markdown' && !previewState.rawMode
                        ? renderMarkdownMessage(H, previewState.text, {
                            keyPrefix: `prev-${previewState.msgId}`,
                            onCopyCode: flashCopy,
                            copiedCodeKey: copiedKey,
                            t,
                          })
                        : previewState.kind === 'binary'
                          ? H('div', { style: { opacity: 0.78, fontSize: '13px', textAlign: 'center', padding: '24px' } }, t('previewUnavailable'))
                          : H('pre', { className: 'sm-preview-pre' }, previewState.text),
              ),
            ),
          )
        : null,
    )
  }
}

/**
 * Settings Section Page: Node Agent Profile (with Quick Presets) + 1-on-1 Pairing + Connected Sandboxes.
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
    const [pingingAll, setPingingAll] = useState(false)
    const initialSelf = controller.getSnapshot().state?.self || {}
    const [roleInput, setRoleInput] = useState(initialSelf.role || '')
    const [descInput, setDescInput] = useState(initialSelf.description || '')
    const [sopInput, setSopInput] = useState(initialSelf.instructions || '')
    const [profileDirty, setProfileDirty] = useState(false)
    const endpointInputRef = useRef ? useRef(null) : { current: null }
    const copyTimerRef = useRef ? useRef(null) : { current: null }

    useEffect(() => {
      const offCtrl = controller.subscribe(() => {
        const latestSelf = controller.getSnapshot().state?.self || {}
        if (!profileDirty) {
          setRoleInput(latestSelf.role || '')
          setDescInput(latestSelf.description || '')
          setSopInput(latestSelf.instructions || '')
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

    const roleTemplates = [
      { id: 'pm', role: t('tplPmRole'), desc: t('tplPmDesc'), sop: t('tplPmSop') },
      { id: 'arch', role: t('tplArchRole'), desc: t('tplArchDesc'), sop: t('tplArchSop') },
      { id: 'fullstack', role: t('tplFullstackRole'), desc: t('tplFullstackDesc'), sop: t('tplFullstackSop') },
      { id: 'fe', role: t('tplFrontendRole'), desc: t('tplFrontendDesc'), sop: t('tplFrontendSop') },
      { id: 'be', role: t('tplBackendRole'), desc: t('tplBackendDesc'), sop: t('tplBackendSop') },
      { id: 'qa', role: t('tplQaRole'), desc: t('tplQaDesc'), sop: t('tplQaSop') },
      { id: 'devops', role: t('tplDevopsRole'), desc: t('tplDevopsDesc'), sop: t('tplDevopsSop') },
      { id: 'sec', role: t('tplSecRole'), desc: t('tplSecDesc'), sop: t('tplSecSop') },
      { id: 'data', role: t('tplDataRole'), desc: t('tplDataDesc'), sop: t('tplDataSop') },
      { id: 'docs', role: t('tplDocsRole'), desc: t('tplDocsDesc'), sop: t('tplDocsSop') },
    ]

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
        instructions: sopInput,
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

    const handlePingAll = async () => {
      setPingingAll(true)
      try {
        await controller.pingAllPeers()
      } finally {
        setPingingAll(false)
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
          RefreshIcon({ React, size: 12 }),
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
        H(
          'div',
          { className: 'sm-invite-item', style: { flexDirection: 'column', alignItems: 'stretch', gap: '5px' } },
          H('span', { className: 'sm-invite-label' }, t('sopLabel')),
          H('textarea', {
            className: 'sm-sop-textarea',
            value: sopInput,
            placeholder: t('sopPlaceholder'),
            onChange: (e) => {
              setProfileDirty(true)
              setSopInput(e.target?.value || '')
            },
          }),
          H('span', { style: { fontSize: '11.5px', opacity: 0.72 } }, t('sopHint')),
        ),
        H(
          'div',
          { className: 'sm-template-row' },
          H('span', null, t('roleTemplatesLabel')),
          ...roleTemplates.map((tpl) =>
            H(
              'button',
              {
                key: tpl.id,
                type: 'button',
                className: 'sm-template-pill',
                onClick: () => {
                  setProfileDirty(true)
                  setRoleInput(tpl.role)
                  setDescInput(tpl.desc)
                  setSopInput(tpl.sop || '')
                },
              },
              tpl.role,
            ),
          ),
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

      // 2. 1-on-1 Pairing Card
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
        H(
          'div',
          { className: 'sm-card-title' },
          H('span', null, `${t('pairedPeersTitle')} (${peers.length})`),
          peers.length > 0
            ? H(
                'button',
                {
                  type: 'button',
                  className: 'sm-btn sm-btn-sm',
                  disabled: busy || pingingAll,
                  onClick: () => void handlePingAll(),
                },
                pingingAll ? t('pingingAllBtn') : t('pingAllBtn'),
              )
            : null,
        ),
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
                        renderPeerStatusBadge(H, t, peer.status, peer.lastLatencyMs),
                      ),
                      H(
                        'div',
                        { style: { fontSize: '12px', opacity: peer.description ? 0.88 : 0.55 } },
                        peer.description || t('noSpecialtyYet'),
                      ),
                      H(
                        'div',
                        {
                          style: {
                            fontSize: '11px',
                            opacity: 0.62,
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          },
                          title: peer.endpointUrl || '',
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
