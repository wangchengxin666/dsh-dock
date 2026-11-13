/**
 * File manager — the page component.
 *
 * A global main panel: the left sidebar's "Server files" row selects it, and it
 * owns the whole centre column. It does not depend on a workspace or Session,
 * so it renders and browses with no Session selected.
 *
 * Data comes from `ctx.remote.fileManager` (mounted by this plugin's own
 * client entry) and the three byte routes the Host half registers. React and
 * `react-dom` arrive through the module loader's `require`, so this component
 * imports nothing from other Harness client packages.
 */

import { css, STYLES } from './styles.js'

/**
 * Build the page component.
 * @param React - React from the shell's module table.
 * @param ReactDOM - react-dom from the shell's module table; its `createPortal`
 *   lifts dialogs to the document root, and is optional.
 * @returns the page component.
 */
export function createPageComponent({ React, ReactDOM }) {
  const h = React.createElement
  // Overlays live at the document root: the page sits inside the frame's
  // scrolled column, where a fixed layer would be clipped or stacked below the
  // shell. createPortal is optional so the component still renders without a DOM.
  const overlay = (node) => (ReactDOM?.createPortal && typeof document !== 'undefined'
    ? ReactDOM.createPortal(node, document.body)
    : node)
  const { useCallback, useEffect, useId, useMemo, useRef, useState } = React

  /**
   * Send one Remote call and unwrap its result.
   * @param call - a promise resolving to the Remote result envelope.
   * @returns the value, or a thrown `Error` carrying the Host's message.
   */
  const call = async (promise) => {
    const result = await promise
    if (result.ok) return result.value
    throw new Error(result.error?.message ?? String(result.error?.code ?? 'request failed'))
  }

  /**
   * Format a byte count for the size column.
   * @param bytes - size in bytes.
   * @returns a short human-readable size.
   */
  const formatSize = (bytes) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let value = bytes
    let unit = 0
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024
      unit += 1
    }
    return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
  }

  /**
   * Format one listing timestamp for the modified column.
   * @param value - epoch milliseconds, or 0 when the backend reported none.
   * @returns a short local date and time, or an empty string.
   */
  const formatTime = (value) => {
    if (typeof value !== 'number' || value <= 0) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    const pad = (part) => String(part).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  }

  /**
   * Trim a deep breadcrumb trail to its root, an ellipsis, and the last
   * segments, so the current directory always stays visible.
   * @param crumbs - the full trail, root first.
   * @returns the trail to render.
   */
  const visibleCrumbs = (crumbs) => {
    const LIMIT = 5
    if (crumbs.length <= LIMIT + 1) return crumbs
    const tail = crumbs.slice(crumbs.length - LIMIT)
    const hidden = crumbs.slice(1, crumbs.length - LIMIT)
    return [
      crumbs[0],
      { ellipsis: true, title: hidden.map(crumb => crumb.name).join(' / ') },
      ...tail,
    ]
  }

  /**
   * Split an absolute POSIX path into breadcrumb segments.
   * @param path - absolute directory path.
   * @returns every ancestor prefix, root first.
   */
  const crumbsOf = (path, rootLabel) => {
    const parts = path.split('/').filter(Boolean)
    const crumbs = [{ name: rootLabel, path: '/' }]
    let current = ''
    for (const part of parts) {
      current += `/${part}`
      crumbs.push({ name: part, path: current })
    }
    return crumbs
  }

  /**
   * Render one small inline glyph.
   * @param props - glyph name.
   * @returns the SVG element.
   */
  const glyph = (name) => {
    const paths = {
      folder: h('path', { d: 'M2.5 5.5h4l1.2 1.5h5.8v6.5a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5.5Z', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinejoin: 'round' }),
      file: h('path', { d: 'M4 2.5h5.5L12.5 5.5v8H4v-11Zm5.5 0v3h3', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinejoin: 'round' }),
      other: h('path', { d: 'M8 2.8l5 2.9v4.6l-5 2.9-5-2.9V5.7l5-2.9Z', fill: 'none', stroke: 'currentColor', strokeWidth: 1.2 }),
      up: h('path', { d: 'M8 12.5v-9m0 0L4.5 7M8 3.5 11.5 7', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      refresh: h('path', { d: 'M13 8a5 5 0 1 1-1.6-3.7M13 2.5V5h-2.5', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      close: h('path', { d: 'M4 4l8 8M12 4l-8 8', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
      eye: h('path', {
        d: 'M1.8 8S4.4 3.8 8 3.8 14.2 8 14.2 8 11.6 12.2 8 12.2 1.8 8 1.8 8Z',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinejoin: 'round',
      }),
    }
    return h('svg', { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': 'true', focusable: 'false' }, paths[name] ?? paths.file)
  }

  /**
   * One dialog that traps Escape and restores focus to its opener.
   * @param props - open state, title, and body.
   * @returns the dialog element or null.
   */
  const Modal = ({ title, onClose, children, wide }) => {
    const ref = useRef(null)
    const restore = useRef(null)
    const headingId = useId()
    useEffect(() => {
      restore.current = document.activeElement
      const first = ref.current?.querySelector('input, button')
      if (first instanceof HTMLElement) first.focus()
      return () => {
        const target = restore.current
        if (target instanceof HTMLElement && target.isConnected) target.focus()
      }
    }, [])
    useEffect(() => {
      const onKey = (event) => {
        if (event.key === 'Escape') { event.stopPropagation(); onClose(); return }
        if (event.key !== 'Tab') return
        // Keep keyboard focus inside the dialog: aria-modal alone does not.
        const focusable = ref.current?.querySelectorAll('button, input, [href], select, textarea, [tabindex]:not([tabindex="-1"])')
        if (focusable === undefined || focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
      document.addEventListener('keydown', onKey, true)
      return () => { document.removeEventListener('keydown', onKey, true) }
    }, [onClose])
    return h('div', { className: css.dialogBackdrop, role: 'presentation', onMouseDown: (event) => { if (event.target === event.currentTarget) onClose() } },
      h('div', { ref, className: wide ? css.preview : css.dialog, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': headingId },
        title === undefined ? null : h('h2', { id: headingId, className: css.dialogTitle }, title),
        children),
    )
  }

  /**
   * The file manager page.
   * @param props - main-slot props: Remote face, locale, and layout.
   * @returns the page.
   */
  function FileManagerPage(props) {
    const { t, fileManager } = props
    const [path, setPath] = useState(null)
    const [listing, setListing] = useState({ status: 'idle', value: null, error: null })
    const [draftPath, setDraftPath] = useState('')
    const [filter, setFilter] = useState('')
    const [selected, setSelected] = useState(() => new Set())
    const [busy, setBusy] = useState(false)
    const [notice, setNotice] = useState(null)
    const [dialog, setDialog] = useState(null)
    const [preview, setPreview] = useState(null)
    const [dragging, setDragging] = useState(false)
    const [reloads, setReloads] = useState(0)
    const [showHidden, setShowHidden] = useState(() => {
      try {
        return window.localStorage.getItem('dsh.file-manager.showHidden') === '1'
      } catch {
        return false
      }
    })
    const titleId = useId()
    const fileInput = useRef(null)
    const dragDepth = useRef(0)

    const api = useMemo(() => fileManager, [fileManager])

    const noticeTimer = useRef(null)
    const showNotice = useCallback((kind, text) => {
      setNotice({ kind, text })
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
      if (kind === 'info') return
      noticeTimer.current = window.setTimeout(() => {
        noticeTimer.current = null
        setNotice(null)
      }, 6000)
    }, [])
    useEffect(() => () => {
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
    }, [])

    // The page opens at the Host's start directory, once per mount.
    useEffect(() => {
      if (api === undefined) return undefined
      let cancelled = false
      void (async () => {
        try {
          const start = await call(api.startPath())
          if (!cancelled) setPath(start)
        } catch (error) {
          if (!cancelled) setListing({ status: 'error', value: null, error: String(error.message ?? error) })
        }
      })()
      return () => { cancelled = true }
    }, [api])

    // Every directory change and every reload re-reads the listing; the last
    // request wins, and a failure never navigates away from the typed path.
    useEffect(() => {
      if (path === null || api === undefined) return undefined
      let cancelled = false
      setListing((current) => ({ ...current, status: 'loading' }))
      setSelected(new Set())
      setFilter('')
      setDraftPath(path)
      void (async () => {
        try {
          const value = await call(api.list(path, showHidden))
          if (cancelled) return
          setListing({ status: 'ready', value, error: null })
          // The Host resolves symlinks and normalizes the path it reports.
          if (value.path !== path) setPath(value.path)
        } catch (error) {
          // Keep showing the directory this page is really in: the breadcrumbs
          // and path bar are read from `path`, so a failed navigation restores
          // the previous one instead of pairing new crumbs with old rows.
          if (cancelled) return
          setListing({ status: 'error', value: null, error: String(error.message ?? error) })
          showNotice('error', t('loadFailed'))
        }
      })()
      return () => { cancelled = true }
    }, [api, path, reloads, showHidden])

    /** Re-read the current directory without leaving it. */
    const reload = useCallback(() => { setReloads(count => count + 1) }, [])

    /** Flip the dot-entry preference and re-read the directory. */
    const toggleHidden = useCallback(() => {
      setShowHidden((current) => {
        const next = !current
        try {
          window.localStorage.setItem('dsh.file-manager.showHidden', next ? '1' : '0')
        } catch {
          // Private-mode storage failures keep the choice for this page only.
        }
        return next
      })
      setReloads(count => count + 1)
    }, [])

    const navigate = useCallback((next) => {
      if (typeof next !== 'string' || next.trim() === '') return
      setPath(next.trim())
    }, [])

    if (api === undefined) {
      return h('section', { className: css.page },
        h('style', null, STYLES),
        h('p', { className: css.status, role: 'alert' }, t('unavailable')),
      )
    }

    const entries = listing.value?.entries ?? []
    const visible = filter.trim() === ''
      ? entries
      : entries.filter(entry => entry.name.toLowerCase().includes(filter.trim().toLowerCase()))

    const allSelected = visible.length > 0 && visible.every(entry => selected.has(entry.path))
    const someSelected = selected.size > 0

    const toggle = useCallback((entryPath) => {
      setSelected((current) => {
        const next = new Set(current)
        if (next.has(entryPath)) next.delete(entryPath)
        else next.add(entryPath)
        return next
      })
    }, [])

    const toggleAll = useCallback(() => {
      setSelected((current) => {
        if (visible.length > 0 && visible.every(entry => current.has(entry.path))) return new Set()
        return new Set(visible.map(entry => entry.path))
      })
    }, [visible])

    /**
     * Start downloading one path through the Host route.
     * @param entryPath - absolute file path.
     */
    const download = useCallback((entryPath) => {
      const anchor = document.createElement('a')
      anchor.href = `api/file-manager.download?path=${encodeURIComponent(entryPath)}`
      anchor.download = entryPath.split('/').pop() ?? 'download'
      anchor.rel = 'noopener'
      anchor.click()
    }, [])

    /**
     * Download a selection as one archive. A single file downloads directly;
     * a directory, or several entries, arrives as one ZIP so the browser only
     * starts one download.
     * @param paths - absolute paths to include.
     */
    const downloadArchive = useCallback((paths) => {
      if (paths.length === 0) return
      const anchor = document.createElement('a')
      anchor.href = `api/file-manager.zip?${paths.map(path => `path=${encodeURIComponent(path)}`).join('&')}`
      anchor.download = paths.length === 1 ? `${paths[0].split('/').pop() || 'files'}.zip` : 'selection.zip'
      anchor.rel = 'noopener'
      anchor.click()
    }, [])

    /**
     * Download one row: files directly, directories as an archive.
     * @param entry - the row to download.
     */
    const downloadEntry = useCallback((entry) => {
      if (entry.type === 'directory') downloadArchive([entry.path])
      else download(entry.path)
    }, [download, downloadArchive])

    /**
     * Upload the chosen files into the current directory.
     * @param files - browser files to send.
     */
    const upload = useCallback(async (files, overwrite = false) => {
      const list = [...files]
      if (list.length === 0 || path === null) return
      setBusy(true)
      setNotice({ kind: 'info', text: t('uploading') })
      try {
        const body = new FormData()
        for (const file of list) body.append('files', file, file.name)
        const query = `dir=${encodeURIComponent(path)}${overwrite ? '&overwrite=1' : ''}`
        const response = await fetch(`api/file-manager.upload?${query}`, {
          method: 'POST',
          body,
          credentials: 'same-origin',
        })
        const payload = await response.json().catch(() => ({}))
        if (response.status === 409) {
          // Nothing was written: confirm the replacement before retrying.
          setDialog({ kind: 'overwrite', files: list, names: payload.conflicts ?? [] })
          return
        }
        if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`)
        showNotice('ok', t('uploadDone', { count: payload.files?.length ?? list.length }))
        reload()
      } catch (error) {
        showNotice('error', t('uploadFailed', { reason: String(error.message ?? error) }))
      } finally {
        setBusy(false)
      }
    }, [path, reload, showNotice, t])

    const openEntry = useCallback((entry) => {
      if (entry.type === 'directory') navigate(entry.path)
      else if (entry.type === 'file') setPreview({ path: entry.path, name: entry.name, state: { status: 'loading' } })
    }, [navigate])

    // Preview loads on demand, one request per opened file.
    useEffect(() => {
      if (api === undefined || preview === null || preview.state.status !== 'loading') return undefined
      let cancelled = false
      void call(api.preview(preview.path))
        .then((value) => {
          if (cancelled) return
          // Bytes never ride the Remote channel: image and PDF previews point
          // the browser at the streamed raw route instead.
          const url = value.kind === 'image' || value.kind === 'pdf'
            ? `api/file-manager.raw?path=${encodeURIComponent(preview.path)}`
            : undefined
          setPreview(current => current === null ? null : ({ ...current, state: { status: 'ready', value, url } }))
        })
        .catch((error) => {
          if (!cancelled) setPreview(current => current === null ? null : ({ ...current, state: { status: 'error', error: String(error.message ?? error) } }))
        })
      return () => { cancelled = true }
    }, [api, preview])

    /**
     * Run one mutating action and report its outcome.
     * @param run - the action.
     * @param done - the success message.
     */
    const act = useCallback(async (run, done) => {
      setBusy(true)
      try {
        await run()
        showNotice('ok', done)
        reload()
      } catch (error) {
        showNotice('error', t('actionFailed', { reason: String(error.message ?? error) }))
      } finally {
        setBusy(false)
      }
    }, [reload, showNotice, t])

    const submitNewFolder = useCallback((name) => {
      setDialog(null)
      void act(() => call(api.createDirectory(path, name)), t('createDone'))
    }, [act, api, path, t])

    const submitRename = useCallback((entry, name) => {
      setDialog(null)
      if (name === entry.name) return
      void act(() => call(api.rename(entry.path, name)), t('renameDone'))
    }, [act, api, t])

    const submitDelete = useCallback((paths) => {
      setDialog(null)
      void act(async () => {
        const results = await call(api.deleteEntries(paths))
        const failed = results.filter(entry => !entry.ok)
        if (failed.length > 0) {
          // Some entries stayed: say which, instead of claiming success.
          throw new Error(`${t('deletePartial', { failed: failed.length, done: results.length - failed.length })} ${failed.map(entry => entry.path).join(', ')}`)
        }
      }, t('deleteDone', { count: paths.length }))
    }, [act, api, t])

    // Escape closes the preview; the dialogs own their own Escape handling.
    useEffect(() => {
      if (preview === null) return undefined
      const onKey = (event) => { if (event.key === 'Escape') setPreview(null) }
      document.addEventListener('keydown', onKey)
      return () => { document.removeEventListener('keydown', onKey) }
    }, [preview])

    const onDragEnter = (event) => {
      if (!event.dataTransfer?.types?.includes('Files')) return
      dragDepth.current += 1
      setDragging(true)
    }
    const onDragLeave = () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragging(false)
    }
    const onDragOver = (event) => {
      if (event.dataTransfer?.types?.includes('Files')) event.preventDefault()
    }
    const onDrop = (event) => {
      if (!event.dataTransfer?.files?.length) return
      event.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      if (busy) {
        showNotice('info', t('uploading'))
        return
      }
      void upload(event.dataTransfer.files)
    }

    const crumbs = crumbsOf(path ?? '/', t('rootCrumb'))
    const roots = listing.value?.roots ?? []
    const activePath = listing.value?.path ?? path
    const tableLabel = path ?? '/'

    return h('section', { className: css.page, 'aria-labelledby': titleId, 'aria-busy': busy || listing.status === 'loading' },
      h('style', null, STYLES),

      h('header', { className: css.header, 'data-window-drag': '' },
        h('div', { className: css.headerText },
          h('h1', { id: titleId, className: css.title }, t('title')),
          h('p', { className: css.subtitle }, t('subtitle')),
        ),
        h('div', { className: css.toolbar },
          h('button', {
            type: 'button', className: `${css.button} ${css.buttonPrimary}`,
            onClick: () => { fileInput.current?.click() }, disabled: busy || path === null,
          }, glyph('file'), busy ? t('uploading') : t('upload')),
          h('input', {
            ref: fileInput, type: 'file', multiple: true, hidden: true,
            onChange: (event) => {
              const files = event.target.files
              if (files) void upload(files)
              event.target.value = ''
            },
          }),
          h('button', {
            type: 'button', className: css.button,
            onClick: () => setDialog({ kind: 'new-folder', value: '' }), disabled: busy || path === null,
          }, t('newFolder')),
          h('button', {
            type: 'button',
            className: `${css.button} ${css.toggleButton}${showHidden ? ` ${css.toggleButtonOn}` : ''}`,
            onClick: toggleHidden,
            disabled: path === null || listing.value?.hiddenForced === true,
            'aria-pressed': showHidden || listing.value?.hiddenForced === true,
            title: listing.value?.hiddenForced === true ? t('hiddenForced') : t('toggleHidden'),
            'aria-label': t('toggleHidden'),
          }, glyph('eye'), t('hiddenShort')),
          h('button', {
            type: 'button', className: `${css.button} ${css.buttonIcon}`,
            onClick: reload, disabled: path === null, title: t('refresh'), 'aria-label': t('refresh'),
          }, glyph('refresh')),
        ),
      ),

      h('div', { className: css.breadcrumbRow },
        h('button', {
          type: 'button', className: `${css.button} ${css.buttonIcon}`,
          onClick: () => navigate(listing.value?.parent ?? path), disabled: !listing.value?.parent,
          title: t('up'), 'aria-label': t('up'),
        }, glyph('up')),
        h('form', {
          className: css.addressForm,
          onSubmit: (event) => { event.preventDefault(); navigate(draftPath) },
        },
          h('label', { hidden: true, htmlFor: `${titleId}-address` }, t('addressLabel')),
          h('input', {
            id: `${titleId}-address`, className: css.addressInput, value: draftPath,
            placeholder: t('addressPlaceholder'), spellCheck: false, autoComplete: 'off',
            'aria-label': t('addressLabel'),
            onChange: (event) => { setDraftPath(event.target.value) },
          }),
          h('button', { type: 'submit', className: css.button, disabled: draftPath.trim() === '' }, t('go')),
        ),
      ),

      h('nav', { className: css.breadcrumb, 'aria-label': t('title') },
        visibleCrumbs(crumbs).map((crumb, index, shown) => {
          const last = index === shown.length - 1
          if (crumb.ellipsis === true) {
            return h('span', { key: `gap-${index}`, className: css.crumbSep, title: crumb.title }, '…')
          }
          return h(React.Fragment, { key: crumb.path },
            index > 0 ? h('span', { className: css.crumbSep, 'aria-hidden': 'true' }, '/') : null,
            h('button', {
              type: 'button',
              className: `${css.crumb}${last ? ` ${css.crumbCurrent}` : ''}`,
              'aria-current': last ? 'page' : undefined,
              title: crumb.path,
              onClick: () => { if (!last) navigate(crumb.path) },
            }, crumb.name),
          )
        }),
      ),

      roots.length > 0
        ? h('div', { className: css.roots },
          h('span', null, `${t('rootsLabel')}:`),
          roots.map(root => h('button', {
            key: root, type: 'button', className: css.rootChip, title: root,
            onClick: () => navigate(root),
          }, root === '/' ? t('rootCrumb') : root)),
        )
        : null,

      h('div', { className: css.filterRow },
        h('input', {
          className: css.filterInput, value: filter, spellCheck: false,
          placeholder: t('searchPlaceholder'), 'aria-label': t('searchPlaceholder'),
          onChange: (event) => { setFilter(event.target.value) },
        }),
      ),

      notice !== null
        ? h('p', {
          className: `${css.notice}${notice.kind === 'error' ? ` ${css.noticeError}` : ''}`,
          role: notice.kind === 'error' ? 'alert' : 'status',
        }, notice.text)
        : null,

      someSelected
        ? h('div', { className: css.selectionBar },
          h('span', null, t('selectedCount', { count: selected.size })),
          h('button', {
            type: 'button', className: css.button,
            onClick: () => downloadArchive([...selected]),
          }, selected.size === 1 ? t('downloadSelected') : t('downloadSelectedZip')),
          h('button', {
            type: 'button', className: `${css.button} ${css.buttonDanger}`,
            onClick: () => setDialog({ kind: 'delete', paths: [...selected], names: [...selected].map((entryPath) => entries.find(item => item.path === entryPath)?.name ?? entryPath) }),
          }, t('deleteSelected')),
          h('button', { type: 'button', className: css.button, onClick: () => setSelected(new Set()) }, t('clearSelection')),
        )
        : null,

      h('div', {
        className: css.body,
        onDragEnter: onDragEnter, onDragOver: onDragOver, onDragLeave: onDragLeave, onDrop: onDrop,
      },
        h('div', {
          className: `${css.tableWrap}${dragging ? ` ${css.dragOver}` : ''}`,
          'data-dragging': dragging ? '' : undefined,
        },
          listing.status === 'loading' && listing.value === null
            ? h('p', { className: css.status, role: 'status' }, t('loading'))
            : null,
          listing.status === 'error'
            ? h('div', { className: css.status, role: 'alert' },
              h('p', null, `${t('loadFailed')} ${listing.error ?? ''}`),
              h('button', { type: 'button', className: css.button, onClick: reload }, t('retry')))
            : null,
          listing.value !== null
            ? h('table', { key: tableLabel, className: css.table, 'aria-label': tableLabel },
              h('thead', { className: css.thead },
                h('tr', null,
                  h('th', { className: css.checkCell },
                    h('input', {
                      type: 'checkbox', checked: allSelected,
                      'aria-label': t('selectRow'), onChange: toggleAll,
                    })),
                  h('th', null, t('name')),
                  h('th', { className: css.cellSize }, t('size')),
                  h('th', { className: css.cellModified }, t('modified')),
                  h('th', { className: css.cellActions }, h('span', { hidden: true }, t('actions'))),
                ),
              ),
              h('tbody', { key: tableLabel },
                visible.length === 0
                  ? h('tr', null, h('td', { colSpan: 5, className: css.empty },
                    filter.trim() === '' ? t('emptyFolder') : t('filtered', { filter: filter.trim() })))
                  : visible.map(entry => h('tr', {
                    key: entry.path,
                    className: `${css.row}${selected.has(entry.path) ? ` ${css.rowSelected}` : ''}`,
                    onDoubleClick: () => { openEntry(entry) },
                  },
                  h('td', { className: css.checkCell },
                    h('input', {
                      type: 'checkbox', checked: selected.has(entry.path),
                      'aria-label': `${t('selectRow')}: ${entry.name}`,
                      onChange: () => { toggle(entry.path) },
                    })),
                  h('td', null,
                    h('button', {
                      type: 'button', className: css.rowName,
                      onClick: () => { openEntry(entry) },
                      title: entry.name,
                    },
                    h('span', { className: css.rowIcon }, glyph(entry.type === 'directory' ? 'folder' : entry.type === 'file' ? 'file' : 'other')),
                    h('span', null, entry.name)),
                  ),
                  h('td', { className: css.cellSize }, entry.type === 'file' ? formatSize(entry.size) : ''),
                  h('td', { className: css.cellModified }, formatTime(entry.modified)),
                  h('td', { className: css.cellActions },
                    entry.type === 'file'
                      ? h(React.Fragment, null,
                        h('button', { type: 'button', className: css.actionButton, onClick: () => setPreview({ path: entry.path, name: entry.name, state: { status: 'loading' } }) }, t('preview')),
                        h('button', { type: 'button', className: css.actionButton, onClick: () => { downloadEntry(entry) } }, t('download')),
                      )
                      : null,
                    entry.type === 'directory'
                      ? h('button', { type: 'button', className: css.actionButton, onClick: () => { downloadEntry(entry) } }, t('download'))
                      : null,
                    h('button', {
                      type: 'button', className: css.actionButton,
                      onClick: () => setDialog({ kind: 'rename', entry, value: entry.name }),
                    }, t('rename')),
                    h('button', {
                      type: 'button', className: css.actionButton,
                      onClick: () => setDialog({ kind: 'delete', paths: [entry.path], names: [entry.name] }),
                    }, t('delete')),
                  ),
                )),
              ),
            )
            : null,
        ),
        listing.value?.truncated ? h('p', { className: css.notice }, t('truncated')) : null,
        listing.value?.unaddressable > 0
          ? h('p', { className: css.notice }, t('unaddressable', { count: listing.value.unaddressable }))
          : null,
        dragging ? h('p', { className: css.notice, role: 'status' }, t('dropHere')) : null,
      ),

      dialog?.kind === 'new-folder'
        ? h(Modal, { title: t('newFolderTitle'), onClose: () => setDialog(null) },
          h(NameForm, {
            key: 'new-folder', label: t('newFolderLabel'), placeholder: t('newFolderPlaceholder'),
            initial: '', submitLabel: t('confirm'), cancelLabel: t('cancel'),
            onSubmit: submitNewFolder, onCancel: () => setDialog(null),
          }))
        : null,
      dialog?.kind === 'rename'
        ? h(Modal, { title: t('renameTitle'), onClose: () => setDialog(null) },
          h(NameForm, {
            key: `rename-${dialog.entry.path}`, label: t('renameLabel'), placeholder: dialog.entry.name,
            initial: dialog.value, submitLabel: t('save'), cancelLabel: t('cancel'),
            unchanged: name => name.trim() === dialog.entry.name,
            onSubmit: name => submitRename(dialog.entry, name), onCancel: () => setDialog(null),
          }))
        : null,
      dialog?.kind === 'overwrite'
        ? h(Modal, { title: t('overwriteTitle'), onClose: () => setDialog(null) },
          h('p', { className: css.dialogBody }, t('overwriteBody', { count: dialog.names.length })),
          h('ul', { className: css.conflictList }, dialog.names.slice(0, 8).map(name => h('li', { key: name }, name))),
          h('div', { className: css.dialogActions },
            h('button', { type: 'button', className: css.button, onClick: () => { const files = dialog.files; setDialog(null); void upload(files, false) } }, t('cancel')),
            h('button', {
              type: 'button',
              className: `${css.button} ${css.buttonDanger}`,
              onClick: () => { const files = dialog.files; setDialog(null); void upload(files, true) },
            }, t('overwrite')),
          ))
        : null,
      dialog?.kind === 'delete'
        ? h(Modal, { title: t('deleteTitle'), onClose: () => setDialog(null) },
          h('p', { className: css.dialogBody },
            dialog.paths.length === 1 ? t('deleteConfirmOne', { name: dialog.names[0] }) : t('deleteConfirmMany', { count: dialog.paths.length })),
          h('p', { className: css.dialogBody }, t('deleteFolderNote')),
          h('div', { className: css.dialogActions },
            h('button', { type: 'button', className: css.button, onClick: () => setDialog(null) }, t('cancel')),
            h('button', { type: 'button', className: `${css.button} ${css.buttonDanger}`, onClick: () => submitDelete(dialog.paths) }, t('delete')),
          ))
        : null,

      preview !== null
        ? overlay(h(PreviewDialog, { preview, onClose: () => setPreview(null), download, t }))
        : null,
    )
  }

  /**
   * A single-field form used by the new-folder and rename dialogs.
   * @param props - labels, initial value, and submit/cancel handlers.
   * @returns the form element.
   */
  function NameForm({ label, placeholder, initial, submitLabel, cancelLabel, onSubmit, onCancel, unchanged }) {
    const [value, setValue] = useState(initial)
    return h('form', {
      onSubmit: (event) => {
        event.preventDefault()
        if (value.trim() !== '') onSubmit(value.trim())
      },
    },
    h('div', { className: css.field },
      h('label', null, label),
      h('input', {
        className: css.input, value, placeholder, autoComplete: 'off', spellCheck: false,
        onChange: (event) => { setValue(event.target.value) },
      })),
    h('div', { className: css.dialogActions },
      h('button', { type: 'button', className: css.button, onClick: onCancel }, cancelLabel),
      h('button', {
        type: 'submit',
        className: `${css.button} ${css.buttonPrimary}`,
        disabled: value.trim() === '' || (unchanged?.(value) ?? false),
      }, submitLabel),
    ))
  }

  /**
   * The inline file preview dialog.
   * @param props - the open preview, its close handler, the download starter, and copy.
   * @returns the dialog element.
   */
  function PreviewDialog({ preview, onClose, download, t }) {
    const headingId = useId()
    const state = preview.state
    return h('div', {
      className: css.previewBackdrop, role: 'presentation',
      onMouseDown: (event) => {
        if (event.target !== event.currentTarget) return
        // Only a completed click on the backdrop closes the panel.
        if (window.getSelection()?.toString()) return
        onClose()
      },
    },
    h('div', { className: css.preview, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': headingId },
      h('div', { className: css.previewHead },
        h('h2', { id: headingId, className: css.previewTitle }, preview.name),
        h('div', { className: css.links },
          h('a', {
            className: css.button,
            href: `api/file-manager.raw?path=${encodeURIComponent(preview.path)}`,
            target: '_blank',
            rel: 'noopener',
          }, t('openInBrowser')),
          h('button', { type: 'button', className: css.button, onClick: () => { download(preview.path) } }, t('downloadFile')),
          h('button', { type: 'button', className: `${css.button} ${css.buttonIcon}`, onClick: onClose, 'aria-label': t('close') }, glyph('close')),
        ),
      ),
      h('div', { className: css.previewBody },
        state.status === 'loading' ? h('p', { className: css.status, role: 'status' }, t('loading')) : null,
        state.status === 'error' ? h('p', { className: `${css.status} ${css.noticeError}`, role: 'alert' }, `${t('previewFailed')} ${state.error}`) : null,
        state.status === 'ready' && state.value.kind === 'text'
          ? h('pre', { className: css.previewText }, `${state.value.text ?? ''}${state.value.truncated ? `\n\n… ${t('previewTruncated')}` : ''}`)
          : null,
        state.status === 'ready' && state.value.kind === 'image'
          ? h('img', { className: css.previewImage, src: state.url, alt: preview.name })
          : null,
        state.status === 'ready' && state.value.kind === 'pdf'
          ? h('iframe', { className: css.previewFrame, src: state.url, title: preview.name })
          : null,
        state.status === 'ready' && state.value.kind === 'binary'
          ? h('p', { className: css.status }, t('previewBinary'))
          : null,
      ),
    ))
  }

  return FileManagerPage
}
