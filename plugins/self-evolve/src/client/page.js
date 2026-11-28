import { createTranslator } from './locale.js'
import { EvolveNavIcon } from './icons.js'

export function createSelfEvolvePage({ React, controller, getLocale, subscribeLocale }) {
  const h = React.createElement

  return function SelfEvolvePage() {
    const [snap, setSnap] = React.useState(() => controller.getSnapshot())
    const [localeTick, setLocaleTick] = React.useState(0)
    const [showSkillForm, setShowSkillForm] = React.useState(false)
    const [showLessonForm, setShowLessonForm] = React.useState(false)
    const [slug, setSlug] = React.useState('')
    const [reason, setReason] = React.useState('')
    const [verifyCmd, setVerifyCmd] = React.useState('')
    const [skillMd, setSkillMd] = React.useState('')
    const [lessonTitle, setLessonTitle] = React.useState('')
    const [lessonSummary, setLessonSummary] = React.useState('')

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
    const stats = state.stats || {}

    async function handleSaveSkill(e) {
      e.preventDefault()
      if (!slug.trim() || !skillMd.trim()) return
      const res = await controller.saveSkill({
        slug: slug.trim().toLowerCase(),
        reason: reason.trim(),
        verifyCommand: verifyCmd.trim(),
        skillMd,
      })
      if (res.ok) {
        setSlug('')
        setReason('')
        setVerifyCmd('')
        setSkillMd('')
        setShowSkillForm(false)
      }
    }

    async function handleSaveLesson(e) {
      e.preventDefault()
      if (!lessonTitle.trim()) return
      const res = await controller.recordLesson({
        title: lessonTitle.trim(),
        summary: lessonSummary.trim(),
        category: 'lesson',
      })
      if (res.ok) {
        setLessonTitle('')
        setLessonSummary('')
        setShowLessonForm(false)
      }
    }

    return h(
      'div',
      { className: 'se-page' },
      h(
        'div',
        { className: 'se-scroll' },
        h(
          'div',
          { className: 'se-container' },

          h(
            'div',
            { className: 'se-header' },
            h(
              'div',
              { className: 'se-title-wrap' },
              h('div', { className: 'se-title-badge' }, h(EvolveNavIcon, { React, size: 20 })),
              h(
                'div',
                null,
                h('h1', { className: 'se-title' }, t('title')),
                h('p', { className: 'se-subtitle' }, t('subtitle')),
              ),
            ),
            h(
              'div',
              { className: 'se-actions' },
              h('button', { type: 'button', className: 'se-btn', disabled: loading, onClick: () => void controller.syncFromHost() }, loading ? t('refreshing') : t('refresh')),
              h('button', { type: 'button', className: 'se-btn', onClick: () => setShowLessonForm((v) => !v) }, showLessonForm ? t('cancel') : t('addLessonBtn')),
              h('button', { type: 'button', className: 'se-btn se-btn-primary', onClick: () => setShowSkillForm((v) => !v) }, showSkillForm ? t('cancel') : t('newSkillBtn')),
            ),
          ),

          h(
            'div',
            { className: 'se-stats' },
            h('div', { className: 'se-stat' }, h('div', { className: 'se-stat-label' }, t('statSkills')), h('div', { className: 'se-stat-val' }, String(stats.skills_count || 0))),
            h('div', { className: 'se-stat' }, h('div', { className: 'se-stat-label' }, t('statTotal')), h('div', { className: 'se-stat-val' }, String(stats.evolutions_count || 0))),
            h('div', { className: 'se-stat' }, h('div', { className: 'se-stat-label' }, t('statVerified')), h('div', { className: 'se-stat-val' }, String(stats.verified_count || 0))),
            h('div', { className: 'se-stat' }, h('div', { className: 'se-stat-label' }, t('statRollbacks')), h('div', { className: 'se-stat-val' }, String(stats.rolled_back_count || 0))),
          ),

          showSkillForm
            ? h(
                'form',
                { className: 'se-card', onSubmit: handleSaveSkill },
                h(
                  'div',
                  { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '10px' } },
                  h('input', { className: 'se-input', placeholder: t('slugPlaceholder'), value: slug, onChange: (e) => setSlug(e.target.value), required: true }),
                  h('input', { className: 'se-input', placeholder: t('reasonPlaceholder'), value: reason, onChange: (e) => setReason(e.target.value) }),
                ),
                h('input', { className: 'se-input', placeholder: t('verifyPlaceholder'), value: verifyCmd, onChange: (e) => setVerifyCmd(e.target.value) }),
                h('textarea', { className: 'se-textarea', placeholder: t('skillMdPlaceholder'), value: skillMd, onChange: (e) => setSkillMd(e.target.value), required: true }),
                h('div', { className: 'se-actions' }, h('button', { type: 'submit', className: 'se-btn se-btn-primary', disabled: busy }, t('saveSkill'))),
              )
            : null,

          showLessonForm
            ? h(
                'form',
                { className: 'se-card', onSubmit: handleSaveLesson },
                h('input', { className: 'se-input', placeholder: t('lessonTitlePlaceholder'), value: lessonTitle, onChange: (e) => setLessonTitle(e.target.value), required: true }),
                h('input', { className: 'se-input', placeholder: t('lessonSummaryPlaceholder'), value: lessonSummary, onChange: (e) => setLessonSummary(e.target.value) }),
                h('div', { className: 'se-actions' }, h('button', { type: 'submit', className: 'se-btn se-btn-primary', disabled: busy }, t('saveLesson'))),
              )
            : null,

          h(
            'div',
            { className: 'se-card' },
            h('div', { className: 'se-card-head' }, h('span', { className: 'se-card-title' }, `${t('skillsTitle')} (${state.skills.length})`)),
            state.skills.length === 0
              ? h('p', { className: 'se-muted' }, t('skillsEmpty'))
              : h(
                  'div',
                  { className: 'se-list' },
                  state.skills.map((sk) =>
                    h(
                      'div',
                      { key: sk.slug, className: 'se-item' },
                      h(
                        'div',
                        { className: 'se-row' },
                        h(
                          'div',
                          { className: 'se-actions' },
                          h('strong', null, sk.name || sk.slug),
                          h('span', { className: 'se-mono' }, sk.slug),
                          h('span', { className: 'se-badge' }, t('filesCount', { count: (sk.files || []).length })),
                        ),
                        h(
                          'button',
                          { type: 'button', className: 'se-btn se-btn-sm se-btn-danger', disabled: busy, onClick: () => void controller.deleteSkill({ slug: sk.slug }) },
                          t('deleteSkill'),
                        ),
                      ),
                      sk.description ? h('p', { className: 'se-muted' }, sk.description) : null,
                      h('div', { className: 'se-mono' }, sk.path),
                    ),
                  ),
                ),
          ),

          h(
            'div',
            { className: 'se-card' },
            h('div', { className: 'se-card-head' }, h('span', { className: 'se-card-title' }, `${t('journalTitle')} (${state.entries.length})`)),
            state.entries.length === 0
              ? h('p', { className: 'se-muted' }, t('journalEmpty'))
              : h(
                  'div',
                  { className: 'se-list' },
                  state.entries.map((entry) => {
                    const cls = entry.status === 'verified'
                      ? 'se-badge-ok'
                      : entry.status === 'failed_rolled_back'
                        ? 'se-badge-err'
                        : 'se-badge-warn'
                    return h(
                      'div',
                      { key: entry.id, className: 'se-item' },
                      h(
                        'div',
                        { className: 'se-row' },
                        h(
                          'div',
                          { className: 'se-actions' },
                          h('span', { className: 'se-mono' }, entry.id),
                          h('strong', null, entry.title),
                          h('span', { className: `se-badge ${cls}` }, entry.status),
                          h('span', { className: 'se-muted', style: { fontSize: '12px' } }, entry.created_at),
                        ),
                        entry.can_rollback
                          ? h('button', { type: 'button', className: 'se-btn se-btn-sm', disabled: busy, onClick: () => void controller.rollbackEvolution(entry.id) }, t('rollback'))
                          : null,
                      ),
                      entry.summary ? h('p', { className: 'se-muted' }, entry.summary) : null,
                      entry.verify_command ? h('div', { className: 'se-mono' }, `verify: ${entry.verify_command}`) : null,
                    )
                  }),
                ),
          ),
        ),
      ),
      toast ? h('div', { className: `se-toast ${toast.kind}` }, toast.key === 'toastError' ? t('toastError', { detail: toast.detail }) : t(toast.key)) : null,
    )
  }
}
