/**
 * File manager — page copy.
 *
 * DSH locale dictionaries are flat `key: string` maps: `t(key, params)`
 * substitutes `{name}` placeholders and never receives a function. Every
 * message with a value is therefore a template plus a params object at the
 * call site — a function value here reaches React as a child and blanks the
 * slot.
 */

/** English copy for the file manager page. */
export const en = {
  // Panel and page.
  panel: 'Server files',
  title: 'Server files',
  subtitle: 'Browse, upload, download, and manage files on the machine running DSH.',

  // Toolbar.
  addressLabel: 'Directory path',
  addressPlaceholder: 'Type a directory path and press Enter',
  go: 'Go',
  up: 'Parent directory',
  refresh: 'Refresh',
  upload: 'Upload files',
  newFolder: 'New folder',
  uploading: 'Uploading…',
  dropHere: 'Drop files to upload here',
  selectedCount: '{count} selected',
  clearSelection: 'Clear selection',
  downloadSelected: 'Download',
  downloadSelectedZip: 'Download as ZIP',
  deleteSelected: 'Delete',
  searchPlaceholder: 'Filter this folder',
  rootsLabel: 'Shortcuts',
  rootCrumb: 'Root',
  hiddenShort: 'Hidden',
  toggleHidden: 'Show or hide dotfiles',
  hiddenForced: 'This Host always shows dotfiles',

  // Table.
  name: 'Name',
  size: 'Size',
  modified: 'Modified',
  actions: 'Actions',
  emptyFolder: 'This folder is empty.',
  truncated: 'Only the first entries are shown. Open a subfolder or use the path bar.',
  unaddressable: '{count} entry name(s) cannot be addressed by this page and are hidden.',
  loading: 'Loading…',
  loadFailed: 'This directory could not be opened.',
  unavailable: 'The file manager service is not available on this Host.',
  retry: 'Retry',
  selectRow: 'Select',
  filtered: 'empty — nothing matches “{filter}”',

  // Row actions.
  preview: 'Preview',
  download: 'Download',
  rename: 'Rename',
  delete: 'Delete',

  // Dialogs.
  cancel: 'Cancel',
  confirm: 'Confirm',
  save: 'Save',
  newFolderTitle: 'New folder',
  newFolderLabel: 'Folder name',
  newFolderPlaceholder: 'Untitled folder',
  renameTitle: 'Rename',
  renameLabel: 'New name',
  deleteTitle: 'Delete',
  deleteConfirmOne: 'Delete “{name}”? This cannot be undone.',
  deleteConfirmMany: 'Delete these {count} items? This cannot be undone.',
  deleteFolderNote: 'Folders are deleted together with everything inside them.',
  overwriteTitle: 'Replace existing files?',
  overwriteBody: '{count} file(s) already exist in this folder. Replacing them cannot be undone.',
  overwrite: 'Replace',
  close: 'Close',

  // Feedback.
  uploadDone: '{count} file(s) uploaded.',
  uploadFailed: 'Upload failed: {reason}',
  deleteDone: '{count} item(s) deleted.',
  deletePartial: '{done} deleted, {failed} not deleted:',
  renameDone: 'Renamed.',
  createDone: 'Folder created.',
  actionFailed: 'Action failed: {reason}',

  // Preview.
  previewBinary: 'This file cannot be shown inline. Download it to open it.',
  previewTruncated: 'The preview shows the beginning of the file only.',
  previewFailed: 'The preview could not be loaded: {reason}',
  openInBrowser: 'Open in a new tab',
  downloadFile: 'Download',
}

/** Chinese copy for the file manager page. */
export const zh = {
  panel: '服务器文件',
  title: '服务器文件',
  subtitle: '浏览、上传、下载并管理运行 DSH 的这台机器上的文件。',

  addressLabel: '目录路径',
  addressPlaceholder: '输入目录路径并按回车',
  go: '前往',
  up: '上级目录',
  refresh: '刷新',
  upload: '上传文件',
  newFolder: '新建文件夹',
  uploading: '正在上传…',
  dropHere: '松开即可上传到当前目录',
  selectedCount: '已选择 {count} 项',
  clearSelection: '清除选择',
  downloadSelected: '下载',
  downloadSelectedZip: '打包下载 (ZIP)',
  deleteSelected: '删除',
  searchPlaceholder: '筛选当前目录',
  rootsLabel: '快捷入口',
  rootCrumb: '根目录',
  hiddenShort: '隐藏文件',
  toggleHidden: '显示/隐藏以点开头的文件',
  hiddenForced: '此 Host 已配置为始终显示隐藏文件',

  name: '名称',
  size: '大小',
  modified: '修改时间',
  actions: '操作',
  emptyFolder: '这个文件夹是空的。',
  truncated: '只显示了部分条目。可以进入子目录或直接用路径栏跳转。',
  unaddressable: '有 {count} 个条目的文件名本页无法表示，已隐藏。',
  loading: '加载中…',
  loadFailed: '无法打开这个目录。',
  unavailable: '当前 Host 上没有可用的文件管理服务。',
  retry: '重试',
  selectRow: '选择',
  filtered: '空——没有匹配“{filter}”的条目',

  preview: '预览',
  download: '下载',
  rename: '重命名',
  delete: '删除',

  cancel: '取消',
  confirm: '确定',
  save: '保存',
  newFolderTitle: '新建文件夹',
  newFolderLabel: '文件夹名称',
  newFolderPlaceholder: '未命名文件夹',
  renameTitle: '重命名',
  renameLabel: '新名称',
  deleteTitle: '删除',
  deleteConfirmOne: '确定删除“{name}”吗？此操作无法撤销。',
  deleteConfirmMany: '确定删除这 {count} 项吗？此操作无法撤销。',
  deleteFolderNote: '文件夹会连同其中的所有内容一起删除。',
  overwriteTitle: '替换已有文件？',
  overwriteBody: '当前目录已有 {count} 个同名文件。替换后无法撤销。',
  overwrite: '替换',
  close: '关闭',

  uploadDone: '已上传 {count} 个文件。',
  uploadFailed: '上传失败：{reason}',
  deleteDone: '已删除 {count} 项。',
  deletePartial: '已删除 {done} 项，{failed} 项未删除：',
  renameDone: '已重命名。',
  createDone: '已创建文件夹。',
  actionFailed: '操作失败：{reason}',

  previewBinary: '这个文件无法在页面内显示，请下载后打开。',
  previewTruncated: '预览只显示文件开头部分。',
  previewFailed: '预览加载失败：{reason}',
  openInBrowser: '在新标签页打开',
  downloadFile: '下载',
}