import { createTranslator } from './locale.js'
import {
  AgentIcon,
  CheckIcon,
  ChevronIcon,
  ClipIcon,
  FileDocIcon,
  MeshNavIcon,
  ModeratorCrownIcon,
  RoundtableIcon,
} from './icons.js'
import {
  renderMarkdownMessage,
  stripMarkdownForPreview,
} from './markdown.js'

function parseToolArgsSafe(block) {
  if (!block || typeof block !== 'object') return {}
  const direct = block.call?.args ?? block.args
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
    return direct
  }
  const raw = block.call?.argsRaw ?? block.argsRaw ?? ''
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    } catch {}
  }
  return {}
}

function extractToolOutputText(block) {
  if (!block || typeof block !== 'object' || !Array.isArray(block.content)) return ''
  const parts = []
  for (const item of block.content) {
    if (item && item.type === 'text' && typeof item.text === 'string' && item.text.trim()) {
      parts.push(item.text.trim())
    }
  }
  return parts.join('\n')
}

function parsePeerReplyOutput(rawOutput) {
  const text = String(rawOutput || '').trim()
  if (!text) return { header: '', body: '', files: [], isFailed: false }
  const m = text.match(/^\[Remote (?:Agent|Group Moderator)\s+@([a-z0-9_-]+)[^\]]*\]:\s*\n?([\s\S]*)$/i)
  let body = m ? m[2].trim() : text
  const files = []
  const fileMatch = body.match(/\nShared files saved at:\s*(.+)$/i)
  if (fileMatch) {
    body = body.slice(0, fileMatch.index).trim()
    for (const f of fileMatch[1].split(',')) {
      const clean = f.trim()
      if (clean) files.push(clean)
    }
  }
  return {
    repliedBy: m ? m[1] : '',
    body,
    files,
    isFailed: /^Mesh peer request failed|^Group discussion failed/i.test(text),
  }
}

function parsePeersListOutput(rawOutput) {
  const text = String(rawOutput || '').trim()
  if (!text) return null
  // Backwards compatible with historical JSON output stored in older sessions
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text)
      if (parsed && typeof parsed === 'object') {
        return {
          self: parsed.self || null,
          peers: Array.isArray(parsed.peers) ? parsed.peers : [],
          groups: Array.isArray(parsed.groups) ? parsed.groups : [],
        }
      }
    } catch {}
  }
  return null
}

function parseRoomDisplayName(roomId, controller) {
  const clean = String(roomId || '').trim()
  if (!clean) return ''
  const snap = controller?.getSnapshot?.()
  const room = (snap?.state?.rooms || []).find((r) => r.id === clean)
  if (room?.name) return room.name
  if (clean.startsWith('pair:')) {
    const selfSlug = snap?.state?.self?.slug || ''
    const slugs = clean.split(':').slice(1)
    const other = slugs.find((s) => s !== selfSlug) || slugs[0] || clean
    return `@${other}`
  }
  return clean
}

function baseFileName(rawPath) {
  const s = String(rawPath || '').trim()
  if (!s) return ''
  const parts = s.split(/[\\/]/)
  return parts[parts.length - 1] || s
}

