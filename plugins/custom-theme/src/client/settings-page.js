import {
  BRAND_SVG_PRESETS,
  CORE_TOKEN_DEFS,
  THEME_PRESETS,
  clonePresetTokens,
  isValidCssVarName,
  normalizeThemeState,
  sanitizeBrandSvg,
  sanitizeCssValue,
} from '../shared/presets.js'
import { createTranslator } from './locale.js'

const HEX6_RE = /^#[0-9a-fA-F]{6}$/

function toColorPickerHex(cssValue, fallbackHex) {
  if (typeof cssValue === 'string' && HEX6_RE.test(cssValue.trim())) {
    return cssValue.trim()
  }
  return fallbackHex
}

export function PaletteNavIcon({ React, size = 16 }) {
  const H = React.createElement
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
    H('path', {
      d: 'M12 2.75C6.89 2.75 2.75 6.66 2.75 11.48C2.75 16.3 6.53 20.25 11.15 20.25H12.3C13.5 20.25 14.45 19.3 14.45 18.12C14.45 17.58 14.23 17.08 13.88 16.7C13.54 16.33 13.34 15.84 13.34 15.3C13.34 14.2 14.23 13.3 15.33 13.3H17.55C19.6 13.3 21.25 11.65 21.25 9.6C21.25 5.82 17.11 2.75 12 2.75Z',
    }),
    H('circle', { cx: 7.5, cy: 10.5, r: 1, fill: 'currentColor' }),
    H('circle', { cx: 11.2, cy: 7.3, r: 1, fill: 'currentColor' }),
    H('circle', { cx: 15.6, cy: 8.8, r: 1, fill: 'currentColor' }),
  )
}

