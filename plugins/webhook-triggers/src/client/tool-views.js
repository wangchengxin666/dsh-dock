import { createTranslator } from './locale.js'
import { WebhookNavIcon } from './icons.js'

function extractOutputText(block) {
  if (!block || typeof block !== 'object' || !Array.isArray(block.content)) return ''
  return block.content
    .filter((i) => i && i.type === 'text' && typeof i.text === 'string' && i.text.trim())
    .map((i) => i.text.trim())
    .join('\n')
}

export function createWebhookToolView({ React, getLocale, subscribeLocale }) {
  const h = React.createElement
  return function WebhookToolView(props) {
    const [, setTick] = React.useState(0)
    const [open, setOpen] = React.useState(false)
    const disclosure = typeof props.useDisclosure === 'function' ? props.useDisclosure() : null
    const expanded = disclosure ? Boolean(disclosure.expanded) : open
    const toggle = disclosure ? disclosure.toggle : () => setOpen((v) => !v)

    React.useEffect(() => {
      if (typeof subscribeLocale !== 'function') return undefined
      return subscribeLocale(() => setTick((n) => n + 1))
    }, [])

    const t = createTranslator(typeof getLocale === 'function' ? getLocale() : 'en')
    const block = props.block || {}
    const name = String(props.toolName || block?.call?.name || block?.name || '').trim()
    const isDone = props.phase === 'result' || props.phase === 'done' || ('kind' in block)
    const outputText = isDone ? extractOutputText(block) : ''
    const isError = Boolean(isDone && (block?.isError || /^Failed /i.test(outputText)))
    const titleKey = name === 'webhook_create'
      ? 'toolCreateTitle'
      : name === 'webhook_recent_deliveries'
        ? 'toolDeliveriesTitle'
        : 'toolListTitle'

    return h(
      'div',
      { className: 'wh-tool' },
      h(
        'button',
        { type: 'button', className: 'wh-tool-trigger', onClick: outputText ? toggle : undefined, disabled: !outputText },
        h(WebhookNavIcon, { React, size: 14 }),
        h('strong', null, t(titleKey)),
        h('span', { className: `wh-badge ${isError ? 'wh-badge-err' : (isDone ? 'wh-badge-ok' : '')}` },
          isDone ? (isError ? t('toolFailed') : t('toolDone')) : t('toolRunning')),
      ),
      expanded && outputText ? h('div', { className: 'wh-tool-body' }, outputText) : null,
    )
  }
}