export function parseIncomingWakePrompt(rawText) {
  const text = String(rawText || '')
  if (!text.startsWith('[SANDBOX MESH INCOMING ')) return null

  const roomMatch = text.match(/Room:\s*"([^"]+)"\s*\(roomId:\s*"([^"]+)",\s*type:\s*(pair|group)\)/i)
  const senderMatch = text.match(/Sender:\s*([^\n(]+?)\s*\(@([a-z0-9_-]+)/i)
  const msgTagMatch = text.match(/<remote-mesh-message>\s*\n?([\s\S]*?)\n?\s*<\/remote-mesh-message>/i)
  const legacyMsgMatch = !msgTagMatch ? text.match(/Message:\s*\n([\s\S]*?)(?:\n\nInstructions:|\nInstructions:|$)/i) : null

  const body = (msgTagMatch?.[1] || legacyMsgMatch?.[1] || '').trim()
  return {
    roomName: roomMatch?.[1] || '',
    roomId: roomMatch?.[2] || '',
    roomType: roomMatch?.[3] || 'pair',
    senderName: (senderMatch?.[1] || '').trim(),
    senderSlug: senderMatch?.[2] || '',
    body,
    raw: text,
  }
}

/**
 * Native DSH `tool.call.toolview` renderer for all 5 `mesh_*` Harness tools.
 * Replaces raw JSON tool rows in the main DSH conversation with clean Sandbox Mesh collaboration cards.
 */
export function createMeshToolView({ React, getLocale, subscribeLocale, controller }) {
  const H = React.createElement
  const { useState, useEffect } = React

  return function MeshToolCallCard(props) {
    const [, setTick] = useState(0)
    const [localOpen, setLocalOpen] = useState(false)
    const disclosure = typeof props.useDisclosure === 'function' ? props.useDisclosure() : null
    const expanded = disclosure ? Boolean(disclosure.expanded) : localOpen
    const toggleExpand = disclosure ? disclosure.toggle : () => setLocalOpen((v) => !v)

    useEffect(() => {
      if (typeof subscribeLocale !== 'function') return undefined
      return subscribeLocale(() => setTick((n) => n + 1))
    }, [])

    const t = createTranslator(typeof getLocale === 'function' ? getLocale() : 'en')
    const toolName = String(props.toolName || '')
    const block = props.block || {}
    const isDone = props.phase === 'result' || ('kind' in block)
    const isRunning = !isDone
    const args = parseToolArgsSafe(block)
    const rawOutput = isDone ? extractToolOutputText(block) : ''
    const isError = Boolean(isDone && (block.isError || block.error || parsePeerReplyOutput(rawOutput).isFailed))

    let iconEl = MeshNavIcon({ React, size: 14 })
    let titleText = t('toolAskPeerTitle')
    let targetPill = ''
    let summaryPreview = ''
    let statusLabel = isRunning ? t('toolStateRunning') : isError ? t('toolStateError') : t('toolStateDone')

    const parsedReply = parsePeerReplyOutput(rawOutput)
    const parsedPeers = toolName === 'mesh_list_peers' ? parsePeersListOutput(rawOutput) : null

    if (toolName === 'mesh_ask_peer') {
      iconEl = AgentIcon({ React, size: 14 })
      titleText = t('toolAskPeerTitle')
      targetPill = args.targetSlug ? `@${String(args.targetSlug).replace(/^@/, '')}` : ''
      summaryPreview = stripMarkdownForPreview(args.question || '', 84)
      if (isDone && !isError) statusLabel = t('toolStateReplied')
    } else if (toolName === 'mesh_discuss_group') {
      iconEl = RoundtableIcon({ React, size: 14 })
      titleText = t('toolDiscussGroupTitle')
      const outGroupMatch = rawOutput.match(/^(?:Created task group|Reused group|Group)\s+"([^"]+)"\s+ready/i)
      targetPill = args.groupName || outGroupMatch?.[1] || parseRoomDisplayName(args.roomId, controller) || ''
      summaryPreview = stripMarkdownForPreview(args.topic || '', 84)
    } else if (toolName === 'mesh_list_peers') {
      iconEl = MeshNavIcon({ React, size: 14 })
      titleText = t('toolListPeersTitle')
      if (parsedPeers) {
        summaryPreview = parsedPeers.peers.length > 0
          ? `${parsedPeers.peers.length} ${t('toolConnectedNodes')}`
          : t('toolNoNodes')
      } else if (rawOutput) {
        const countMatch = rawOutput.match(/Connected Sandboxes \((\d+)\)/i)
        summaryPreview = countMatch ? `${countMatch[1]} ${t('toolConnectedNodes')}` : stripMarkdownForPreview(rawOutput, 72)
      }
    } else if (toolName === 'mesh_send_message') {
      iconEl = AgentIcon({ React, size: 14 })
      titleText = t('toolSendMsgTitle')
      targetPill = parseRoomDisplayName(args.roomId, controller)
      summaryPreview = stripMarkdownForPreview(args.text || '', 84)
    } else if (toolName === 'mesh_share_file') {
      iconEl = ClipIcon({ React, size: 14 })
      titleText = t('toolShareFileTitle')
      const fname = baseFileName(args.filePath)
      const dest = parseRoomDisplayName(args.roomId, controller)
      targetPill = fname && dest ? `${fname} → ${dest}` : (fname || dest)
      summaryPreview = stripMarkdownForPreview(args.caption || '', 72)
    }

    const hasDetails = Boolean(
      args.question || args.topic || args.text || args.filePath || rawOutput,
    )

    const statusClass = isRunning ? 'running' : isError ? 'error' : 'ok'

    return H(
      'div',
      { className: `sm-tool-card ${statusClass}` },
      H(
        'button',
        {
          type: 'button',
          className: 'sm-tool-head',
          disabled: !hasDetails,
          onClick: () => { if (hasDetails) toggleExpand() },
        },
        H(
          'span',
          { className: 'sm-tool-head-left' },
          hasDetails ? ChevronIcon({ React, size: 11, rotated: expanded }) : null,
          H('span', { className: 'sm-tool-icon' }, iconEl),
          H('span', { className: 'sm-tool-title' }, titleText),
          targetPill ? H('span', { className: 'sm-tool-target' }, targetPill) : null,
          summaryPreview ? H('span', { className: 'sm-tool-preview' }, summaryPreview) : null,
        ),
        H(
          'span',
          { className: `sm-tool-status ${statusClass}` },
          isRunning
            ? H('span', { className: 'sm-dot-live' })
            : !isError
              ? CheckIcon({ React, size: 11 })
              : null,
          statusLabel,
        ),
      ),
      expanded && hasDetails
        ? H(
            'div',
            { className: 'sm-tool-body' },
            toolName === 'mesh_ask_peer'
              ? H(
                  React.Fragment || 'div',
                  null,
                  args.question
                    ? H(
                        'div',
                        { className: 'sm-tool-section' },
                        H('div', { className: 'sm-tool-section-label' }, t('toolRequestLabel')),
                        renderMarkdownMessage(H, args.question, { keyPrefix: `t-req-${props.callId || '0'}`, t }),
                      )
                    : null,
                  isDone && rawOutput
                    ? H(
                        'div',
                        { className: 'sm-tool-section' },
                        H(
                          'div',
                          { className: 'sm-tool-section-label' },
                          `${t('toolReplyLabel')}${parsedReply.repliedBy ? ` · @${parsedReply.repliedBy}` : ''}`,
                        ),
                        renderMarkdownMessage(H, parsedReply.body || rawOutput, { keyPrefix: `t-rep-${props.callId || '0'}`, t }),
                        parsedReply.files.length > 0
                          ? H(
                              'div',
                              { className: 'sm-tool-files' },
                              H('span', { className: 'sm-tool-section-label' }, t('toolSharedFilesLabel')),
                              ...parsedReply.files.map((fp) =>
                                H(
                                  'span',
                                  { key: fp, className: 'sm-inline-file', title: fp },
                                  FileDocIcon({ React, size: 11 }),
                                  baseFileName(fp),
                                ),
                              ),
                            )
                          : null,
                      )
                    : null,
                )
              : toolName === 'mesh_list_peers' && parsedPeers
                ? H(
                    'div',
                    { className: 'sm-tool-roster' },
                    parsedPeers.peers.length === 0
                      ? H('div', { style: { fontSize: '12px', opacity: 0.72 } }, t('toolNoNodes'))
                      : H(
                          'div',
                          { className: 'sm-peer-checks' },
                          ...parsedPeers.peers.map((p) =>
                            H(
                              'span',
                              { key: p.slug, className: 'sm-member-tag', style: { cursor: 'default' } },
                              AgentIcon({ React, size: 11 }),
                              `@${p.slug}${p.role ? ` · ${p.role}` : ''}`,
                            ),
                          ),
                        ),
                    parsedPeers.groups.length > 0
                      ? H(
                          'div',
                          { className: 'sm-peer-checks', style: { marginTop: '6px' } },
                          ...parsedPeers.groups.map((g) =>
                            H(
                              'span',
                              { key: g.roomId, className: 'sm-member-tag moderator', style: { cursor: 'default' } },
                              ModeratorCrownIcon({ React, size: 11 }),
                              `${g.name} (${t('toolModeratorLabel')}: @${g.moderatorSlug})`,
                            ),
                          ),
                        )
                      : null,
                  )
                : toolName === 'mesh_share_file'
                  ? H(
                      'div',
                      { className: 'sm-tool-section' },
                      H(
                        'div',
                        { className: 'sm-row', style: { flexWrap: 'wrap' } },
                        H('span', { className: 'sm-inline-file' }, FileDocIcon({ React, size: 12 }), baseFileName(args.filePath)),
                        targetPill ? H('span', { style: { fontSize: '12px', opacity: 0.75 } }, targetPill) : null,
                      ),
                      args.caption ? renderMarkdownMessage(H, args.caption, { keyPrefix: `t-file-${props.callId || '0'}`, t }) : null,
                      isError && rawOutput ? H('div', { className: 'sm-alert', style: { marginTop: '6px' } }, rawOutput) : null,
                    )
                  : H(
                      'div',
                      { className: 'sm-tool-section' },
                      (args.topic || args.text)
                        ? renderMarkdownMessage(H, args.topic || args.text, { keyPrefix: `t-arg-${props.callId || '0'}`, t })
                        : null,
                      isDone && rawOutput
                        ? renderMarkdownMessage(H, parsedReply.body || rawOutput, { keyPrefix: `t-out-${props.callId || '0'}`, t })
                        : null,
                    ),
          )
        : null,
    )
  }
}

