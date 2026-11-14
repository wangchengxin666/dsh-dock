export type Locale = 'zh-CN' | 'en'

export const LOCALE_STORAGE_KEY = 'dsh_manager_locale'
export const DEFAULT_LOCALE: Locale = 'zh-CN'

export interface StorageReader {
  getItem(key: string): string | null
}

export interface StorageWriter {
  setItem(key: string, value: string): void
}

export interface DetectLocaleOptions {
  storage?: StorageReader | null
  navigatorLanguage?: string | null
  navigatorLanguages?: readonly string[] | null
}

/**
 * Normalize raw locale identifiers (e.g. "zh", "zh-Hans", "en-US") into supported locales.
 */
export function normalizeLocale(value: unknown): Locale | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null
  if (normalized === 'zh' || normalized.startsWith('zh-')) return 'zh-CN'
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en'
  return null
}

/**
 * Resolve the initial UI locale from persisted storage first, then browser preferences.
 */
export function detectInitialLocale(options: DetectLocaleOptions = {}): Locale {
  let storage = options.storage
  if (storage === undefined) {
    try {
      storage = typeof globalThis !== 'undefined' ? (globalThis.localStorage ?? null) : null
    } catch {
      storage = null
    }
  }

  if (storage) {
    try {
      const saved = normalizeLocale(storage.getItem(LOCALE_STORAGE_KEY))
      if (saved) return saved
    } catch {
      // Ignore storage access errors in restricted browser contexts.
    }
  }

  const candidates: string[] = []
  if (options.navigatorLanguages !== undefined) {
    if (options.navigatorLanguages) {
      candidates.push(...options.navigatorLanguages)
    }
  } else if (typeof globalThis !== 'undefined' && globalThis.navigator?.languages) {
    candidates.push(...globalThis.navigator.languages)
  }

  if (options.navigatorLanguage !== undefined) {
    if (options.navigatorLanguage) {
      candidates.push(options.navigatorLanguage)
    }
  } else if (typeof globalThis !== 'undefined' && globalThis.navigator?.language) {
    candidates.push(globalThis.navigator.language)
  }

  for (const candidate of candidates) {
    const matched = normalizeLocale(candidate)
    if (matched) return matched
  }

  return DEFAULT_LOCALE
}

/**
 * Persist the selected locale in browser storage when available.
 */
export function persistLocale(locale: Locale, storage?: StorageWriter | null): void {
  let target = storage
  if (target === undefined) {
    try {
      target = typeof globalThis !== 'undefined' ? (globalThis.localStorage ?? null) : null
    } catch {
      target = null
    }
  }
  if (!target) return
  try {
    target.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // Ignore storage quota / privacy mode errors.
  }
}

/**
 * Pick localized API text fields such as plugin display names and descriptions.
 */
export function pickLocalizedText(
  locale: Locale,
  zhText?: string | null,
  enText?: string | null,
  fallback = '',
): string {
  if (locale === 'en') {
    return enText || zhText || fallback
  }
  return zhText || enText || fallback
}