function ToastNotice({ React, toast, closeLabel, onClose }) {
  if (!toast) return null
  const H = React.createElement
  const isError = toast.kind === 'error'
  return H(
    'div',
    { className: 'ct-toast-wrap' },
    H(
      'div',
      {
        className: 'ct-toast',
        role: isError ? 'alert' : 'status',
        'aria-live': isError ? 'assertive' : 'polite',
        'data-kind': toast.kind,
      },
      H(
        'svg',
        {
          className: 'ct-toast-icon',
          xmlns: 'http://www.w3.org/2000/svg',
          viewBox: '0 0 20 20',
          width: 18,
          height: 18,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
        isError
          ? H(React.Fragment, null,
            H('circle', { cx: 10, cy: 10, r: 7.5 }),
            H('path', { d: 'M10 6.5v4.2' }),
            H('circle', { cx: 10, cy: 13.5, r: 0.7, fill: 'currentColor', stroke: 'none' }),
          )
          : H(React.Fragment, null,
            H('circle', { cx: 10, cy: 10, r: 7.5 }),
            H('path', { d: 'M6.8 10.3l2.2 2.2 4.3-4.6' }),
          ),
      ),
      H(
        'div',
        { className: 'ct-toast-body' },
        H('div', { className: 'ct-toast-title' }, toast.title),
        toast.detail ? H('div', { className: 'ct-toast-detail' }, toast.detail) : null,
      ),
      H(
        'button',
        {
          type: 'button',
          className: 'ct-toast-close',
          'aria-label': closeLabel,
          onClick: onClose,
        },
        H(
          'svg',
          {
            xmlns: 'http://www.w3.org/2000/svg',
            viewBox: '0 0 16 16',
            width: 14,
            height: 14,
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.6,
            strokeLinecap: 'round',
            'aria-hidden': 'true',
          },
          H('path', { d: 'M4 4l8 8M12 4l-8 8' }),
        ),
      ),
    ),
  )
}

export function createThemeSettingsPage({
  React,
  controller,
  getLocale,
  subscribeLocale,
}) {
  const H = React.createElement

  return function CustomThemeSettingsPage() {
    const [, setTick] = React.useState(0)
    const [localeCode, setLocaleCode] = React.useState(() => getLocale?.())
    const [tokenDrafts, setTokenDrafts] = React.useState({})
    const [svgDraft, setSvgDraft] = React.useState(null)
    const [importError, setImportError] = React.useState('')

    const fileInputRef = React.useRef(null)

    React.useEffect(() => {
      const offStore = controller.subscribe(() => {
        setTick((n) => n + 1)
      })
      const offLocale = typeof subscribeLocale === 'function'
        ? subscribeLocale((next) => setLocaleCode(next || getLocale?.()))
        : () => {}
      return () => {
        offStore()
        offLocale()
      }
    }, [])

    const snapshot = controller.getSnapshot()
    const { state, colorPreference, statusKind, statusKey, statusSeq, errorText } = snapshot
    const t = createTranslator(localeCode)

    const [toast, setToast] = React.useState(null)
    const lastStatusSeqRef = React.useRef(statusSeq)

    React.useEffect(() => {
      if (!statusSeq || statusSeq === lastStatusSeqRef.current) return
      lastStatusSeqRef.current = statusSeq
      if (statusKind === 'error') {
        setToast({
          id: statusSeq,
          kind: 'error',
          title: t('statusErrorTitle'),
          detail: errorText || '',
        })
        return undefined
      }
      if (statusKind === 'saved') {
        const key = statusKey || 'statusSaved'
        const detailKey = key === 'statusReset'
          ? 'statusResetDetail'
          : key === 'statusImported'
            ? 'statusImportedDetail'
            : 'statusSavedDetail'
        setToast({
          id: statusSeq,
          kind: 'saved',
          title: t(key),
          detail: t(detailKey),
        })
        if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
          const timer = window.setTimeout(() => {
            setToast((curr) => (curr?.id === statusSeq ? null : curr))
          }, 2500)
          return () => window.clearTimeout(timer)
        }
      }
      return undefined
    }, [statusSeq, statusKind, statusKey, errorText, localeCode])

    const currentSvgText = svgDraft !== null ? svgDraft : (state.brand?.iconSvg || '')
    const svgInvalid = Boolean(currentSvgText.trim() && !sanitizeBrandSvg(currentSvgText))
    const sanitizedPreviewSvg = sanitizeBrandSvg(currentSvgText)

    const updateStateAndSave = (mutator, immediate = false) => {
      const next = mutator(structuredClone(state))
      if (immediate) {
        void controller.saveState(next)
      } else {
        controller.scheduleSave(next)
      }
    }

    const handleToggleEnabled = () => {
      updateStateAndSave((draft) => {
        draft.enabled = !draft.enabled
        return draft
      }, true)
    }

    const handleSelectPreset = (preset) => {
      setTokenDrafts({})
      setImportError('')
      updateStateAndSave((draft) => {
        draft.enabled = true
        draft.presetId = preset.id
        draft.tokens = clonePresetTokens(preset.id)
        return draft
      }, true)
    }

    const handleColorInput = (tokenName, mode, rawValue, { commit = false } = {}) => {
      const draftKey = `${tokenName}:${mode}`
      setTokenDrafts((prev) => ({ ...prev, [draftKey]: rawValue }))

      const validVal = sanitizeCssValue(rawValue)
      if (!validVal && !commit) return

      if (commit && !validVal) {
        // Revert invalid/blank input back to persisted value on blur.
        setTokenDrafts((prev) => {
          const next = { ...prev }
          delete next[draftKey]
          return next
        })
        return
      }

      if (!validVal) return

      updateStateAndSave((draft) => {
        draft.enabled = true
        draft.presetId = 'custom'
        if (!draft.tokens[tokenName]) {
          draft.tokens[tokenName] = { light: validVal, dark: validVal }
        }
        draft.tokens[tokenName][mode] = validVal
        return draft
      }, false)

      if (commit) {
        setTokenDrafts((prev) => {
          const next = { ...prev }
          delete next[draftKey]
          return next
        })
      }
    }

    const handleCustomVarChange = (index, field, value, commit = false) => {
      updateStateAndSave((draft) => {
        const list = Array.isArray(draft.customTokens) ? draft.customTokens : []
        if (!list[index]) return draft
        list[index][field] = value
        if (commit) {
          draft.customTokens = list.filter((row) => isValidCssVarName(row.name))
        }
        return draft
      }, false)
    }

    const handleAddCustomVar = () => {
      updateStateAndSave((draft) => {
        const existingNames = new Set([
          ...Object.keys(draft.tokens || {}),
          ...(draft.customTokens || []).map((r) => r.name),
        ])
        let idx = 1
        let candidate = '--dsw-custom-accent'
        while (existingNames.has(candidate)) {
          idx += 1
          candidate = `--dsw-custom-token-${idx}`
        }
        draft.enabled = true
        draft.customTokens = [
          ...(draft.customTokens || []),
          { name: candidate, light: '#2563eb', dark: '#60a5fa' },
        ]
        return draft
      }, true)
    }

    const handleRemoveCustomVar = (index) => {
      updateStateAndSave((draft) => {
        draft.customTokens = (draft.customTokens || []).filter((_, i) => i !== index)
        return draft
      }, true)
    }

    const handleExportJson = () => {
      if (typeof document === 'undefined') return
      const blob = new Blob([`${JSON.stringify(state, null, 2)}\n`], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `dsh-custom-theme-${state.presetId || 'custom'}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    }

    const handleImportFile = async (event) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) return
      try {
        const parsed = JSON.parse(await file.text())
        if (!parsed || typeof parsed !== 'object') {
          throw new Error(t('invalidImportError'))
        }
        const normalized = normalizeThemeState(parsed)
        setTokenDrafts({})
        setSvgDraft(null)
        setImportError('')
        await controller.saveState(normalized, { statusOverrideKey: 'statusImported' })
      } catch (err) {
        setImportError(err instanceof Error ? err.message : t('invalidImportError'))
      }
    }

    const groups = [
      { id: 'surface', title: t('groupSurface') },
      { id: 'accent', title: t('groupAccent') },
      { id: 'text', title: t('groupText') },
    ]

    return H(
      'div',
      { className: 'ct-page' },
      H(ToastNotice, {
        React,
        toast,
        closeLabel: t('closeNotice'),
        onClose: () => setToast(null),
      }),
      H(
        'div',
        { className: 'ct-header' },
        H(
          'div',
          { className: 'ct-header-text' },
          H('h2', { className: 'ct-title' }, t('title')),
          H('p', { className: 'ct-subtitle' }, t('subtitle')),
        ),
        H(
          'div',
          { className: 'ct-toolbar' },
          H(
            'button',
            {
              type: 'button',
              className: 'ct-btn',
              onClick: handleExportJson,
            },
            t('exportJson'),
          ),
          H(
            'button',
            {
              type: 'button',
              className: 'ct-btn',
              onClick: () => { fileInputRef.current?.click() },
            },
            t('importJson'),
          ),
          H('input', {
            ref: fileInputRef,
            type: 'file',
            accept: 'application/json,.json',
            style: { display: 'none' },
            onChange: handleImportFile,
          }),
          H(
            'button',
            {
              type: 'button',
              className: 'ct-btn',
              onClick: () => {
                setTokenDrafts({})
                setSvgDraft(null)
                void controller.resetState('default')
              },
            },
            t('resetDefault'),
          ),
          H(
            'button',
            {
              type: 'button',
              className: 'ct-btn',
              onClick: () => {
                setTokenDrafts({})
                setSvgDraft(null)
                void controller.resetState('official')
              },
            },
            t('restoreOfficial'),
          ),
        ),
      ),
      importError ? H('div', { className: 'ct-error-text' }, importError) : null,

      H(
        'div',
        { className: 'ct-switch-row' },
        H('span', { className: 'ct-switch-label' }, t('enableCustomTheme')),
        H(
          'button',
          {
            type: 'button',
            role: 'switch',
            className: 'ct-toggle',
            'aria-checked': state.enabled,
            'aria-label': t('enableCustomTheme'),
            onClick: handleToggleEnabled,
          },
          H('span', { className: 'ct-toggle-thumb' }),
        ),
      ),

      H(
        'section',
        { className: 'ct-section' },
        H('h3', { className: 'ct-section-title' }, t('colorModeTitle')),
        H(
          'div',
          { className: 'ct-mode-row' },
          ...[
            { id: 'system', label: t('modeSystem') },
            { id: 'light', label: t('modeLight') },
            { id: 'dark', label: t('modeDark') },
          ].map((item) =>
            H(
              'button',
              {
                key: item.id,
                type: 'button',
                className: 'ct-mode-card',
                'aria-pressed': colorPreference === item.id,
                onClick: () => controller.setColorPreference(item.id),
              },
              item.label,
            ),
          ),
        ),
      ),

      H(
        'section',
        { className: 'ct-section' },
        H('h3', { className: 'ct-section-title' }, t('presetsTitle')),
        H('p', { className: 'ct-section-desc' }, t('presetsDesc')),
        H(
          'div',
          { className: 'ct-preset-grid' },
          ...THEME_PRESETS.map((preset) =>
            H(
              'button',
              {
                key: preset.id,
                type: 'button',
                className: 'ct-preset-card',
                'aria-pressed': state.enabled && state.presetId === preset.id,
                onClick: () => handleSelectPreset(preset),
              },
              H(
                'div',
                { className: 'ct-preset-swatches', 'aria-hidden': 'true' },
                H(
                  'div',
                  {
                    className: 'ct-swatch-half',
                    style: { background: preset.preview.light.bg },
                  },
                  H('span', {
                    className: 'ct-swatch-bar',
                    style: { background: preset.preview.light.sidebar },
                  }),
                  H('span', {
                    className: 'ct-swatch-dot',
                    style: { background: preset.preview.light.accent },
                  }),
                ),
                H(
                  'div',
                  {
                    className: 'ct-swatch-half',
                    style: { background: preset.preview.dark.bg },
                  },
                  H('span', {
                    className: 'ct-swatch-bar',
                    style: { background: preset.preview.dark.sidebar },
                  }),
                  H('span', {
                    className: 'ct-swatch-dot',
                    style: { background: preset.preview.dark.accent },
                  }),
                ),
              ),
              H('span', { className: 'ct-preset-name' }, t(preset.nameKey)),
            ),
          ),
        ),
      ),

      H(
        'section',
        { className: 'ct-section' },
        H('h3', { className: 'ct-section-title' }, t('paletteTitle')),
        H('p', { className: 'ct-section-desc' }, t('paletteDesc')),
        ...groups.map((grp) => {
          const rows = CORE_TOKEN_DEFS.filter((def) => def.group === grp.id)
          return H(
            'div',
            { key: grp.id, className: 'ct-token-group' },
            H('div', { className: 'ct-token-group-head' }, grp.title),
            ...rows.map((def) => {
              const pair = state.tokens?.[def.name] || { light: '#ffffff', dark: '#0f172a' }
              const lightVal = tokenDrafts[`${def.name}:light`] ?? pair.light
              const darkVal = tokenDrafts[`${def.name}:dark`] ?? pair.dark

              return H(
                'div',
                { key: def.name, className: 'ct-token-row' },
                H(
                  'div',
                  { className: 'ct-token-meta' },
                  H('span', { className: 'ct-token-label' }, t(def.labelKey)),
                  H('span', { className: 'ct-token-var' }, def.name),
                ),
                H(
                  'div',
                  { className: 'ct-color-field' },
                  H('input', {
                    type: 'color',
                    className: 'ct-color-picker',
                    'aria-label': `${t(def.labelKey)} (${t('colLight')})`,
                    value: toColorPickerHex(pair.light, '#ffffff'),
                    onChange: (e) => handleColorInput(def.name, 'light', e.target.value, { commit: true }),
                  }),
                  H('input', {
                    type: 'text',
                    className: 'ct-input',
                    'aria-label': `${def.name} light`,
                    value: lightVal,
                    onChange: (e) => handleColorInput(def.name, 'light', e.target.value),
                    onBlur: (e) => handleColorInput(def.name, 'light', e.target.value, { commit: true }),
                  }),
                ),
                H(
                  'div',
                  { className: 'ct-color-field' },
                  H('input', {
                    type: 'color',
                    className: 'ct-color-picker',
                    'aria-label': `${t(def.labelKey)} (${t('colDark')})`,
                    value: toColorPickerHex(pair.dark, '#0f172a'),
                    onChange: (e) => handleColorInput(def.name, 'dark', e.target.value, { commit: true }),
                  }),
                  H('input', {
                    type: 'text',
                    className: 'ct-input',
                    'aria-label': `${def.name} dark`,
                    value: darkVal,
                    onChange: (e) => handleColorInput(def.name, 'dark', e.target.value),
                    onBlur: (e) => handleColorInput(def.name, 'dark', e.target.value, { commit: true }),
                  }),
                ),
              )
            }),
          )
        }),
      ),

      H(
        'section',
        { className: 'ct-section' },
        H(
          'div',
          { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' } },
          H(
            'div',
            null,
            H('h3', { className: 'ct-section-title' }, t('customVarsTitle')),
            H('p', { className: 'ct-section-desc' }, t('customVarsDesc')),
          ),
          H(
            'button',
            {
              type: 'button',
              className: 'ct-btn',
              onClick: handleAddCustomVar,
            },
            `+ ${t('addCustomVar')}`,
          ),
        ),
        (state.customTokens || []).length > 0
          ? H(
            'div',
            { className: 'ct-token-group' },
            ...(state.customTokens || []).map((row, index) =>
              H(
                'div',
                { key: `${row.name}:${index}`, className: 'ct-custom-row' },
                H('input', {
                  type: 'text',
                  className: 'ct-input',
                  placeholder: t('varNamePlaceholder'),
                  value: row.name,
                  onChange: (e) => handleCustomVarChange(index, 'name', e.target.value),
                  onBlur: (e) => handleCustomVarChange(index, 'name', e.target.value, true),
                }),
                H('input', {
                  type: 'text',
                  className: 'ct-input',
                  placeholder: t('lightValuePlaceholder'),
                  value: row.light,
                  onChange: (e) => handleCustomVarChange(index, 'light', e.target.value),
                }),
                H('input', {
                  type: 'text',
                  className: 'ct-input',
                  placeholder: t('darkValuePlaceholder'),
                  value: row.dark,
                  onChange: (e) => handleCustomVarChange(index, 'dark', e.target.value),
                }),
                H(
                  'button',
                  {
                    type: 'button',
                    className: 'ct-btn',
                    onClick: () => handleRemoveCustomVar(index),
                  },
                  t('removeVar'),
                ),
              ),
            ),
          )
          : null,
      ),

      H(
        'section',
        { className: 'ct-section' },
        H('h3', { className: 'ct-section-title' }, t('brandTitle')),
        H('p', { className: 'ct-section-desc' }, t('brandDesc')),
        H(
          'div',
          { className: 'ct-brand-box' },
          H(
            'div',
            { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' } },
            H('span', { className: 'ct-switch-label' }, t('brandEnable')),
            H(
              'button',
              {
                type: 'button',
                role: 'switch',
                className: 'ct-toggle',
                'aria-checked': Boolean(state.brand?.enabled),
                'aria-label': t('brandEnable'),
                onClick: () => updateStateAndSave((draft) => {
                  draft.enabled = true
                  draft.brand.enabled = !draft.brand.enabled
                  return draft
                }, true),
              },
              H('span', { className: 'ct-toggle-thumb' }),
            ),
          ),
          H(
            'label',
            { style: { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12.5px' } },
            H('span', null, t('brandNameLabel')),
            H('input', {
              type: 'text',
              className: 'ct-input ct-input-sans',
              maxLength: 48,
              placeholder: t('brandNamePlaceholder'),
              value: state.brand?.name || '',
              onChange: (e) => updateStateAndSave((draft) => {
                draft.brand.name = e.target.value
                return draft
              }, false),
            }),
          ),
          H(
            'div',
            { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' } },
            H('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' } }, t('brandQuickPresets')),
            ...BRAND_SVG_PRESETS.map((preset) =>
              H(
                'button',
                {
                  key: preset.id,
                  type: 'button',
                  className: 'ct-btn',
                  onClick: () => {
                    setSvgDraft(null)
                    updateStateAndSave((draft) => {
                      draft.brand.iconSvg = preset.svg
                      if (preset.svg) {
                        draft.enabled = true
                        draft.brand.enabled = true
                      }
                      return draft
                    }, true)
                  },
                },
                t(preset.labelKey),
              ),
            ),
          ),
          H(
            'label',
            { style: { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12.5px' } },
            H('span', null, t('brandSvgLabel')),
            H('textarea', {
              className: 'ct-textarea',
              placeholder: t('brandSvgPlaceholder'),
              value: currentSvgText,
              onChange: (e) => {
                const raw = e.target.value
                setSvgDraft(raw)
                const clean = raw.trim()
                if (!clean || sanitizeBrandSvg(clean)) {
                  updateStateAndSave((draft) => {
                    draft.brand.iconSvg = clean
                    return draft
                  }, false)
                }
              },
              onBlur: () => {
                if (svgDraft !== null && (!svgDraft.trim() || sanitizeBrandSvg(svgDraft))) {
                  setSvgDraft(null)
                }
              },
            }),
          ),
          svgInvalid ? H('div', { className: 'ct-error-text' }, t('invalidSvgError')) : null,
          (sanitizedPreviewSvg || state.brand?.name)
            ? H(
              'div',
              { className: 'ct-brand-preview' },
              sanitizedPreviewSvg
                ? H('img', {
                  src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sanitizedPreviewSvg)}`,
                  width: 24,
                  height: 24,
                  alt: '',
                })
                : null,
              state.brand?.name
                ? H('span', { className: 'ct-brand-name-slot' }, state.brand.name)
                : null,
            )
            : null,
        ),
      ),
    )
  }
}