/**
 * Clean collapsible card for `[SANDBOX MESH INCOMING REQUEST]` messages when a user opens
 * a Mesh Agent session inside the DSH sidebar, hiding XML wrapper tags & prompt boilerplate.
 */
export function createMeshWakePromptView({ React, getLocale }) {
  const H = React.createElement
  const { useState } = React

  return function MeshWakePromptCard({ node, raw }) {
    const [showRaw, setShowRaw] = useState(false)
    const t = createTranslator(typeof getLocale === 'function' ? getLocale() : 'en')
    const meta = node?.data || parseIncomingWakePrompt(raw) || {}
    const senderText = meta.senderSlug
      ? (meta.senderName && meta.senderName !== meta.senderSlug ? `${meta.senderName} (@${meta.senderSlug})` : `@${meta.senderSlug}`)
      : ''

    return H(
      'div',
      { className: 'sm-wake-card' },
      H(
        'div',
        { className: 'sm-wake-head' },
        H(
          'span',
          { className: 'sm-row', style: { gap: '6px', flexWrap: 'wrap' } },
          MeshNavIcon({ React, size: 13 }),
          H('strong', null, t('wakeCardTitle')),
          senderText ? H('span', { className: 'sm-badge' }, `${t('wakeCardFrom')}: ${senderText}`) : null,
          meta.roomName ? H('span', { className: 'sm-badge sm-badge-moderator' }, `${t('wakeCardRoom')}: ${meta.roomName}`) : null,
        ),
        H(
          'button',
          {
            type: 'button',
            className: 'sm-btn-ghost',
            style: { fontSize: '11px' },
            onClick: () => setShowRaw((v) => !v),
          },
          showRaw ? t('wakeCardHideRaw') : t('wakeCardShowRaw'),
        ),
      ),
      showRaw
        ? H('pre', { className: 'sm-wake-raw' }, raw || meta.raw || '')
        : H(
            'div',
            { className: 'sm-wake-body' },
            renderMarkdownMessage(H, meta.body || raw || '', { keyPrefix: 'wake', t }),
          ),
    )
  }
}
