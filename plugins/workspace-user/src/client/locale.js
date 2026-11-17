export const en = {
  loading: 'Loading account…',
  unknownUser: 'Workspace User',
  adminBadge: 'Admin',
  inspectBadge: 'Inspect',
  inspectOwnerPrefix: 'Owner: ',
  inspectNotice: 'Admin inspection · Viewing {{owner}}\'s workspace',
  roleAdmin: 'Platform Administrator',
  roleMember: 'Workspace Member',
  menuAria: 'Workspace user menu',
  settings: 'Settings',
  backToMy: 'Back to My Workspaces',
  adminConsole: 'Admin Console',
  signOut: 'Sign Out',
  tooltipInspect: '{{viewer}} ({{email}}) · Admin inspecting {{owner}}',
  tooltipNormal: '{{viewer}} ({{email}})',
}

export const zh = {
  loading: '读取当前账号…',
  unknownUser: '工作区用户',
  adminBadge: '管理员',
  inspectBadge: '代管访问',
  inspectOwnerPrefix: '归属 ',
  inspectNotice: '管理员代管访问 · 当前工作区归属于 {{owner}}',
  roleAdmin: '平台管理员',
  roleMember: '工作区成员',
  menuAria: '当前用户与平台导航菜单',
  settings: '设置',
  backToMy: '返回我的工作区',
  adminConsole: '管理控制台',
  signOut: '退出登录',
  tooltipInspect: '{{viewer}} ({{email}}) · 管理员代管访问 {{owner}}',
  tooltipNormal: '{{viewer}} ({{email}})',
}

export function pickLocale(rawLocale) {
  const code = String(rawLocale || '').toLowerCase()
  if (code.startsWith('zh')) return 'zh'
  if (code.startsWith('en')) return 'en'
  if (typeof navigator !== 'undefined' && String(navigator.language || '').toLowerCase().startsWith('zh')) {
    return 'zh'
  }
  return 'en'
}

export function createTranslator(localeRef) {
  return (key, vars = {}) => {
    const lang = pickLocale(localeRef)
    const table = lang === 'zh' ? zh : en
    let text = table[key] ?? en[key] ?? key
    for (const [varName, value] of Object.entries(vars)) {
      text = text.replaceAll(`{{${varName}}}`, String(value ?? ''))
    }
    return text
  }
}