const zhCN = {
  // App shell & header
  'app.documentTitle': 'DSH Sandbox Cloud · 远程 Agent OS 托管平台',
  'app.subtitle': 'DeepSeek Harness 远程 Agent 操作系统托管平台',
  'app.checkingSession': '正在加载 DSH Sandbox Cloud...',
  'app.nav.admin': '管理员控制台',
  'app.nav.my': '我的工作区',
  'app.role.admin': '管理员',
  'app.role.user': '普通用户',
  'app.logout': '退出登录',
  'app.loggedOut': '已退出登录',
  'app.localeToggleLabel': '切换界面语言',

  // Login view
  'login.title': '登录 DSH Sandbox Cloud',
  'login.subtitle': '每个工作区均由平台管理员统一创建与分配，提供可 7×24 小时持续运行的远程 DeepSeek Harness 操作系统环境。',
  'login.badgeOidc': 'SSO / OIDC',
  'login.badgeLocal': '本地认证',
  'login.disabledBanner': '该账号已被平台管理员禁用，请联系管理员启用后再登录。',
  'login.oidcButton': '使用企业单点登录 (OIDC SSO)',
  'login.modeAdmin': '管理员控制台',
  'login.modeUser': '员工工作区入口',
  'login.adminEmailLabel': '管理员邮箱',
  'login.userEmailLabel': '员工邮箱',
  'login.tokenLabel': '管理员口令 (MANAGER_ADMIN_TOKEN)',
  'login.tokenPlaceholder': '输入管理员口令...',
  'login.passwordLabel': '登录密码',
  'login.passwordPlaceholder': '输入管理员为您设置的登录密码...',
  'login.submitting': '正在验证...',
  'login.submitAdmin': '进入管理员控制台',
  'login.submitUser': '登录我的远程工作区',
  'login.success': '登录成功',
  'login.failed': '登录失败',

  // Common actions & states
  'common.copied': '已复制到剪贴板',
  'common.refresh': '刷新状态',
  'common.cancel': '取消',
  'common.save': '保存',
  'common.saving': '正在保存...',
  'common.active': '生效中',
  'common.disabled': '已禁用',
  'common.inactive': '已停用',
  'common.unknown': '未知',

  // Sandbox statuses & actions
  'status.running': '运行中',
  'status.stopped': '已停止',
  'status.exited': '已停止',
  'status.creating': '创建中',
  'status.starting': '启动中',
  'status.restarting': '重启中',
  'status.paused': '已暂停',
  'status.error': '异常',
  'action.start': '启动',
  'action.stop': '停止',
  'action.restart': '重启',
  'action.recreate': '重建',

  // Admin notifications
  'admin.loadFailed': '加载平台数据失败',
  'admin.sandboxProvisioned': '沙箱已成功分配给 {email}',
  'admin.sandboxCreateFailed': '创建沙箱失败',
  'admin.sandboxActionRunning': '正在对 {slug} 执行{action}...',
  'admin.sandboxActionSuccess': '沙箱 {slug} {action}成功',
  'admin.sandboxUpdated': '沙箱 {slug} 配置已更新',
  'admin.sandboxDestroyed': '沙箱 {slug} 已销毁',
  'admin.noLogs': '(暂无日志输出)',
  'admin.logsLoadFailed': '读取日志失败: {message}',
  'admin.templateUpdated': '模板 "{name}" 已更新',
  'admin.templateCreated': '新模板 "{name}" 已创建',
  'admin.templateDeleteConfirm': '确定要删除模板 "{name} ({key})" 吗？',
  'admin.templateDeleted': '模板 {key} 已删除',
  'admin.pluginsSyncing': '正在向所有运行中沙箱注入并同步插件市场索引...',
  'admin.pluginsSynced': '已成功同步 {count} 个运行中沙箱的插件市场索引',
  'admin.pluginsSyncFailed': '同步失败',
  'admin.llmSaved': 'LLM 模型凭证已保存',
  'admin.llmDeleted': '已删除 LLM 配置',
  'admin.userAdded': '已添加用户 {email}',
  'admin.userEnabled': '已启用用户 {email}',
  'admin.userDisabled': '已禁用用户 {email}',
  'admin.userDeleted': '已删除用户 {email}',
  'admin.adminAdded': '已添加平台管理员',
  'admin.passwordUpdated': '已更新 {email} 的登录密码',

  // Admin KPI cards & tabs
  'admin.kpi.sandboxesTitle': '运行中沙箱 / 总数',
  'admin.kpi.sandboxesSubPrefix': '单域名二级目录 ',
  'admin.kpi.quotaTitle': '已分配计算配额',
  'admin.kpi.quotaUnit': 'vCPU Cores',
  'admin.kpi.quotaSub': '默认规格：{cpus} C / {memory}',
  'admin.kpi.templatesTitle': '镜像与环境模板',
  'admin.kpi.templatesUnit': '个可用模板',
  'admin.kpi.templatesSub': '本机镜像：{count} 个 Tag',
  'admin.kpi.pluginsTitle': '自托管插件源',
  'admin.kpi.pluginsUnit': '个内置插件',
  'admin.kpi.pluginsSubBefore': '内置 ',
  'admin.kpi.pluginsSubAfter': ' 与 npm Packument',

  'admin.tabs.sandboxes': '沙箱工作区',
  'admin.tabs.templates': '镜像与环境模板',
  'admin.tabs.plugins': '自托管插件源',
  'admin.tabs.llm': 'LLM 模型凭证',
  'admin.tabs.users': '用户与权限审计',
  'admin.newTemplateBtn': '新建环境模板',
  'admin.provisionSandboxBtn': '分配新沙箱工作区',

  // Tab 1: Sandboxes
  'admin.sandboxes.bannerStrong': '管理员强管控模式：',
  'admin.sandboxes.bannerText': '个人用户不允许自行创建工作区，所有沙箱环境均由管理员基于模板统一分配。',
  'admin.sandboxes.gatewayPrefix': '网关路由模式：Traefik 二级目录 (',
  'admin.sandboxes.gatewaySuffix': ')',
  'admin.sandboxes.colWorkspace': '工作区 / 归属用户',
  'admin.sandboxes.colTemplate': '模板 & 镜像',
  'admin.sandboxes.colStatus': '状态 & 二级目录路由',
  'admin.sandboxes.colResources': '实时资源监控 (CPU / 内存)',
  'admin.sandboxes.colActions': '操作管理',
  'admin.sandboxes.empty': '暂无已分配的沙箱工作区，点击右上角「分配新沙箱工作区」创建。',
  'admin.sandboxes.quotaPrefix': '配额：{cpu} vCPU · {memory} RAM · 卷 ',
  'admin.sandboxes.notRunning': '容器未运行',
  'admin.sandboxes.openWorkspace': '打开工作区',
  'admin.sandboxes.stopTooltip': '停止沙箱',
  'admin.sandboxes.startTooltip': '启动沙箱',
  'admin.sandboxes.restartTooltip': '重启沙箱',
  'admin.sandboxes.logsTooltip': '查看实时日志',
  'admin.sandboxes.editTooltip': '调整规格 / 镜像 / 模型',
  'admin.sandboxes.backupTooltip': '导出用户根目录备份 (.tar)',
  'admin.sandboxes.destroyTooltip': '销毁沙箱',

  // Tab 2: Templates
  'admin.templates.bannerStrong': '镜像与工作区模板管理：',
  'admin.templates.bannerText': '每个模板可绑定专属 Docker 镜像 (`image_repo:image_tag`)、默认 CPU/内存配额、预装插件列表、环境变量及首次启动执行的初始化 Shell 脚本 (`SANDBOX_INIT_SCRIPT`)。',
  'admin.templates.newShortBtn': '新建模板',
  'admin.templates.builtinBadge': '系统预置',
  'admin.templates.noDescription': '无描述',
  'admin.templates.imageLabel': '绑定镜像 (Docker Image)',
  'admin.templates.quotaLabel': '默认资源配额',
  'admin.templates.pluginsLabel': '预装 DSH 插件',
  'admin.templates.pluginsNone': '(不预装额外插件)',
  'admin.templates.initScriptLabel': '首次启动初始化脚本 (`init_script`):',
  'admin.templates.provisionBtn': '基于此模板分配沙箱',
  'admin.templates.editBtn': '编辑模板',
  'admin.templates.localImagesTitle': '宿主机可用 Docker 镜像列表',
  'admin.templates.localImagesDesc': '模板或沙箱可直接绑定以下任意本地镜像，也可通过 `docker build` 构建定制化沙箱镜像（如开启 `INSTALL_BROWSER=true` 或 `INSTALL_TOOLCHAIN=true`）。',

  // Tab 3: Plugins
  'admin.plugins.title': '自托管 DSH 插件索引与内置 npm 源',
  'admin.plugins.desc': '宿主机 `plugins/` 目录以只读热挂载方式接入，`dsh-manager` 按文件修改时间 (`mtime_ns`) 自动增量重打包并合成 `index.json`（含内联 Base64 图标与实时版本号），修改插件无需重建或重启 Manager。',
  'admin.plugins.syncBtn': '同步索引到运行中沙箱',
  'admin.plugins.indexUrlLabel': 'Discover 插件索引地址 (`DSH_PLUGIN_INDEX_URL`)',
  'admin.plugins.npmUrlLabel': '内置只读 npm Registry 地址',
  'admin.plugins.downloadTgz': '下载 .tgz 包',
  'admin.plugins.viewPackument': '查看 npm Packument',

  // Tab 4: LLM Profiles
  'admin.llm.addTitle': '新增 LLM 模型配置',
  'admin.llm.addDesc': 'API Key 使用服务端 `SECRET_KEY` 加密存储，可在分配沙箱时自动注入给 DeepSeek Harness。',
  'admin.llm.nameLabel': '配置名称',
  'admin.llm.namePlaceholder': '例如：DeepSeek 官方 API',
  'admin.llm.baseUrlLabel': 'OpenAI 兼容 Base URL',
  'admin.llm.modelLabel': '模型名称 (Model ID)',
  'admin.llm.apiKeyLabel': 'API Key',
  'admin.llm.saveBtn': '保存模型凭证',
  'admin.llm.listTitle': '已保存的 LLM 模型凭证',
  'admin.llm.listDesc': '分配或编辑沙箱时可直接关联下列模型配置。',
  'admin.llm.empty': '暂无已保存的 LLM 配置',

  // Tab 5: Users, Admins & Audit Log
  'admin.users.title': '普通用户管理 (Workspace Users)',
  'admin.users.oidcDesc': '当前使用 OIDC 单点登录，账号通过 IdP 的 Email Claim 校验；管理员仍可在下方预先建档或禁用特定用户。',
  'admin.users.localDesc': '当前使用本地认证模式，普通用户须通过「邮箱 + 密码」登录，禁用后将立即无法访问个人工作区与 DSH。',
  'admin.users.oidcBadge': 'OIDC 兼容模式',
  'admin.users.localBadge': '本地密码认证',
  'admin.users.emailPlaceholder': '用户邮箱 *',
  'admin.users.namePlaceholder': '姓名 / 备注 (可选)',
  'admin.users.pwPlaceholderOidc': '本地密码 (可选)',
  'admin.users.pwPlaceholderLocal': '初始密码 (至少6位) *',
  'admin.users.pwGenTitle': '生成随机密码',
  'admin.users.pwGenShort': '随机',
  'admin.users.addBtn': '添加用户',
  'admin.users.empty': '暂无普通用户，可在上方创建或通过分配新沙箱自动建档。',
  'admin.users.oidcPlusPw': 'OIDC + 已设本地密码',
  'admin.users.oidcOnly': 'OIDC 认证',
  'admin.users.pwSet': '已设密码',
  'admin.users.pwUnset': '未设密码',
  'admin.users.sandboxCount': '{count} 个沙箱',
  'admin.users.resetPw': '重置密码',
  'admin.users.setPw': '设置密码',
  'admin.users.disableBtn': '禁用',
  'admin.users.enableBtn': '启用',
  'admin.users.deleteDisabledTip': '请先删除该用户名下的沙箱',
  'admin.users.deleteTip': '删除用户',
  'admin.admins.title': '平台管理员 (Platform Admins)',
  'admin.admins.desc': '拥有管理控制台权限与沙箱分配权限的管理员列表。',
  'admin.admins.emailPlaceholder': '管理员邮箱...',
  'admin.admins.namePlaceholder': '显示名称 (可选)',
  'admin.admins.addBtn': '添加',
  'admin.audit.title': '平台操作审计日志 (Audit Log)',
  'admin.audit.desc': '最近 25 条沙箱生命周期与模板变更记录。',
  'admin.audit.empty': '暂无审计日志记录',

  // Dialogs
  'dialog.provision.title': '分配新沙箱工作区 (管理员创建)',
  'dialog.provision.desc': '选择环境模板后将自动带出该模板绑定的 Docker 镜像、资源配额、预装插件与初始化脚本。',
  'dialog.provision.emailLabel': '归属员工邮箱 *',
  'dialog.provision.nameLabel': '员工姓名 / 备注',
  'dialog.provision.namePlaceholder': '例如：张三 (AI 研发)',
  'dialog.provision.pwLabel': '用户初始登录密码 (仅首次建档或尚未设密码时写入，可选)',
  'dialog.provision.pwPlaceholder': '至少 6 位，若用户已有密码可留空',
  'dialog.provision.pwGenBtn': '随机生成',
  'dialog.provision.templateLabel': '选择镜像与环境模板 *',
  'dialog.provision.slugLabel': '自定义二级目录标识 (Slug，留空自动按邮箱生成)',
  'dialog.provision.slugPlaceholder': '例如：alice -> /s/alice/dsh/',
  'dialog.provision.repoLabel': 'Docker 镜像仓库 (Image Repo)',
  'dialog.provision.tagLabel': '镜像 Tag',
  'dialog.provision.cpuLabel': 'CPU 核数限制 (vCPU)',
  'dialog.provision.memLabel': '内存限制 (如 2g, 4g, 8g)',
  'dialog.provision.llmLabel': '注入默认 LLM 模型凭证 (可选)',
  'dialog.provision.llmNone': '(不注入，由用户在沙箱内配置)',
  'dialog.provision.pluginsLabel': '预装自托管插件 (逗号分隔)',
  'dialog.provision.repoUrlLabel': '首次启动自动 Git Clone 仓库地址 (可选)',
  'dialog.provision.initScriptLabel': '首次启动初始化脚本 (`SANDBOX_INIT_SCRIPT`)',
  'dialog.provision.submitting': '正在创建容器并等待健康检查...',
  'dialog.provision.submit': '立即创建并分配沙箱',

  'dialog.template.editTitle': '编辑模板：{name}',
  'dialog.template.createTitle': '新建镜像与环境模板',
  'dialog.template.desc': '定义标准的 Agent OS 镜像、资源规格、预装插件与初始化脚本，供管理员分配沙箱时一键选用。',
  'dialog.template.keyLabel': '模板唯一标识 (Key，小写字母与连字符) *',
  'dialog.template.keyPlaceholder': '例如：ai-researcher',
  'dialog.template.nameLabel': '模板显示名称 *',
  'dialog.template.namePlaceholder': '例如：AI 算法研发环境',
  'dialog.template.descLabel': '模板功能描述',
  'dialog.template.descPlaceholder': '描述该模板包含的工具链、适用团队或预置服务...',
  'dialog.template.localPickLabel': '从本机已有 Docker 镜像快速选择',
  'dialog.template.repoLabel': 'Docker 镜像仓库 (`image_repo`) *',
  'dialog.template.tagLabel': 'Docker 镜像 Tag (`image_tag`) *',
  'dialog.template.cpuLabel': '默认 CPU 配额 (vCPU)',
  'dialog.template.memLabel': '默认内存配额 (如 2g, 4g, 8g)',
  'dialog.template.pluginsLabel': '自动预装的 DSH 插件 (逗号分隔，如 file-manager)',
  'dialog.template.initScriptLabel': '工作区首次启动初始化脚本 (`init_script`，以 workspace 用户在 `/home/workspace` 执行)',
  'dialog.template.envJsonLabel': '默认容器环境变量 JSON (`default_env_json`)',
  'dialog.template.submit': '保存模板',

  'dialog.editSandbox.title': '调整沙箱配置：{slug}',
  'dialog.editSandbox.desc': '动态更新容器 CPU/内存限制，或切换绑定的镜像版本与 LLM 模型配置（保留用户数据卷）。',
  'dialog.editSandbox.cpuLabel': 'CPU 限制 (vCPU)',
  'dialog.editSandbox.memLabel': '内存限制',
  'dialog.editSandbox.repoLabel': '镜像仓库 (`image_repo`)',
  'dialog.editSandbox.tagLabel': '镜像 Tag (`image_tag`)',
  'dialog.editSandbox.llmLabel': '绑定 LLM 模型凭证',
  'dialog.editSandbox.llmNone': '(不绑定)',
  'dialog.editSandbox.submitting': '正在应用更改...',
  'dialog.editSandbox.submit': '保存并生效',

  'dialog.logs.title': '容器实时日志：dsh-sbx-{slug}',
  'dialog.logs.desc': '显示 supervisord、Caddy、dsh-token 与 DeepSeek Harness 标准输出日志。',
  'dialog.logs.refresh': '刷新',
  'dialog.logs.copy': '复制日志',
  'dialog.logs.loading': '正在读取容器日志...',

  'dialog.destroy.title': '确认销毁沙箱：{slug}',
  'dialog.destroy.owner': '归属用户：{email}',
  'dialog.destroy.purgeBefore': '同时永久删除持久化数据卷 (',
  'dialog.destroy.purgeAfter': '，不可恢复)',
  'dialog.destroy.confirm': '确认销毁',

  'dialog.resetPw.title': '设置 / 重置用户密码：{email}',
  'dialog.resetPw.desc': '设置后，用户在非 OIDC 模式下须使用该密码登录个人工作区。',
  'dialog.resetPw.label': '新密码 (至少 6 位) *',
  'dialog.resetPw.placeholder': '输入新密码...',
  'dialog.resetPw.submit': '确认设置',

  // User Portal (/my)
  'portal.loadFailed': '加载个人工作区失败',
  'portal.actionRunning': '正在执行{action}...',
  'portal.actionSuccess': '操作成功',
  'portal.pwMismatch': '两次输入的新密码不一致',
  'portal.pwChanged': '登录密码修改成功',
  'portal.bannerTitle': '我的远程 Agent OS 工作区',
  'portal.accountPrefix': '当前账号：',
  'portal.accountSuffix': ' · 工作区由平台管理员统一创建与分配',
  'portal.changePwBtn': '修改密码',
  'portal.refreshBtn': '刷新状态',
  'portal.loadingList': '正在查询您名下的沙箱工作区...',
  'portal.emptyTitle': '暂未分配远程 Agent OS 工作区',
  'portal.emptyBefore': '当前平台采用管理员集中分配策略，个人不支持自助新建工作区。请联系平台管理员（',
  'portal.emptyAfter': '）为您开通专属沙箱环境。',
  'portal.entryLabel': '入口: /s/{slug}/dsh/',
  'portal.appsPrefix': '应用: /s/{slug}/apps/',
  'portal.specLabel': '规格: {cpu} vCPU / {memory}',
  'portal.openBtn': '进入 Agent OS 工作区',
  'portal.startBtn': '启动',
  'portal.stopBtn': '停止',
  'portal.restartBtn': '重启',
  'portal.logsBtn': '查看日志',
  'portal.backupBtn': '下载备份 (.tar)',
  'portal.logsTitle': '工作区运行日志：dsh-sbx-{slug}',
  'portal.logsDesc': '显示您的远程工作区容器实时运行日志。',
  'portal.logsCopied': '日志已复制到剪贴板',
  'portal.pwDialogTitle': '修改个人登录密码',
  'portal.pwDialogDesc': '账号：{email}',
  'portal.currentPwLabel': '当前密码 *',
  'portal.newPwLabel': '新密码 (至少 6 位) *',
  'portal.confirmPwLabel': '确认新密码 *',
  'portal.submitting': '提交中...',
  'portal.pwSubmit': '保存新密码',
} as const

