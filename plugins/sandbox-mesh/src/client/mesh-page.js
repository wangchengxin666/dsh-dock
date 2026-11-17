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
 * Left Sidebar Main Page: Minimalist IM Chat + LLM-Moderated Groups + Context Thread Isolation.
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
    const { state, selectedRoomId, workspaceFiles, busy, errorText } = snap
    const self = state.self || {}
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

    // Build `@` mention candidates
    const mentionCandidates = []
    if (activeRoom) {
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
    }

    const togglePeerCheck = (slug) => {
      setCheckedPeers((prev) => ({ ...prev, [slug]: !prev[slug] }))
    }

    const selectedGroupPeerSlugs = Object.keys(checkedPeers).filter((k) => checkedPeers[k])
    const moderatorCandidateSlugs = [self.slug, ...selectedGroupPeerSlugs].filter(Boolean)

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
      if (!activeRoom) return
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

    const uninvitedPeers = activeRoom && activeRoom.type === 'group'
      ? peers.filter((p) => !(activeRoom.members || []).some((m) => m.slug === p.slug))
      : []

    return H(
      'div',
      { className: 'sm-chat-shell' },
      // Left Column: Room List
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
              'button',
              {
                type: 'button',
                className: 'sm-btn sm-btn-primary',
                onClick: () => setShowNewGroup((v) => !v),
              },
              showNewGroup ? t('cancelBtn') : t('newGroupBtn'),
            ),
          ),
          H('input', {
            type: 'text',
            className: 'sm-input',
            value: roomFilter,
            placeholder: t('searchRoomsPlaceholder'),
            onChange: (e) => setRoomFilter(e.target?.value || ''),
          }),
          showNewGroup
            ? H(
                'div',
                { className: 'sm-group-drawer' },
                H('strong', { style: { fontSize: '12px' } }, t('groupSectionTitle')),
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
                          },
                        },
                        room.name,
                      ),
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

      // Right Column: Streamlined Chat View + Unified @ / # Composer
      H(
        'section',
        { className: 'sm-chat-main' },
        errorText ? H('div', { className: 'sm-alert', role: 'alert' }, errorText) : null,
        !activeRoom
          ? H(
              'div',
              { style: { margin: 'auto', padding: '48px 24px', textAlign: 'center', opacity: 0.7, fontSize: '13px' } },
              t('emptyRoomPrompt'),
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
                          onClick: () => {
                            const mention = `@${m.slug}`
                            const sep = draftText && !draftText.endsWith(' ') ? ' ' : ''
                            setDraftText(`${draftText}${sep}${mention} `)
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
                  activeRoom.type === 'group'
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
                  activeRoom.type === 'group' && uninvitedPeers.length > 0
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
                  H(
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
              ),

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

              // Unified Single Composer (with @mention & #file Popover)
              H(
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
                  H('input', {
                    type: 'text',
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
  const { useState, useEffect } = React

  return function SandboxMeshSettingsPage() {
    const [, setTick] = useState(0)
    const [pairInput, setPairInput] = useState('')
    const [copiedField, setCopiedField] = useState('')
    const initialSelf = controller.getSnapshot().state?.self || {}
    const [roleInput, setRoleInput] = useState(initialSelf.role || '')
    const [descInput, setDescInput] = useState(initialSelf.description || '')
    const [profileDirty, setProfileDirty] = useState(false)

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

    const t = createTranslator(typeof getLocale === 'function' ? getLocale() : 'en')
    const snap = controller.getSnapshot()
    const { state, busy, errorText, statusKey } = snap
    const self = state.self || {}
    const activeInvite = state.activeInvite
    const peers = state.peers || []

    const copyText = (key, value) => {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(value)
      }
      setCopiedField(key)
      if (typeof setTimeout === 'function') {
        setTimeout(() => setCopiedField(''), 1800)
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

    const handlePairSubmit = async () => {
      const code = pairInput.trim()
      if (!code) return
      const res = await controller.claimPairCode(code)
      if (res) setPairInput('')
    }

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
          H('span', { className: 'sm-invite-label' }, t('endpointLabel')),
          H('code', { className: 'sm-invite-code', title: self.endpointUrl }, self.endpointUrl || ''),
          H(
            'button',
            {
              type: 'button',
              className: 'sm-btn',
              onClick: () => copyText('endpoint', self.endpointUrl || ''),
            },
            copiedField === 'endpoint' ? t('copiedBtn') : t('copyBtn'),
          ),
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
        H('code', { className: 'sm-code-inline' }, t('cliHint')),
      ),

      // 2. 1-on-1 Pairing Card
      H(
        'div',
        { className: 'sm-card' },
        H(
          'div',
          { className: 'sm-card-title' },
          H('span', null, t('pairSectionTitle')),
          H(
            'button',
            {
              type: 'button',
              className: 'sm-btn',
              disabled: busy,
              onClick: () => void controller.generatePairCode(),
            },
            activeInvite ? t('regenerateCodeBtn') : t('generateCodeBtn'),
          ),
        ),
        H('p', { className: 'sm-subtitle', style: { marginTop: 0 } }, t('pairSectionDesc')),
        activeInvite
          ? H(
              'div',
              { className: 'sm-invite-box' },
              H(
                'div',
                { className: 'sm-invite-item' },
                H('span', { className: 'sm-invite-label' }, t('shortCodeLabel')),
                H('code', { className: 'sm-invite-code', title: activeInvite.shortCode }, activeInvite.shortCode),
                H(
                  'button',
                  {
                    type: 'button',
                    className: 'sm-btn',
                    onClick: () => copyText('short', activeInvite.shortCode),
                  },
                  copiedField === 'short' ? t('copiedBtn') : t('copyBtn'),
                ),
              ),
              H(
                'div',
                { className: 'sm-invite-item' },
                H('span', { className: 'sm-invite-label' }, t('fullUriLabel')),
                H('code', { className: 'sm-invite-code', title: activeInvite.inviteUri }, activeInvite.inviteUri),
                H(
                  'button',
                  {
                    type: 'button',
                    className: 'sm-btn',
                    onClick: () => copyText('uri', activeInvite.inviteUri),
                  },
                  copiedField === 'uri' ? t('copiedBtn') : t('copyBtn'),
                ),
              ),
            )
          : null,
        H(
          'div',
          { className: 'sm-row' },
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
            t('pairSubmitBtn'),
          ),
        ),
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
                  { key: peer.slug, className: 'sm-peer-row' },
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
                      H('span', { className: 'sm-badge' }, peer.status || 'online'),
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
                    'button',
                    {
                      type: 'button',
                      className: 'sm-btn',
                      disabled: busy,
                      onClick: () => void controller.removePeer(peer.slug),
                    },
                    t('unpairBtn'),
                  ),
                ),
              ),
            ),
      ),
    )
  }
}

export const createMeshPage = createMeshSettingsPage
