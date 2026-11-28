/**
 * File manager — page styles.
 *
 * Injected as one `<style>` element owned by the page component, so the
 * stylesheet leaves with the panel. Only theme tokens are used, so light and
 * dark themes and a renamed token degrade rather than break.
 */

/** Class names the page markup uses. */
export const css = {
  page: 'fmPage',
  header: 'fmHeader',
  headerText: 'fmHeaderText',
  title: 'fmTitle',
  subtitle: 'fmSubtitle',
  toolbar: 'fmToolbar',
  breadcrumbRow: 'fmBreadcrumbRow',
  addressForm: 'fmAddressForm',
  addressInput: 'fmAddressInput',
  button: 'fmButton',
  buttonPrimary: 'fmButtonPrimary',
  buttonDanger: 'fmButtonDanger',
  buttonIcon: 'fmButtonIcon',
  hiddenCheck: 'fmHiddenCheck',
  hiddenCheckDisabled: 'fmHiddenCheckDisabled',
  breadcrumb: 'fmBreadcrumb',
  crumb: 'fmCrumb',
  crumbCurrent: 'fmCrumbCurrent',
  crumbSep: 'fmCrumbSep',
  roots: 'fmRoots',
  rootChip: 'fmRootChip',
  filterRow: 'fmFilterRow',
  filterInput: 'fmFilterInput',
  notice: 'fmNotice',
  noticeError: 'fmNoticeError',
  selectionBar: 'fmSelectionBar',
  body: 'fmBody',
  tableWrap: 'fmTableWrap',
  table: 'fmTable',
  thead: 'fmThead',
  row: 'fmRow',
  rowSelected: 'fmRowSelected',
  rowName: 'fmRowName',
  rowIcon: 'fmRowIcon',
  checkCell: 'fmCheckCell',
  cellSize: 'fmCellSize',
  cellModified: 'fmCellModified',
  cellPerms: 'fmCellPerms',
  permBadge: 'fmPermBadge',
  permMatrix: 'fmPermMatrix',
  permPresets: 'fmPermPresets',
  permOctalRow: 'fmPermOctalRow',
  permPreview: 'fmPermPreview',
  permError: 'fmPermError',
  cellActions: 'fmCellActions',
  actionButton: 'fmActionButton',
  status: 'fmStatus',
  empty: 'fmEmpty',
  dragOver: 'fmDragOver',
  dialogBackdrop: 'fmDialogBackdrop',
  dialog: 'fmDialog',
  dialogTitle: 'fmDialogTitle',
  dialogBody: 'fmDialogBody',
  dialogActions: 'fmDialogActions',
  conflictList: 'fmConflictList',
  field: 'fmField',
  input: 'fmInput',
  errorText: 'fmErrorText',
  previewBackdrop: 'fmPreviewBackdrop',
  preview: 'fmPreview',
  previewHead: 'fmPreviewHead',
  previewTitle: 'fmPreviewTitle',
  previewBody: 'fmPreviewBody',
  previewText: 'fmPreviewText',
  editorArea: 'fmEditorArea',
  editorNote: 'fmEditorNote',
  searchModeSelect: 'fmSearchModeSelect',
  searchBanner: 'fmSearchBanner',
  matchMeta: 'fmMatchMeta',
  moveTargets: 'fmMoveTargets',
  dropTarget: 'fmDropTarget',
  previewImage: 'fmPreviewImage',
  previewFrame: 'fmPreviewFrame',
  links: 'fmLinks',
}