export type MessageKey = keyof typeof zhCN

const en: Record<MessageKey, string> = {
  // App shell & header
  'app.documentTitle': 'DSH Sandbox Cloud · Remote Agent OS Hosting Platform',
  'app.subtitle': 'DeepSeek Harness Remote Agent OS Hosting Platform',
  'app.checkingSession': 'Loading DSH Sandbox Cloud...',
  'app.nav.admin': 'Admin Console',
  'app.nav.my': 'My Workspaces',
  'app.role.admin': 'Admin',
  'app.role.user': 'User',
  'app.logout': 'Sign Out',
  'app.loggedOut': 'Signed out',
  'app.localeToggleLabel': 'Switch language',

  // Login view
  'login.title': 'Sign in to DSH Sandbox Cloud',
  'login.subtitle': 'All workspaces are provisioned by platform administrators, delivering 24/7 isolated DeepSeek Harness Agent OS environments.',
  'login.badgeOidc': 'SSO / OIDC',
  'login.badgeLocal': 'Local Auth',
  'login.disabledBanner': 'This account has been disabled by a platform administrator. Contact your admin to re-enable access.',
  'login.oidcButton': 'Sign in with Enterprise SSO (OIDC)',
  'login.modeAdmin': 'Admin Console',
  'login.modeUser': 'User Workspace',
  'login.adminEmailLabel': 'Admin Email',
  'login.userEmailLabel': 'User Email',
  'login.tokenLabel': 'Admin Token (MANAGER_ADMIN_TOKEN)',
  'login.tokenPlaceholder': 'Enter admin token...',
  'login.passwordLabel': 'Password',
  'login.passwordPlaceholder': 'Enter the password configured by your admin...',
  'login.submitting': 'Verifying...',
  'login.submitAdmin': 'Enter Admin Console',
  'login.submitUser': 'Sign in to My Workspace',
  'login.success': 'Signed in successfully',
  'login.failed': 'Sign-in failed',

  // Common actions & states
  'common.copied': 'Copied to clipboard',
  'common.refresh': 'Refresh',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.saving': 'Saving...',
  'common.active': 'Active',
  'common.disabled': 'Disabled',
  'common.inactive': 'Inactive',
  'common.unknown': 'Unknown',

  // Sandbox statuses & actions
  'status.running': 'running',
  'status.stopped': 'stopped',
  'status.exited': 'stopped',
  'status.creating': 'creating',
  'status.starting': 'starting',
  'status.restarting': 'restarting',
  'status.paused': 'paused',
  'status.error': 'error',
  'action.start': 'start',
  'action.stop': 'stop',
  'action.restart': 'restart',
  'action.recreate': 'recreate',

  // Admin notifications
  'admin.loadFailed': 'Failed to load platform data',
  'admin.sandboxProvisioned': 'Sandbox provisioned for {email}',
  'admin.sandboxCreateFailed': 'Failed to provision sandbox',
  'admin.sandboxActionRunning': 'Running {action} on {slug}...',
  'admin.sandboxActionSuccess': 'Sandbox {slug} {action} succeeded',
  'admin.sandboxUpdated': 'Sandbox {slug} configuration updated',
  'admin.sandboxDestroyed': 'Sandbox {slug} destroyed',
  'admin.noLogs': '(No log output yet)',
  'admin.logsLoadFailed': 'Failed to load logs: {message}',
  'admin.templateUpdated': 'Template "{name}" updated',
  'admin.templateCreated': 'Template "{name}" created',
  'admin.templateDeleteConfirm': 'Delete template "{name} ({key})"?',
  'admin.templateDeleted': 'Template {key} deleted',
  'admin.pluginsSyncing': 'Syncing plugin registry index to all running sandboxes...',
  'admin.pluginsSynced': 'Synced plugin registry index to {count} running sandbox(es)',
  'admin.pluginsSyncFailed': 'Sync failed',
  'admin.llmSaved': 'LLM profile saved',
  'admin.llmDeleted': 'LLM profile deleted',
  'admin.userAdded': 'User {email} added',
  'admin.userEnabled': 'Enabled user {email}',
  'admin.userDisabled': 'Disabled user {email}',
  'admin.userDeleted': 'Deleted user {email}',
  'admin.adminAdded': 'Platform admin added',
  'admin.passwordUpdated': 'Updated password for {email}',

  // Admin KPI cards & tabs
  'admin.kpi.sandboxesTitle': 'Running Sandboxes / Total',
  'admin.kpi.sandboxesSubPrefix': 'Single-domain subpath ',
  'admin.kpi.quotaTitle': 'Allocated Compute',
  'admin.kpi.quotaUnit': 'vCPU Cores',
  'admin.kpi.quotaSub': 'Default spec: {cpus} C / {memory}',
  'admin.kpi.templatesTitle': 'Images & Templates',
  'admin.kpi.templatesUnit': 'available',
  'admin.kpi.templatesSub': 'Local images: {count} tag(s)',
  'admin.kpi.pluginsTitle': 'Self-Hosted Plugins',
  'admin.kpi.pluginsUnit': 'built-in',
  'admin.kpi.pluginsSubBefore': 'Built-in ',
  'admin.kpi.pluginsSubAfter': ' & npm Packument',

  'admin.tabs.sandboxes': 'Sandboxes',
  'admin.tabs.templates': 'Templates',
  'admin.tabs.plugins': 'Plugins',
  'admin.tabs.llm': 'LLM Profiles',
  'admin.tabs.users': 'Users & Audit',
  'admin.newTemplateBtn': 'New Template',
  'admin.provisionSandboxBtn': 'Provision Sandbox',

  // Tab 1: Sandboxes
  'admin.sandboxes.bannerStrong': 'Admin-Managed Mode:',
  'admin.sandboxes.bannerText': 'Users cannot self-provision workspaces; all sandboxes are created and assigned by administrators from templates.',
  'admin.sandboxes.gatewayPrefix': 'Gateway Routing: Traefik Subpath (',
  'admin.sandboxes.gatewaySuffix': ')',
  'admin.sandboxes.colWorkspace': 'Workspace / Owner',
  'admin.sandboxes.colTemplate': 'Template & Image',
  'admin.sandboxes.colStatus': 'Status & Subpath Route',
  'admin.sandboxes.colResources': 'Live Resources (CPU / RAM)',
  'admin.sandboxes.colActions': 'Actions',
  'admin.sandboxes.empty': 'No sandboxes provisioned yet. Click "Provision Sandbox" in the top right to create one.',
  'admin.sandboxes.quotaPrefix': 'Quota: {cpu} vCPU · {memory} RAM · Vol ',
  'admin.sandboxes.notRunning': 'Container not running',
  'admin.sandboxes.openWorkspace': 'Open',
  'admin.sandboxes.stopTooltip': 'Stop sandbox',
  'admin.sandboxes.startTooltip': 'Start sandbox',
  'admin.sandboxes.restartTooltip': 'Restart sandbox',
  'admin.sandboxes.logsTooltip': 'View live logs',
  'admin.sandboxes.editTooltip': 'Edit spec / image / LLM',
  'admin.sandboxes.backupTooltip': 'Export home directory backup (.tar)',
  'admin.sandboxes.destroyTooltip': 'Destroy sandbox',

  // Tab 2: Templates
  'admin.templates.bannerStrong': 'Image & Workspace Templates:',
  'admin.templates.bannerText': 'Each template binds a Docker image (`image_repo:image_tag`), default CPU/memory quotas, pre-installed plugins, env vars, and a first-boot init script (`SANDBOX_INIT_SCRIPT`).',
  'admin.templates.newShortBtn': 'New Template',
  'admin.templates.builtinBadge': 'Built-in',
  'admin.templates.noDescription': 'No description',
  'admin.templates.imageLabel': 'Docker Image',
  'admin.templates.quotaLabel': 'Default Compute Quota',
  'admin.templates.pluginsLabel': 'Pre-installed DSH Plugins',
  'admin.templates.pluginsNone': '(None)',
  'admin.templates.initScriptLabel': 'First-boot Init Script (`init_script`):',
  'admin.templates.provisionBtn': 'Provision from Template',
  'admin.templates.editBtn': 'Edit',
  'admin.templates.localImagesTitle': 'Host Local Docker Images',
  'admin.templates.localImagesDesc': 'Templates or sandboxes can bind any local image below, or build custom images via `docker build` (e.g. with `INSTALL_BROWSER=true` or `INSTALL_TOOLCHAIN=true`).',

  // Tab 3: Plugins
  'admin.plugins.title': 'Self-Hosted DSH Plugin Index & Built-in npm Registry',
  'admin.plugins.desc': 'The host `plugins/` directory is hot-mounted read-only. `dsh-manager` incrementally repacks `.tgz` bundles and synthesizes `index.json` (with inline Base64 icons and live versions) based on `mtime_ns`—no Manager rebuild or restart needed.',
  'admin.plugins.syncBtn': 'Sync Index to Running Sandboxes',
  'admin.plugins.indexUrlLabel': 'Discover Plugin Index URL (`DSH_PLUGIN_INDEX_URL`)',
  'admin.plugins.npmUrlLabel': 'Built-in Read-Only npm Registry URL',
  'admin.plugins.downloadTgz': 'Download .tgz',
  'admin.plugins.viewPackument': 'View npm Packument',

  // Tab 4: LLM Profiles
  'admin.llm.addTitle': 'Add LLM Profile',
  'admin.llm.addDesc': 'API keys are encrypted at rest using server `SECRET_KEY` and can be automatically injected into DeepSeek Harness during provisioning.',
  'admin.llm.nameLabel': 'Profile Name',
  'admin.llm.namePlaceholder': 'e.g. DeepSeek Official API',
  'admin.llm.baseUrlLabel': 'OpenAI-Compatible Base URL',
  'admin.llm.modelLabel': 'Model ID',
  'admin.llm.apiKeyLabel': 'API Key',
  'admin.llm.saveBtn': 'Save LLM Profile',
  'admin.llm.listTitle': 'Saved LLM Profiles',
  'admin.llm.listDesc': 'Attach any saved profile below when creating or updating sandboxes.',
  'admin.llm.empty': 'No saved LLM profiles yet',

  // Tab 5: Users, Admins & Audit Log
  'admin.users.title': 'Workspace Users',
  'admin.users.oidcDesc': 'OIDC SSO is enabled. Accounts are verified via the IdP Email Claim; admins can still pre-provision or disable specific users below.',
  'admin.users.localDesc': 'Local auth mode is enabled. Users sign in with email + password; disabled users lose access to their workspaces and DSH immediately.',
  'admin.users.oidcBadge': 'OIDC SSO',
  'admin.users.localBadge': 'Local Password Auth',
  'admin.users.emailPlaceholder': 'User email *',
  'admin.users.namePlaceholder': 'Name / note (optional)',
  'admin.users.pwPlaceholderOidc': 'Local password (optional)',
  'admin.users.pwPlaceholderLocal': 'Initial password (min 6 chars) *',
  'admin.users.pwGenTitle': 'Generate random password',
  'admin.users.pwGenShort': 'Random',
  'admin.users.addBtn': 'Add User',
  'admin.users.empty': 'No workspace users yet. Add one above or provision a sandbox to auto-create.',
  'admin.users.oidcPlusPw': 'OIDC + Local Password',
  'admin.users.oidcOnly': 'OIDC',
  'admin.users.pwSet': 'Password Set',
  'admin.users.pwUnset': 'No Password',
  'admin.users.sandboxCount': '{count} sandbox(es)',
  'admin.users.resetPw': 'Reset Password',
  'admin.users.setPw': 'Set Password',
  'admin.users.disableBtn': 'Disable',
  'admin.users.enableBtn': 'Enable',
  'admin.users.deleteDisabledTip': 'Delete this user\'s sandboxes first',
  'admin.users.deleteTip': 'Delete user',
  'admin.admins.title': 'Platform Admins',
  'admin.admins.desc': 'Administrators with permission to manage templates, users, and provision sandboxes.',
  'admin.admins.emailPlaceholder': 'Admin email...',
  'admin.admins.namePlaceholder': 'Display name (optional)',
  'admin.admins.addBtn': 'Add',
  'admin.audit.title': 'Audit Log',
  'admin.audit.desc': 'Latest 25 sandbox lifecycle and template change events.',
  'admin.audit.empty': 'No audit log entries yet',

  // Dialogs
  'dialog.provision.title': 'Provision New Sandbox (Admin)',
  'dialog.provision.desc': 'Selecting an environment template auto-fills its Docker image, compute quota, pre-installed plugins, and init script.',
  'dialog.provision.emailLabel': 'Owner Email *',
  'dialog.provision.nameLabel': 'Display Name / Note',
  'dialog.provision.namePlaceholder': 'e.g. Alice (AI R&D)',
  'dialog.provision.pwLabel': 'Initial User Password (set only on first create or if unset, optional)',
  'dialog.provision.pwPlaceholder': 'Min 6 chars; leave blank if already set',
  'dialog.provision.pwGenBtn': 'Generate',
  'dialog.provision.templateLabel': 'Image & Environment Template *',
  'dialog.provision.slugLabel': 'Custom Subpath Slug (auto-generated from email if blank)',
  'dialog.provision.slugPlaceholder': 'e.g. alice -> /s/alice/dsh/',
  'dialog.provision.repoLabel': 'Docker Image Repo',
  'dialog.provision.tagLabel': 'Image Tag',
  'dialog.provision.cpuLabel': 'CPU Limit (vCPU)',
  'dialog.provision.memLabel': 'Memory Limit (e.g. 2g, 4g, 8g)',
  'dialog.provision.llmLabel': 'Inject Default LLM Profile (optional)',
  'dialog.provision.llmNone': '(None — configure inside sandbox)',
  'dialog.provision.pluginsLabel': 'Pre-install Self-Hosted Plugins (comma-separated)',
  'dialog.provision.repoUrlLabel': 'First-boot Git Clone Repo URL (optional)',
  'dialog.provision.initScriptLabel': 'First-boot Init Script (`SANDBOX_INIT_SCRIPT`)',
  'dialog.provision.submitting': 'Creating container & waiting for health check...',
  'dialog.provision.submit': 'Create & Provision Sandbox',

  'dialog.template.editTitle': 'Edit Template: {name}',
  'dialog.template.createTitle': 'New Image & Environment Template',
  'dialog.template.desc': 'Define standard Agent OS images, compute specs, pre-installed plugins, and init scripts for one-click sandbox provisioning.',
  'dialog.template.keyLabel': 'Template Key (lowercase letters & hyphens) *',
  'dialog.template.keyPlaceholder': 'e.g. ai-researcher',
  'dialog.template.nameLabel': 'Display Name *',
  'dialog.template.namePlaceholder': 'e.g. AI Research Workspace',
  'dialog.template.descLabel': 'Description',
  'dialog.template.descPlaceholder': 'Describe included toolchains, target teams, or preconfigured services...',
  'dialog.template.localPickLabel': 'Quick-select from Host Local Docker Images',
  'dialog.template.repoLabel': 'Docker Image Repo (`image_repo`) *',
  'dialog.template.tagLabel': 'Docker Image Tag (`image_tag`) *',
  'dialog.template.cpuLabel': 'Default CPU Quota (vCPU)',
  'dialog.template.memLabel': 'Default Memory Quota (e.g. 2g, 4g, 8g)',
  'dialog.template.pluginsLabel': 'Pre-installed DSH Plugins (comma-separated, e.g. file-manager)',
  'dialog.template.initScriptLabel': 'First-boot Init Script (`init_script`, runs as `workspace` in `/home/workspace`)',
  'dialog.template.envJsonLabel': 'Default Container Env JSON (`default_env_json`)',
  'dialog.template.submit': 'Save Template',

  'dialog.editSandbox.title': 'Edit Sandbox Spec: {slug}',
  'dialog.editSandbox.desc': 'Dynamically update container CPU/memory limits or switch image tags and LLM profile while preserving persistent volumes.',
  'dialog.editSandbox.cpuLabel': 'CPU Limit (vCPU)',
  'dialog.editSandbox.memLabel': 'Memory Limit',
  'dialog.editSandbox.repoLabel': 'Image Repo (`image_repo`)',
  'dialog.editSandbox.tagLabel': 'Image Tag (`image_tag`)',
  'dialog.editSandbox.llmLabel': 'LLM Profile',
  'dialog.editSandbox.llmNone': '(None)',
  'dialog.editSandbox.submitting': 'Applying changes...',
  'dialog.editSandbox.submit': 'Save & Apply',

  'dialog.logs.title': 'Container Logs: dsh-sbx-{slug}',
  'dialog.logs.desc': 'Displays stdout/stderr from supervisord, Caddy, dsh-token, and DeepSeek Harness.',
  'dialog.logs.refresh': 'Refresh',
  'dialog.logs.copy': 'Copy Logs',
  'dialog.logs.loading': 'Loading container logs...',

  'dialog.destroy.title': 'Destroy Sandbox: {slug}',
  'dialog.destroy.owner': 'Owner: {email}',
  'dialog.destroy.purgeBefore': 'Also permanently delete persistent data volume (',
  'dialog.destroy.purgeAfter': ', irreversible)',
  'dialog.destroy.confirm': 'Confirm Destroy',

  'dialog.resetPw.title': 'Set / Reset Password: {email}',
  'dialog.resetPw.desc': 'In local auth mode, the user will sign in with this password to access their personal workspace.',
  'dialog.resetPw.label': 'New Password (min 6 chars) *',
  'dialog.resetPw.placeholder': 'Enter new password...',
  'dialog.resetPw.submit': 'Confirm Password',

  // User Portal (/my)
  'portal.loadFailed': 'Failed to load personal workspaces',
  'portal.actionRunning': 'Running {action}...',
  'portal.actionSuccess': 'Action succeeded',
  'portal.pwMismatch': 'New passwords do not match',
  'portal.pwChanged': 'Password updated successfully',
  'portal.bannerTitle': 'My Remote Agent OS Workspaces',
  'portal.accountPrefix': 'Signed in as ',
  'portal.accountSuffix': ' · Workspaces are provisioned and managed by platform administrators',
  'portal.changePwBtn': 'Change Password',
  'portal.refreshBtn': 'Refresh',
  'portal.loadingList': 'Loading your assigned workspaces...',
  'portal.emptyTitle': 'No Remote Agent OS Workspaces Assigned',
  'portal.emptyBefore': 'This platform uses centralized admin provisioning; self-creation is disabled. Contact a platform administrator (',
  'portal.emptyAfter': ') to provision your dedicated sandbox.',
  'portal.entryLabel': 'Entry: /s/{slug}/dsh/',
  'portal.appsPrefix': 'Apps: /s/{slug}/apps/',
  'portal.specLabel': 'Spec: {cpu} vCPU / {memory}',
  'portal.openBtn': 'Open Agent OS Workspace',
  'portal.startBtn': 'Start',
  'portal.stopBtn': 'Stop',
  'portal.restartBtn': 'Restart',
  'portal.logsBtn': 'View Logs',
  'portal.backupBtn': 'Backup (.tar)',
  'portal.logsTitle': 'Workspace Logs: dsh-sbx-{slug}',
  'portal.logsDesc': 'Displays live stdout/stderr container logs for your remote workspace.',
  'portal.logsCopied': 'Logs copied to clipboard',
  'portal.pwDialogTitle': 'Change Password',
  'portal.pwDialogDesc': 'Account: {email}',
  'portal.currentPwLabel': 'Current Password *',
  'portal.newPwLabel': 'New Password (min 6 chars) *',
  'portal.confirmPwLabel': 'Confirm New Password *',
  'portal.submitting': 'Submitting...',
  'portal.pwSubmit': 'Save Password',
}

export const translations: Record<Locale, Record<MessageKey, string>> = {
  'zh-CN': zhCN,
  en,
}

/**
 * Translate a container status code when known, falling back to the raw value.
 */
export function localizeStatus(locale: Locale, status: string): string {
  const key = `status.${status}`
  const dict = translations[locale] ?? translations[DEFAULT_LOCALE]
  if (Object.prototype.hasOwnProperty.call(dict, key)) {
    return dict[key as MessageKey]
  }
  return status
}

/**
 * Translate a container lifecycle action name.
 */
export function localizeAction(
  locale: Locale,
  action: 'start' | 'stop' | 'restart' | 'recreate',
): string {
  return translate(locale, `action.${action}` as MessageKey)
}

/**
 * Translate a message key for the active locale with optional `{name}` interpolation.
 */
export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number | null | undefined>,
): string {
  const dict = translations[locale] ?? translations[DEFAULT_LOCALE]
  const template = dict[key] ?? translations[DEFAULT_LOCALE][key] ?? key
  if (!vars) return template
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) {
      return String(vars[name] ?? '')
    }
    return match
  })
}
