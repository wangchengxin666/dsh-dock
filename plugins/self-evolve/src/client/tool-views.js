import { createTranslator } from './locale.js'
import { EvolveNavIcon } from './icons.js'

function extractOutputText(block) {
  if (!block || typeof block !== 'object' || !Array.isArray(block.content)) return ''
  return block.content
    .filter((i) => i && i.type === 'text' && typeof i.text === 'string' && i.text.trim())
    .map((i) => i.text.trim())
    .join('\n')
}

export function createEvolveToolView({ React, getLocale, subscribeLocale }) {
  const h = React.createElement
  return function EvolveToolView(props) {
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
    const isError = Boolean(isDone && (block?.isError || /failed/i.test(outputText)))
    const titleKey = name === 'evolve_save_skill'
      ? 'toolSaveTitle'
      : name === 'evolve_rollback'
        ? 'toolRollbackTitle'
        : name === 'evolve_record_lesson'
          ? 'toolLessonTitle'
          : 'toolListTitle'

    return h(
      'div',
      { className: 'se-tool' },
      h(
        'button',
        { type: 'button', className: 'se-tool-trigger', onClick: outputText ? toggle : undefined, disabled: !outputText },
        h(EvolveNavIcon, { React, size: 14 }),
        h('strong', null, t(titleKey)),
        h('span', { className: `se-badge ${isError ? 'se-badge-err' : (isDone ? 'se-badge-ok' : '')}` },
          isDone ? (isError ? t('toolFailed') : t('toolDone')) : t('toolRunning')),
      ),
      expanded && outputText ? h('div', { className: 'se-tool-body' }, outputText) : null,
    )
  }
}