/** The stylesheet text, scoped by the `fm` prefix. */
export const STYLES = `
.${css.page} {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-base);
  font-size: 13px;
  line-height: 1.5;
}
.${css.header} {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px 16px;
  padding: 20px 24px 12px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l1);
}
.${css.headerText} { min-width: 0; }
.${css.title} {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
}
.${css.subtitle} {
  margin: 2px 0 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
.${css.toolbar} {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.${css.breadcrumbRow} {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px 0;
}
.${css.addressForm} {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}
.${css.addressInput}, .${css.input}, .${css.filterInput} {
  box-sizing: border-box;
  min-width: 0;
  padding: 5px 8px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-md, 6px);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 16px;
}
.${css.addressInput} { flex: 1; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
.${css.addressInput}:focus-visible, .${css.input}:focus-visible, .${css.filterInput}:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
.${css.button} {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-md, 6px);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
}
.${css.button}:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); }
.${css.button}:disabled { opacity: 0.5; cursor: default; }
.${css.buttonPrimary} {
  border-color: transparent;
  background: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-bg-base);
}
.${css.buttonPrimary}:hover:not(:disabled) { background: var(--dsw-alias-brand-primary); opacity: 0.9; }
.${css.buttonDanger} { color: var(--dsw-alias-state-error-primary); }
.${css.buttonDanger}:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); }
.${css.buttonIcon} { padding: 5px 8px; }
.${css.hiddenCheck} {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  box-sizing: border-box;
  padding: 5px 10px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-md, 6px);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  user-select: none;
  margin: 0;
  white-space: nowrap;
}
.${css.hiddenCheck}:hover { background: var(--dsw-alias-bg-layer-1); }
.${css.hiddenCheck} input[type="checkbox"] {
  margin: 0;
  width: 14px;
  height: 14px;
  accent-color: var(--dsw-alias-brand-primary);
  cursor: pointer;
}
.${css.hiddenCheckDisabled} { opacity: 0.45; cursor: not-allowed; }
.${css.hiddenCheckDisabled} input[type="checkbox"] { cursor: not-allowed; }
.${css.breadcrumb} {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  min-width: 0;
  padding: 8px 24px 0;
  font-size: 12px;
}
.${css.crumb} {
  max-width: 260px;
  padding: 2px 6px;
  border: 0;
  border-radius: var(--dsw-radius-sm, 4px);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.${css.crumb}:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.${css.crumbCurrent} { color: var(--dsw-alias-label-primary); font-weight: 600; }
.${css.crumbSep} { color: var(--dsw-alias-label-secondary); user-select: none; }
.${css.roots} {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 6px 24px 0;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.${css.rootChip} {
  padding: 1px 8px;
  border: 0.5px solid var(--dsw-alias-border-l1);
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  cursor: pointer;
}
.${css.rootChip}:hover { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l2); }
.${css.filterRow} {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 24px 0;
}
.${css.filterInput} { flex: 1; max-width: 320px; font-size: 13px; }
.${css.notice} {
  margin: 8px 24px 0;
  padding: 6px 10px;
  border-radius: var(--dsw-radius-md, 6px);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
.${css.noticeError} { color: var(--dsw-alias-state-error-primary); }
.${css.selectionBar} {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 24px 0;
  padding: 6px 10px;
  border-radius: var(--dsw-radius-md, 6px);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
}
.${css.body} {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: 8px 24px 24px;
  overflow: auto;
}
.${css.tableWrap} {
  position: relative;
  flex: 1;
  min-height: 160px;
  border: 0.5px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-lg, 8px);
  background: var(--dsw-alias-bg-layer-1);
  overflow: auto;
}
.${css.dragOver} { outline: 2px dashed var(--dsw-alias-brand-primary); outline-offset: -4px; }
.${css.table} { width: 100%; border-collapse: collapse; }
.${css.thead} {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  font-weight: 500;
  text-align: left;
}
.${css.thead} th { padding: 7px 10px; font-weight: 500; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.${css.row} { cursor: default; }
.${css.row} td { padding: 5px 10px; border-bottom: 0.5px solid var(--dsw-alias-border-l1); vertical-align: middle; }
.${css.row}:hover { background: var(--dsw-alias-bg-layer-2); }
.${css.rowSelected}, .${css.rowSelected}:hover { background: var(--dsw-alias-bg-layer-2); }
.${css.rowName} {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  max-width: 100%;
}
.${css.rowName}:hover { text-decoration: underline; }
.${css.rowIcon} { flex: none; width: 16px; height: 16px; color: var(--dsw-alias-label-secondary); }
.${css.rowName} span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.${css.checkCell} { width: 28px; }
.${css.cellSize} { width: 96px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; }
.${css.cellModified} { width: 150px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.${css.cellPerms} { width: 138px; white-space: nowrap; }
.${css.permBadge} {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 6px;
  border: 0.5px solid transparent;
  border-radius: var(--dsw-radius-sm, 4px);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  cursor: pointer;
}
.${css.permBadge}:hover, .${css.permBadge}:focus-visible {
  border-color: var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-brand-primary);
  outline: none;
}
.${css.permMatrix} {
  width: 100%;
  margin-top: 12px;
  border-collapse: collapse;
  font-size: 12px;
}
.${css.permMatrix} th, .${css.permMatrix} td {
  padding: 6px 8px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l1);
  text-align: center;
  color: var(--dsw-alias-label-primary);
}
.${css.permMatrix} th:first-child, .${css.permMatrix} td:first-child {
  text-align: left;
  color: var(--dsw-alias-label-secondary);
  font-weight: 500;
}
.${css.permMatrix} input[type="checkbox"] {
  margin: 0;
  width: 15px;
  height: 15px;
  accent-color: var(--dsw-alias-brand-primary);
  cursor: pointer;
}
.${css.permPresets} {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}
.${css.permOctalRow} {
  display: flex;
  align-items: center;
  gap: 10px;
}
.${css.permOctalRow} input {
  width: 110px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.${css.permPreview} {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  color: var(--dsw-alias-label-secondary);
}
.${css.permError} { margin: 6px 0 0; color: var(--dsw-alias-state-error-primary); font-size: 12px; }
.${css.cellActions} { width: 248px; text-align: right; white-space: nowrap; }
.${css.actionButton} {
  padding: 2px 6px;
  margin-left: 2px;
  border: 0;
  border-radius: var(--dsw-radius-sm, 4px);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
}
.${css.row}:hover .${css.actionButton}, .${css.row}:focus-within .${css.actionButton} { opacity: 1; }
.${css.actionButton}:hover { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }
.${css.actionButton}:focus-visible { opacity: 1; outline: 2px solid var(--dsw-alias-brand-primary); }
.${css.status} { padding: 16px; color: var(--dsw-alias-label-secondary); text-align: center; }
.${css.empty} { padding: 32px 16px; color: var(--dsw-alias-label-secondary); text-align: center; }
.${css.dialogBackdrop} {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: color-mix(in srgb, var(--dsw-alias-bg-base) 70%, transparent);
}
.${css.dialog} {
  width: min(420px, 100%);
  box-sizing: border-box;
  padding: 18px 20px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-lg, 10px);
  background: var(--dsw-alias-bg-layer-3);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
}
.${css.dialogTitle} { margin: 0 0 10px; font-size: 14px; font-weight: 600; }
.${css.dialogBody} { color: var(--dsw-alias-label-secondary); font-size: 13px; }
.${css.dialogActions} { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
.${css.field} { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
.${css.field} label { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.${css.input} { font-size: 16px; }
.${css.conflictList} {
  margin: 10px 0 0;
  padding: 0 0 0 18px;
  max-height: 160px;
  overflow: auto;
  color: var(--dsw-alias-label-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
.${css.errorText} { margin: 8px 0 0; color: var(--dsw-alias-state-error-primary); font-size: 12px; }
.${css.previewBackdrop} {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: color-mix(in srgb, var(--dsw-alias-bg-base) 72%, transparent);
}
.${css.preview} {
  display: flex;
  flex-direction: column;
  width: min(900px, 100%);
  height: min(720px, 100%);
  box-sizing: border-box;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-lg, 10px);
  background: var(--dsw-alias-bg-layer-3);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}
.${css.previewHead} {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l1);
}
.${css.previewTitle} {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
}
.${css.previewBody} {
  display: flex;
  flex: 1;
  min-height: 0;
  align-items: center;
  justify-content: center;
  padding: 12px;
  overflow: auto;
}
.${css.previewText} {
  align-self: stretch;
  flex: 1;
  margin: 0;
  overflow: auto;
  color: var(--dsw-alias-label-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
.${css.previewImage} { max-width: 100%; max-height: 100%; object-fit: contain; }
.${css.previewFrame} { flex: 1; align-self: stretch; width: 100%; border: 0; background: var(--dsw-alias-bg-base); }
.${css.editorArea} {
  flex: 1;
  align-self: stretch;
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-md, 6px);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
  line-height: 1.6;
  resize: none;
}
.${css.editorArea}:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.${css.editorNote} {
  margin: 0;
  padding: 6px 14px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
}
.${css.searchModeSelect} {
  padding: 5px 8px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-md, 6px);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
}
.${css.searchBanner} {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 8px 24px 0;
  padding: 6px 10px;
  border-radius: var(--dsw-radius-md, 6px);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
.${css.matchMeta} {
  display: block;
  margin-top: 2px;
  color: var(--dsw-alias-label-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 420px;
}
.${css.moveTargets} {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.${css.dropTarget} {
  outline: 1.5px dashed var(--dsw-alias-brand-primary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent);
}
.${css.links} { display: flex; gap: 8px; align-items: center; }
`