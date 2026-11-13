import React, { useEffect, useState, useCallback } from 'react'
import {
  Terminal,
  Plus,
  Play,
  Square,
  RotateCw,
  Trash2,
  ExternalLink,
  Download,
  FileCode2,
  Cpu,
  HardDrive,
  Layers,
  Package,
  KeyRound,
  Users,
  ShieldCheck,
  Copy,
  Check,
  RefreshCw,
  Sliders,
  FileText,
  LogOut,
  Box,
  Sparkles,
  AlertCircle,
  Lock,
  Edit3,
} from 'lucide-react'
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Input,
  Textarea,
  Select,
  Label,
  Progress,
  Dialog,
  cn,
} from './components/ui'

interface AuthMe {
  authenticated: boolean
  email: string
  admin: boolean
  user_status?: string
  has_password?: boolean
  auth_mode: string
  sandbox_auth_mode: string
  default_admin_email: string
  public_url: string
  plugin_index_url: string
}

interface SandboxItem {
  id: string
  email: string
  display_name: string | null
  slug: string
  port: number
  container_id: string | null
  volume_name: string
  image_repo: string
  image_tag: string
  template: string
  init_repo_url: string | null
  auto_install_plugins: string | null
  llm_profile_id: string | null
  llm_profile_name: string | null
  cpu_limit: number
  memory_limit: string
  status: string
  url: string
  created_at: string
  last_seen_at: string | null
}

interface SandboxStats {
  cpu_percent: number
  memory_usage_mb: number
  memory_limit_mb: number
}

interface TemplateItem {
  id: string
  key: string
  name: string
  description: string | null
  image_repo: string
  image_tag: string
  default_cpu_limit: number
  default_memory_limit: string
  auto_install_plugins: string | null
  init_script: string | null
  default_env_json: string | null
  is_builtin: boolean
  updated_at: string
}

interface LlmProfileItem {
  id: string
  name: string
  base_url: string
  model: string
}

interface PluginItem {
  slug: string
  package_name: string
  version: string
  display_name_zh: string
  display_name_en: string
  description_zh: string
  description_en: string
  author: string
  category: string
  icon_url: string | null
  tarball_url: string
  npm_packument_url: string
  install_command: string
}

interface LocalImageItem {
  full_name: string
  repo: string
  tag: string
  id: string
  size_mb: number
}

interface OverviewData {
  total_sandboxes: number
  running_sandboxes: number
  stopped_sandboxes: number
  allocated_cpus: number
  users_count: number
  templates_count: number
  plugins_count: number
  default_image_repo: string
  default_image_tag: string
  default_cpus: number
  default_memory: string
  routing_mode: string
  sandbox_auth_mode: string
  manager_auth_mode: string
  plugin_index_url: string
  local_images: LocalImageItem[]
  audit_logs: Array<{
    id: string
    actor: string | null
    action: string
    target: string | null
    detail: string | null
    created_at: string
  }>
}

interface UserItem {
  id: string
  email: string
  display_name: string | null
  role: string
  status: string
  has_password: boolean
  sandbox_count: number
  created_at?: string | null
}

interface AdminItem {
  email: string
  display_name: string | null
  active: boolean
  created_at: string
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  })
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const data = await res.json()
      if (typeof data.detail === 'string') msg = data.detail
      else if (Array.isArray(data.detail)) msg = data.detail.map((e: any) => e.msg).join('; ')
    } catch {
      // ignore
    }
    throw new Error(msg)
  }
  return res.json()
}

export default function App() {
  const [auth, setAuth] = useState<AuthMe | null>(null)
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [view, setView] = useState<'admin' | 'my' | 'login'>('admin')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const notify = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type })
    setTimeout(() => setToast(null), 4000)
  }, [])

  const loadAuth = useCallback(async () => {
    try {
      const me = await apiFetch<AuthMe>('/api/auth/me')
      setAuth(me)
      const path = window.location.pathname
      if (!me.authenticated) {
        setView('login')
      } else if (path.startsWith('/my') || !me.admin) {
        setView('my')
      } else {
        setView('admin')
      }
    } catch {
      setView('login')
    } finally {
      setLoadingAuth(false)
    }
  }, [])

  useEffect(() => {
    loadAuth()
  }, [loadAuth])

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' })
    window.history.pushState({}, '', '/login')
    await loadAuth()
  }

  const switchView = (target: 'admin' | 'my') => {
    window.history.pushState({}, '', target === 'admin' ? '/admin' : '/my')
    setView(target)
  }

  if (loadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-400 text-sm">
        <RefreshCw className="h-4 w-4 animate-spin mr-2" /> 正在加载 DSH Sandbox Cloud...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {toast && (
        <div
          className={cn(
            'fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-medium shadow-2xl animate-in slide-in-from-bottom-3',
            toast.type === 'error'
              ? 'border-rose-500/40 bg-rose-950/95 text-rose-200'
              : 'border-emerald-500/40 bg-emerald-950/95 text-emerald-200',
          )}
        >
          {toast.type === 'error' ? (
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
          ) : (
            <Check className="h-4 w-4 text-emerald-400 shrink-0" />
          )}
          <span>{toast.text}</span>
        </div>
      )}

      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
              <Terminal className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm tracking-tight">DSH Sandbox Cloud</span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  Traefik v3.7 · Subpath Gateway
                </Badge>
              </div>
              <p className="text-[11px] text-zinc-400 hidden sm:block">
                DeepSeek Harness 远程 Agent 操作系统托管平台
              </p>
            </div>
          </div>

          {auth?.authenticated && (
            <div className="flex items-center gap-2">
              {auth.admin && (
                <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-900/80 p-0.5">
                  <button
                    onClick={() => switchView('admin')}
                    className={cn(
                      'px-2.5 py-1 text-xs rounded-md transition-colors cursor-pointer',
                      view === 'admin'
                        ? 'bg-zinc-800 text-zinc-100 font-medium'
                        : 'text-zinc-400 hover:text-zinc-200',
                    )}
                  >
                    管理控制台
                  </button>
                  <button
                    onClick={() => switchView('my')}
                    className={cn(
                      'px-2.5 py-1 text-xs rounded-md transition-colors cursor-pointer',
                      view === 'my'
                        ? 'bg-zinc-800 text-zinc-100 font-medium'
                        : 'text-zinc-400 hover:text-zinc-200',
                    )}
                  >
                    我的工作区
                  </button>
                </div>
              )}
              <Badge variant="secondary" className="hidden md:inline-flex">
                {auth.email}
              </Badge>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="h-3.5 w-3.5" />
                退出
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
        {view === 'login' && (
          <LoginView
            auth={auth}
            onSuccess={async (isAdmin) => {
              window.history.pushState({}, '', isAdmin ? '/admin' : '/my')
              await loadAuth()
            }}
            notify={notify}
          />
        )}
        {view === 'admin' && auth?.admin && <AdminConsoleView notify={notify} />}
        {view === 'my' && <UserPortalView auth={auth} notify={notify} />}
      </main>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Login View                                                                 */
/* -------------------------------------------------------------------------- */

function LoginView({
  auth,
  onSuccess,
  notify,
}: {
  auth: AuthMe | null
  onSuccess: (isAdmin: boolean) => void
  notify: (msg: string, type?: 'success' | 'error') => void
}) {
  const [mode, setMode] = useState<'admin' | 'user'>('admin')
  const [email, setEmail] = useState(auth?.default_admin_email || 'admin@example.com')
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const urlError = new URLSearchParams(window.location.search).get('error')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await apiFetch<{ authenticated: boolean; admin: boolean }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email,
          token: mode === 'admin' ? token : undefined,
          password: mode === 'user' ? password : undefined,
          mode,
        }),
      })
      notify('登录成功')
      onSuccess(res.admin)
    } catch (err: any) {
      notify(err.message || '登录失败', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-[72vh] items-center justify-center">
      <Card className="w-full max-w-md border-zinc-800/90 bg-zinc-900/80 shadow-2xl">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">登录 DSH Sandbox Cloud</CardTitle>
            <Badge variant="outline">
              {auth?.auth_mode === 'oidc' ? 'SSO / OIDC' : '本地认证'}
            </Badge>
          </div>
          <CardDescription>
            每个工作区均由平台管理员统一创建与分配，提供可 7×24 小时持续运行的远程 DeepSeek Harness 操作系统环境。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {urlError === 'disabled' && (
            <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-950/60 p-3 text-xs text-rose-200 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
              <span>该账号已被平台管理员禁用，请联系管理员启用后再登录。</span>
            </div>
          )}
          {auth?.auth_mode === 'oidc' ? (
            <div className="space-y-4">
              <Button
                className="w-full"
                onClick={() => {
                  window.location.href = '/auth/oidc/start'
                }}
              >
                <ShieldCheck className="h-4 w-4" />
                使用企业单点登录 (OIDC SSO)
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-950 p-1 border border-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    setMode('admin')
                    setEmail(auth?.default_admin_email || 'admin@example.com')
                  }}
                  className={cn(
                    'rounded-md py-1.5 text-xs font-medium transition-colors cursor-pointer',
                    mode === 'admin'
                      ? 'bg-zinc-800 text-zinc-100 shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-200',
                  )}
                >
                  管理员控制台
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('user')
                    if (email === (auth?.default_admin_email || 'admin@example.com')) {
                      setEmail('')
                    }
                  }}
                  className={cn(
                    'rounded-md py-1.5 text-xs font-medium transition-colors cursor-pointer',
                    mode === 'user'
                      ? 'bg-zinc-800 text-zinc-100 shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-200',
                  )}
                >
                  员工工作区入口
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>{mode === 'admin' ? '管理员邮箱' : '员工邮箱'}</Label>
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@example.com"
                  />
                </div>

                {mode === 'admin' ? (
                  <div className="space-y-1.5">
                    <Label>管理员口令 (MANAGER_ADMIN_TOKEN)</Label>
                    <Input
                      type="password"
                      required
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="输入管理员口令..."
                    />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label>登录密码</Label>
                    <Input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="输入管理员为您设置的登录密码..."
                    />
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting
                    ? '正在验证...'
                    : mode === 'admin'
                      ? '进入管理员控制台'
                      : '登录我的远程工作区'}
                </Button>
              </form>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Admin Console View                                                         */
/* -------------------------------------------------------------------------- */

function AdminConsoleView({
  notify,
}: {
  notify: (msg: string, type?: 'success' | 'error') => void
}) {
  const [activeTab, setActiveTab] = useState<
    'sandboxes' | 'templates' | 'plugins' | 'llm' | 'users'
  >('sandboxes')

  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [sandboxes, setSandboxes] = useState<SandboxItem[]>([])
  const [statsMap, setStatsMap] = useState<Record<string, SandboxStats>>({})
  const [templates, setTemplates] = useState<TemplateItem[]>([])
  const [llmProfiles, setLlmProfiles] = useState<LlmProfileItem[]>([])
  const [pluginsData, setPluginsData] = useState<{
    index_url: string
    npm_registry_url: string
    source_type: string
    auto_install_default: string
    items: PluginItem[]
  } | null>(null)
  const [users, setUsers] = useState<UserItem[]>([])
  const [admins, setAdmins] = useState<AdminItem[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // Modals state
  const [createSbxOpen, setCreateSbxOpen] = useState(false)
  const [sbxForm, setSbxForm] = useState({
    email: '',
    display_name: '',
    initial_password: '',
    slug: '',
    template: 'agent-os',
    image_repo: 'dsh-sandbox',
    image_tag: 'latest',
    cpu_limit: '2.0',
    memory_limit: '4g',
    llm_profile_id: '',
    init_repo_url: '',
    auto_install_plugins: 'file-manager',
    init_script: '',
  })
  const [creatingSbx, setCreatingSbx] = useState(false)

  // Edit Sandbox Modal
  const [editSbx, setEditSbx] = useState<SandboxItem | null>(null)
  const [editSbxForm, setEditSbxForm] = useState({
    cpu_limit: '2.0',
    memory_limit: '4g',
    image_repo: 'dsh-sandbox',
    image_tag: 'latest',
    llm_profile_id: '',
  })
  const [savingSbx, setSavingSbx] = useState(false)

  // Delete Sandbox Modal
  const [deleteSbxTarget, setDeleteSbxTarget] = useState<SandboxItem | null>(null)
  const [purgeVolume, setPurgeVolume] = useState(false)

  // Logs Modal
  const [logsTarget, setLogsTarget] = useState<SandboxItem | null>(null)
  const [logsText, setLogsText] = useState('')
  const [loadingLogs, setLoadingLogs] = useState(false)

  // Template Modal (Create / Edit)
  const [tplModalOpen, setTplModalOpen] = useState(false)
  const [editingTpl, setEditingTpl] = useState<TemplateItem | null>(null)
  const [tplForm, setTplForm] = useState({
    key: '',
    name: '',
    description: '',
    image_repo: 'dsh-sandbox',
    image_tag: 'latest',
    default_cpu_limit: '2.0',
    default_memory_limit: '4g',
    auto_install_plugins: 'file-manager',
    init_script: '#!/usr/bin/env bash\n',
    default_env_json: '{}',
  })
  const [savingTpl, setSavingTpl] = useState(false)

  // LLM Profile Form
  const [llmForm, setLlmForm] = useState({
    name: '',
    base_url: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    api_key: '',
  })

  // Admin / User Form
  const [newAdminEmail, setNewAdminEmail] = useState('')
  const [newAdminName, setNewAdminName] = useState('')
  const [newUserForm, setNewUserForm] = useState({
    email: '',
    display_name: '',
    password: '',
  })
  const [creatingUser, setCreatingUser] = useState(false)
  const [resetPwTarget, setResetPwTarget] = useState<UserItem | null>(null)
  const [resetPwValue, setResetPwValue] = useState('')
  const [savingPw, setSavingPw] = useState(false)

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    const bytes = new Uint8Array(12)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (b) => chars[b % chars.length]).join('')
  }

  const copyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    notify('已复制到剪贴板')
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const refreshAll = useCallback(async () => {
    try {
      const [ov, sbxRes, tplRes, llmRes, plgRes, usrRes, admRes] = await Promise.all([
        apiFetch<OverviewData>('/api/overview'),
        apiFetch<{ items: SandboxItem[] }>('/api/sandboxes?refresh=true'),
        apiFetch<TemplateItem[]>('/api/templates'),
        apiFetch<LlmProfileItem[]>('/api/llm-profiles'),
        apiFetch<any>('/api/plugins'),
        apiFetch<UserItem[]>('/api/users'),
        apiFetch<AdminItem[]>('/api/admins'),
      ])
      setOverview(ov)
      setSandboxes(sbxRes.items)
      setTemplates(tplRes)
      setLlmProfiles(llmRes)
      setPluginsData(plgRes)
      setUsers(usrRes)
      setAdmins(admRes)

      // Fetch live resource stats for running sandboxes
      const running = sbxRes.items.filter((s) => s.status === 'running')
      const statsEntries = await Promise.all(
        running.map(async (s) => {
          try {
            const st = await apiFetch<SandboxStats>(`/api/sandboxes/${s.id}/stats`)
            return [s.id, st] as const
          } catch {
            return null
          }
        }),
      )
      const nextStats: Record<string, SandboxStats> = {}
      for (const entry of statsEntries) {
        if (entry) nextStats[entry[0]] = entry[1]
      }
      setStatsMap(nextStats)
    } catch (err: any) {
      notify(err.message || '加载平台数据失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  // Apply template defaults when selecting a template in Create Sandbox modal
  const applyTemplateToSandboxForm = (tplKey: string, tplList = templates) => {
    const found = tplList.find((t) => t.key === tplKey)
    if (found) {
      setSbxForm((prev) => ({
        ...prev,
        template: found.key,
        image_repo: found.image_repo,
        image_tag: found.image_tag,
        cpu_limit: String(found.default_cpu_limit),
        memory_limit: found.default_memory_limit,
        auto_install_plugins: found.auto_install_plugins || '',
        init_script: found.init_script || '',
      }))
    } else {
      setSbxForm((prev) => ({ ...prev, template: tplKey }))
    }
  }

  const openProvisionModalWithTemplate = (tplKey = 'agent-os') => {
    applyTemplateToSandboxForm(tplKey)
    setCreateSbxOpen(true)
  }

  const handleCreateSandbox = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreatingSbx(true)
    try {
      await apiFetch('/api/sandboxes', {
        method: 'POST',
        body: JSON.stringify({
          email: sbxForm.email.trim(),
          display_name: sbxForm.display_name.trim() || null,
          initial_password: sbxForm.initial_password.trim() || null,
          slug: sbxForm.slug.trim() || null,
          template: sbxForm.template,
          image_repo: sbxForm.image_repo.trim() || null,
          image_tag: sbxForm.image_tag.trim() || null,
          cpu_limit: parseFloat(sbxForm.cpu_limit) || 2.0,
          memory_limit: sbxForm.memory_limit.trim() || '4g',
          llm_profile_id: sbxForm.llm_profile_id || null,
          init_repo_url: sbxForm.init_repo_url.trim() || null,
          auto_install_plugins: sbxForm.auto_install_plugins.trim(),
          init_script: sbxForm.init_script,
        }),
      })
      notify(`沙箱已成功分配给 ${sbxForm.email}`)
      setCreateSbxOpen(false)
      setSbxForm((prev) => ({
        ...prev,
        email: '',
        display_name: '',
        initial_password: '',
        slug: '',
      }))
      await refreshAll()
    } catch (err: any) {
      notify(err.message || '创建沙箱失败', 'error')
    } finally {
      setCreatingSbx(false)
    }
  }

  const handleSandboxAction = async (
    sbx: SandboxItem,
    action: 'start' | 'stop' | 'restart' | 'recreate',
  ) => {
    try {
      notify(`正在对 ${sbx.slug} 执行 ${action}...`)
      await apiFetch(`/api/sandboxes/${sbx.id}/${action}`, { method: 'POST' })
      notify(`沙箱 ${sbx.slug} ${action} 成功`)
      await refreshAll()
    } catch (err: any) {
      notify(err.message, 'error')
    }
  }

  const handleSaveSandboxSpec = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editSbx) return
    setSavingSbx(true)
    try {
      await apiFetch(`/api/sandboxes/${editSbx.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          cpu_limit: parseFloat(editSbxForm.cpu_limit) || editSbx.cpu_limit,
          memory_limit: editSbxForm.memory_limit.trim() || editSbx.memory_limit,
          image_repo: editSbxForm.image_repo.trim(),
          image_tag: editSbxForm.image_tag.trim(),
          llm_profile_id: editSbxForm.llm_profile_id,
        }),
      })
      notify(`沙箱 ${editSbx.slug} 配置已更新`)
      setEditSbx(null)
      await refreshAll()
    } catch (err: any) {
      notify(err.message, 'error')
    } finally {
      setSavingSbx(false)
    }
  }

  const handleConfirmDeleteSandbox = async () => {
    if (!deleteSbxTarget) return
    try {
      await apiFetch(
        `/api/sandboxes/${deleteSbxTarget.id}?purge_volume=${purgeVolume ? 'true' : 'false'}`,
        { method: 'DELETE' },
      )
      notify(`沙箱 ${deleteSbxTarget.slug} 已销毁`)
      setDeleteSbxTarget(null)
      setPurgeVolume(false)
      await refreshAll()
    } catch (err: any) {
      notify(err.message, 'error')
    }
  }

  const openLogsModal = async (sbx: SandboxItem) => {
    setLogsTarget(sbx)
    setLoadingLogs(true)
    try {
      const res = await apiFetch<{ logs: string }>(`/api/sandboxes/${sbx.id}/logs?tail=400`)
      const cleaned = (res.logs || '')
        // eslint-disable-next-line no-control-regex
        .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
        .replace(/\u2009/g, ' ')
      setLogsText(cleaned || '(暂无日志输出)')
    } catch (err: any) {
      setLogsText(`读取日志失败: ${err.message}`)
    } finally {
      setLoadingLogs(false)
    }
  }

  const openCreateTemplateModal = () => {
    setEditingTpl(null)
    setTplForm({
      key: '',
      name: '',
      description: '',
      image_repo: overview?.default_image_repo || 'dsh-sandbox',
      image_tag: overview?.default_image_tag || 'latest',
      default_cpu_limit: '2.0',
      default_memory_limit: '4g',
      auto_install_plugins: 'file-manager',
      init_script: '#!/usr/bin/env bash\nmkdir -p /home/dev/workspace/projects\n',
      default_env_json: '{}',
    })
    setTplModalOpen(true)
  }

  const openEditTemplateModal = (tpl: TemplateItem) => {
    setEditingTpl(tpl)
    setTplForm({
      key: tpl.key,
      name: tpl.name,
      description: tpl.description || '',
      image_repo: tpl.image_repo,
      image_tag: tpl.image_tag,
      default_cpu_limit: String(tpl.default_cpu_limit),
      default_memory_limit: tpl.default_memory_limit,
      auto_install_plugins: tpl.auto_install_plugins || '',
      init_script: tpl.init_script || '',
      default_env_json: tpl.default_env_json || '{}',
    })
    setTplModalOpen(true)
  }

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingTpl(true)
    try {
      if (editingTpl) {
        await apiFetch(`/api/templates/${editingTpl.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: tplForm.name.trim(),
            description: tplForm.description.trim() || null,
            image_repo: tplForm.image_repo.trim(),
            image_tag: tplForm.image_tag.trim(),
            default_cpu_limit: parseFloat(tplForm.default_cpu_limit) || 2.0,
            default_memory_limit: tplForm.default_memory_limit.trim(),
            auto_install_plugins: tplForm.auto_install_plugins.trim(),
            init_script: tplForm.init_script,
            default_env_json: tplForm.default_env_json.trim() || '{}',
          }),
        })
        notify(`模板 "${tplForm.name}" 已更新`)
      } else {
        await apiFetch('/api/templates', {
          method: 'POST',
          body: JSON.stringify({
            key: tplForm.key.trim(),
            name: tplForm.name.trim(),
            description: tplForm.description.trim() || null,
            image_repo: tplForm.image_repo.trim(),
            image_tag: tplForm.image_tag.trim(),
            default_cpu_limit: parseFloat(tplForm.default_cpu_limit) || 2.0,
            default_memory_limit: tplForm.default_memory_limit.trim(),
            auto_install_plugins: tplForm.auto_install_plugins.trim(),
            init_script: tplForm.init_script,
            default_env_json: tplForm.default_env_json.trim() || '{}',
          }),
        })
        notify(`新模板 "${tplForm.name}" 已创建`)
      }
      setTplModalOpen(false)
      await refreshAll()
    } catch (err: any) {
      notify(err.message, 'error')
    } finally {
      setSavingTpl(false)
    }
  }

  const handleDeleteTemplate = async (tpl: TemplateItem) => {
    if (!window.confirm(`确定要删除模板 "${tpl.name} (${tpl.key})" 吗？`)) return
    try {
      await apiFetch(`/api/templates/${tpl.id}`, { method: 'DELETE' })
      notify(`模板 ${tpl.key} 已删除`)
      await refreshAll()
    } catch (err: any) {
      notify(err.message, 'error')
    }
  }

  return (
    <div className="space-y-6">
      {/* KPI Metrics Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-400">运行中沙箱 / 总数</p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-emerald-400">
                  {overview?.running_sandboxes ?? 0}
                </span>
                <span className="text-sm text-zinc-500">/ {overview?.total_sandboxes ?? 0}</span>
              </div>
              <p className="mt-1 text-[11px] text-zinc-500">单域名二级目录 `/s/&lt;slug&gt;/`</p>
            </div>
            <div className="rounded-xl bg-emerald-500/10 p-3 text-emerald-400 border border-emerald-500/20">
              <Box className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-400">已分配计算配额</p>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-zinc-100">
                  {overview?.allocated_cpus ?? 0}
                </span>
                <span className="text-xs text-zinc-400">vCPU Cores</span>
              </div>
              <p className="mt-1 text-[11px] text-zinc-500">
                默认规格：{overview?.default_cpus ?? 2} C / {overview?.default_memory ?? '4g'}
              </p>
            </div>
            <div className="rounded-xl bg-indigo-500/10 p-3 text-indigo-400 border border-indigo-500/20">
              <Cpu className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-zinc-700 transition-colors"
          onClick={() => setActiveTab('templates')}
        >
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-400">镜像与环境模板</p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-zinc-100">
                  {templates.length}
                </span>
                <span className="text-xs text-zinc-400">个可用模板</span>
              </div>
              <p className="mt-1 text-[11px] text-zinc-500">
                本机镜像：{overview?.local_images.length ?? 0} 个 Tag
              </p>
            </div>
            <div className="rounded-xl bg-amber-500/10 p-3 text-amber-400 border border-amber-500/20">
              <Layers className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-zinc-700 transition-colors"
          onClick={() => setActiveTab('plugins')}
        >
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-400">自托管插件源</p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-zinc-100">
                  {pluginsData?.items.length ?? 0}
                </span>
                <span className="text-xs text-zinc-400">个内置插件</span>
              </div>
              <p className="mt-1 text-[11px] text-zinc-500">内置 `.tgz` 与 npm Packument</p>
            </div>
            <div className="rounded-xl bg-violet-500/10 p-3 text-violet-400 border border-violet-500/20">
              <Package className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <div className="flex flex-wrap items-center gap-1 rounded-xl bg-zinc-900/90 p-1 border border-zinc-800/90">
          {[
            { id: 'sandboxes', label: '沙箱工作区', icon: Terminal, count: sandboxes.length },
            { id: 'templates', label: '镜像与环境模板', icon: Layers, count: templates.length },
            {
              id: 'plugins',
              label: '自托管插件源',
              icon: Package,
              count: pluginsData?.items.length ?? 0,
            },
            { id: 'llm', label: 'LLM 模型凭证', icon: KeyRound, count: llmProfiles.length },
            { id: 'users', label: '用户与权限审计', icon: Users, count: users.length },
          ].map((tab) => {
            const Icon = tab.icon
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all cursor-pointer',
                  active
                    ? 'bg-zinc-100 text-zinc-950 shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.2 text-[10px]',
                    active ? 'bg-zinc-900/15 text-zinc-900' : 'bg-zinc-800 text-zinc-400',
                  )}
                >
                  {tab.count}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refreshAll}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            刷新状态
          </Button>
          {activeTab === 'templates' ? (
            <Button size="sm" onClick={openCreateTemplateModal}>
              <Plus className="h-3.5 w-3.5" />
              新建环境模板
            </Button>
          ) : (
            <Button size="sm" onClick={() => openProvisionModalWithTemplate('agent-os')}>
              <Plus className="h-3.5 w-3.5" />
              分配新沙箱工作区
            </Button>
          )}
        </div>
      </div>

      {/* TAB 1: Sandboxes Management */}
      {activeTab === 'sandboxes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-3 text-xs text-zinc-400">
            <div className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-amber-400" />
              <span>
                <strong>管理员强管控模式：</strong>个人用户不允许自行创建工作区，所有沙箱环境均由管理员基于模板统一分配。
              </span>
            </div>
            <span>网关路由模式：Traefik 二级目录 (`/s/&lt;slug&gt;/dsh/`)</span>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800/80 bg-zinc-950/60 text-zinc-400">
                    <th className="py-3.5 px-4 font-medium">工作区 / 归属用户</th>
                    <th className="py-3.5 px-4 font-medium">模板 & 镜像</th>
                    <th className="py-3.5 px-4 font-medium">状态 & 二级目录路由</th>
                    <th className="py-3.5 px-4 font-medium w-52">实时资源监控 (CPU / 内存)</th>
                    <th className="py-3.5 px-4 font-medium text-right">操作管理</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {sandboxes.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-zinc-500">
                        暂无已分配的沙箱工作区，点击右上角「分配新沙箱工作区」创建。
                      </td>
                    </tr>
                  ) : (
                    sandboxes.map((sbx) => {
                      const st = statsMap[sbx.id]
                      const memPct =
                        st && st.memory_limit_mb > 0
                          ? Math.round((st.memory_usage_mb / st.memory_limit_mb) * 100)
                          : 0
                      return (
                        <tr key={sbx.id} className="hover:bg-zinc-800/25 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold text-sm text-zinc-100">
                                {sbx.slug}
                              </span>
                              {sbx.llm_profile_name && (
                                <Badge variant="outline" className="text-[10px]">
                                  LLM: {sbx.llm_profile_name}
                                </Badge>
                              )}
                            </div>
                            <div className="mt-0.5 text-zinc-400">
                              {sbx.display_name ? `${sbx.display_name} (${sbx.email})` : sbx.email}
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5">
                              <Badge variant="secondary">{sbx.template}</Badge>
                              <span className="font-mono text-[11px] text-zinc-400">
                                {sbx.image_repo}:{sbx.image_tag}
                              </span>
                            </div>
                            <div className="mt-1 text-[11px] text-zinc-500">
                              配额：{sbx.cpu_limit} vCPU · {sbx.memory_limit} RAM · 卷{' '}
                              <code>{sbx.volume_name}</code>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={
                                  sbx.status === 'running'
                                    ? 'success'
                                    : sbx.status === 'starting' || sbx.status === 'creating'
                                      ? 'warning'
                                      : 'destructive'
                                }
                              >
                                <span
                                  className={cn(
                                    'h-1.5 w-1.5 rounded-full',
                                    sbx.status === 'running' ? 'bg-emerald-400' : 'bg-rose-400',
                                  )}
                                />
                                {sbx.status}
                              </Badge>
                              <span className="text-[11px] text-zinc-500">Port {sbx.port}</span>
                            </div>
                            <div className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-indigo-400">
                              <a
                                href={`/sandboxes/${sbx.id}/open`}
                                target="_blank"
                                rel="noreferrer"
                                className="hover:underline flex items-center gap-1"
                              >
                                /s/{sbx.slug}/dsh/
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            {sbx.status === 'running' && st ? (
                              <div className="space-y-1.5">
                                <div className="flex justify-between text-[11px]">
                                  <span className="text-zinc-400">CPU</span>
                                  <span className="font-mono text-zinc-200">{st.cpu_percent}%</span>
                                </div>
                                <Progress value={Math.min(100, st.cpu_percent)} />
                                <div className="flex justify-between text-[11px]">
                                  <span className="text-zinc-400">MEM</span>
                                  <span className="font-mono text-zinc-200">
                                    {st.memory_usage_mb} / {st.memory_limit_mb} MB ({memPct}%)
                                  </span>
                                </div>
                                <Progress value={memPct} />
                              </div>
                            ) : (
                              <span className="text-zinc-500 text-[11px]">容器未运行</span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="emerald"
                                size="sm"
                                onClick={() => window.open(`/sandboxes/${sbx.id}/open`, '_blank')}
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                打开工作区
                              </Button>

                              {sbx.status === 'running' ? (
                                <Button
                                  variant="outline"
                                  size="icon"
                                  title="停止沙箱"
                                  onClick={() => handleSandboxAction(sbx, 'stop')}
                                >
                                  <Square className="h-3.5 w-3.5 text-amber-400" />
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="icon"
                                  title="启动沙箱"
                                  onClick={() => handleSandboxAction(sbx, 'start')}
                                >
                                  <Play className="h-3.5 w-3.5 text-emerald-400" />
                                </Button>
                              )}

                              <Button
                                variant="outline"
                                size="icon"
                                title="重启沙箱"
                                onClick={() => handleSandboxAction(sbx, 'restart')}
                              >
                                <RotateCw className="h-3.5 w-3.5" />
                              </Button>

                              <Button
                                variant="outline"
                                size="icon"
                                title="查看实时日志"
                                onClick={() => openLogsModal(sbx)}
                              >
                                <FileText className="h-3.5 w-3.5" />
                              </Button>

                              <Button
                                variant="outline"
                                size="icon"
                                title="调整规格 / 镜像 / 模型"
                                onClick={() => {
                                  setEditSbx(sbx)
                                  setEditSbxForm({
                                    cpu_limit: String(sbx.cpu_limit),
                                    memory_limit: sbx.memory_limit,
                                    image_repo: sbx.image_repo || 'dsh-sandbox',
                                    image_tag: sbx.image_tag,
                                    llm_profile_id: sbx.llm_profile_id || '',
                                  })
                                }}
                              >
                                <Sliders className="h-3.5 w-3.5" />
                              </Button>

                              <Button
                                variant="outline"
                                size="icon"
                                title="导出工作区备份 (.tar)"
                                onClick={() => window.open(`/api/sandboxes/${sbx.id}/backup`, '_blank')}
                              >
                                <Download className="h-3.5 w-3.5" />
                              </Button>

                              <Button
                                variant="outline"
                                size="icon"
                                title="销毁沙箱"
                                className="hover:border-rose-500/50 hover:text-rose-400"
                                onClick={() => {
                                  setDeleteSbxTarget(sbx)
                                  setPurgeVolume(false)
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 2: Image & Environment Templates Management */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-3 text-xs text-zinc-400">
            <div>
              <strong>镜像与工作区模板管理：</strong>每个模板可绑定专属 Docker 镜像 (`image_repo:image_tag`)、默认 CPU/内存配额、预装插件列表、环境变量及首次启动执行的初始化 Shell 脚本 (`SANDBOX_INIT_SCRIPT`)。
            </div>
            <Button size="sm" onClick={openCreateTemplateModal}>
              <Plus className="h-3.5 w-3.5" />
              新建模板
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {templates.map((tpl) => (
              <Card key={tpl.id} className="flex flex-col justify-between">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle>{tpl.name}</CardTitle>
                        <Badge variant="secondary" className="font-mono">
                          {tpl.key}
                        </Badge>
                        {tpl.is_builtin && <Badge variant="outline">系统预置</Badge>}
                      </div>
                      <CardDescription className="mt-1.5">
                        {tpl.description || '无描述'}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-3">
                    <div>
                      <span className="text-zinc-500 block">绑定镜像 (Docker Image)</span>
                      <span className="font-mono text-zinc-200 mt-0.5 block">
                        {tpl.image_repo}:{tpl.image_tag}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block">默认资源配额</span>
                      <span className="font-mono text-zinc-200 mt-0.5 block">
                        {tpl.default_cpu_limit} vCPU · {tpl.default_memory_limit} RAM
                      </span>
                    </div>
                    <div className="col-span-2 pt-1 border-t border-zinc-800/60">
                      <span className="text-zinc-500 block">预装 DSH 插件</span>
                      <span className="font-mono text-zinc-300 mt-0.5 block">
                        {tpl.auto_install_plugins || '(不预装额外插件)'}
                      </span>
                    </div>
                  </div>

                  {tpl.init_script && (
                    <div>
                      <span className="text-[11px] text-zinc-500 block mb-1">
                        首次启动初始化脚本 (`init_script`):
                      </span>
                      <pre className="rounded-lg border border-zinc-800/80 bg-zinc-950 p-2.5 font-mono text-[11px] text-zinc-300 overflow-x-auto max-h-24">
                        {tpl.init_script}
                      </pre>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60">
                    <Button
                      variant="emerald"
                      size="sm"
                      onClick={() => openProvisionModalWithTemplate(tpl.key)}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      基于此模板分配沙箱
                    </Button>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditTemplateModal(tpl)}
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        编辑模板
                      </Button>
                      {!tpl.is_builtin && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="hover:text-rose-400"
                          onClick={() => handleDeleteTemplate(tpl)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Local Docker Images Inventory */}
          {overview && overview.local_images.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">宿主机可用 Docker 镜像列表</CardTitle>
                <CardDescription>
                  模板或沙箱可直接绑定以下任意本地镜像，也可通过 `docker build` 构建定制化沙箱镜像（如开启 `INSTALL_BROWSER=true` 或 `INSTALL_DOTNET=true`）。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {overview.local_images.map((img) => (
                    <div
                      key={img.full_name}
                      className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-xs"
                    >
                      <div>
                        <div className="font-mono font-medium text-zinc-200">{img.full_name}</div>
                        <div className="text-[11px] text-zinc-500">ID: {img.id}</div>
                      </div>
                      <Badge variant="outline">{img.size_mb} MB</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* TAB 3: Self-Hosted Plugin Registry */}
      {activeTab === 'plugins' && pluginsData && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>自托管 DSH 插件索引与内置 npm 源</CardTitle>
                <CardDescription className="mt-1">
                  宿主机 `plugins/` 目录以只读热挂载方式接入，`dsh-manager` 按文件修改时间 (`mtime_ns`) 自动增量重打包并合成 `index.json`（含内联 Base64 图标与实时版本号），修改插件无需重建或重启 Manager。
                </CardDescription>
              </div>
              <Button
                variant="emerald"
                size="sm"
                className="shrink-0"
                onClick={async () => {
                  try {
                    notify('正在向所有运行中沙箱注入并同步插件市场索引...')
                    const res = await apiFetch<{ synced: number }>('/api/plugins/sync-sandboxes', {
                      method: 'POST',
                    })
                    notify(`已成功同步 ${res.synced} 个运行中沙箱的插件市场索引`)
                    await refreshAll()
                  } catch (err: any) {
                    notify(err.message || '同步失败', 'error')
                  }
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                同步索引到运行中沙箱
              </Button>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2 text-xs">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 flex items-center justify-between gap-2">
                <div>
                  <span className="text-zinc-500 block">Discover 插件索引地址 (`DSH_PLUGIN_INDEX_URL`)</span>
                  <code className="text-indigo-400 font-mono mt-0.5 block">
                    {pluginsData.index_url}
                  </code>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyText('idx', pluginsData.index_url)}
                >
                  {copiedKey === 'idx' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 flex items-center justify-between gap-2">
                <div>
                  <span className="text-zinc-500 block">内置只读 npm Registry 地址</span>
                  <code className="text-emerald-400 font-mono mt-0.5 block">
                    {pluginsData.npm_registry_url}
                  </code>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyText('npm', pluginsData.npm_registry_url)}
                >
                  {copiedKey === 'npm' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {pluginsData.items.map((plg) => (
              <Card key={plg.slug}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {plg.icon_url ? (
                        <img
                          src={plg.icon_url}
                          alt={plg.slug}
                          className="h-10 w-10 rounded-lg border border-zinc-800 bg-zinc-950 p-1.5"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950">
                          <Package className="h-5 w-5 text-indigo-400" />
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle>{plg.display_name_zh || plg.display_name_en}</CardTitle>
                          <Badge variant="success">v{plg.version}</Badge>
                        </div>
                        <p className="font-mono text-xs text-zinc-400 mt-0.5">
                          {plg.package_name} · {plg.category}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <p className="text-zinc-300 leading-relaxed">
                    {plg.description_zh || plg.description_en}
                  </p>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 flex items-center justify-between gap-2">
                    <code className="font-mono text-[11px] text-zinc-300 truncate">
                      {plg.install_command}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyText(plg.slug, plg.install_command)}
                    >
                      {copiedKey === plg.slug ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(plg.tarball_url, '_blank')}
                    >
                      <Download className="h-3.5 w-3.5" />
                      下载 .tgz 包
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.open(plg.npm_packument_url, '_blank')}
                    >
                      <FileCode2 className="h-3.5 w-3.5" />
                      查看 npm Packument
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: LLM Profiles */}
      {activeTab === 'llm' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>新增 LLM 模型配置</CardTitle>
              <CardDescription>
                API Key 使用服务端 `SECRET_KEY` 加密存储，可在分配沙箱时自动注入给 DeepSeek Harness。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  try {
                    await apiFetch('/api/llm-profiles', {
                      method: 'POST',
                      body: JSON.stringify(llmForm),
                    })
                    notify('LLM 模型凭证已保存')
                    setLlmForm({
                      name: '',
                      base_url: 'https://api.deepseek.com/v1',
                      model: 'deepseek-chat',
                      api_key: '',
                    })
                    await refreshAll()
                  } catch (err: any) {
                    notify(err.message, 'error')
                  }
                }}
                className="space-y-3"
              >
                <div className="space-y-1">
                  <Label>配置名称</Label>
                  <Input
                    required
                    placeholder="例如：DeepSeek 官方 API"
                    value={llmForm.name}
                    onChange={(e) => setLlmForm({ ...llmForm, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>OpenAI 兼容 Base URL</Label>
                  <Input
                    required
                    value={llmForm.base_url}
                    onChange={(e) => setLlmForm({ ...llmForm, base_url: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>模型名称 (Model ID)</Label>
                  <Input
                    required
                    value={llmForm.model}
                    onChange={(e) => setLlmForm({ ...llmForm, model: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>API Key</Label>
                  <Input
                    type="password"
                    required
                    placeholder="sk-..."
                    value={llmForm.api_key}
                    onChange={(e) => setLlmForm({ ...llmForm, api_key: e.target.value })}
                  />
                </div>
                <Button type="submit" className="w-full">
                  <Plus className="h-3.5 w-3.5" />
                  保存模型凭证
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>已保存的 LLM 模型凭证</CardTitle>
              <CardDescription>分配或编辑沙箱时可直接关联下列模型配置。</CardDescription>
            </CardHeader>
            <CardContent>
              {llmProfiles.length === 0 ? (
                <p className="text-xs text-zinc-500 py-8 text-center">暂无已保存的 LLM 配置</p>
              ) : (
                <div className="divide-y divide-zinc-800/70">
                  {llmProfiles.map((p) => (
                    <div key={p.id} className="flex items-center justify-between py-3 text-xs">
                      <div>
                        <div className="font-medium text-zinc-100">{p.name}</div>
                        <div className="font-mono text-zinc-400 mt-0.5">
                          {p.model} · {p.base_url}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-rose-400 hover:text-rose-300"
                        onClick={async () => {
                          await apiFetch(`/api/llm-profiles/${p.id}`, { method: 'DELETE' })
                          notify('已删除 LLM 配置')
                          await refreshAll()
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 5: Users, Admins & Audit Log */}
      {activeTab === 'users' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle>普通用户管理 (Workspace Users)</CardTitle>
                  <CardDescription>
                    {overview?.manager_auth_mode === 'oidc'
                      ? '当前使用 OIDC 单点登录，账号通过 IdP 的 Email Claim 校验；管理员仍可在下方预先建档或禁用特定用户。'
                      : '当前使用本地认证模式，普通用户须通过「邮箱 + 密码」登录，禁用后将立即无法访问个人工作区与 DSH。'}
                  </CardDescription>
                </div>
                <Badge variant="outline">
                  {overview?.manager_auth_mode === 'oidc' ? 'OIDC 兼容模式' : '本地密码认证'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  setCreatingUser(true)
                  try {
                    await apiFetch('/api/users', {
                      method: 'POST',
                      body: JSON.stringify({
                        email: newUserForm.email.trim(),
                        display_name: newUserForm.display_name.trim() || null,
                        password: newUserForm.password.trim() || null,
                      }),
                    })
                    notify(`已添加用户 ${newUserForm.email.trim()}`)
                    setNewUserForm({ email: '', display_name: '', password: '' })
                    await refreshAll()
                  } catch (err: any) {
                    notify(err.message, 'error')
                  } finally {
                    setCreatingUser(false)
                  }
                }}
                className="grid grid-cols-1 gap-2 sm:grid-cols-12"
              >
                <div className="sm:col-span-4">
                  <Input
                    type="email"
                    required
                    placeholder="用户邮箱 *"
                    value={newUserForm.email}
                    onChange={(e) =>
                      setNewUserForm({ ...newUserForm, email: e.target.value })
                    }
                  />
                </div>
                <div className="sm:col-span-3">
                  <Input
                    placeholder="姓名 / 备注 (可选)"
                    value={newUserForm.display_name}
                    onChange={(e) =>
                      setNewUserForm({ ...newUserForm, display_name: e.target.value })
                    }
                  />
                </div>
                <div className="sm:col-span-3 flex gap-1.5">
                  <Input
                    type="text"
                    required={overview?.manager_auth_mode !== 'oidc'}
                    minLength={6}
                    placeholder={
                      overview?.manager_auth_mode === 'oidc'
                        ? '本地密码 (可选)'
                        : '初始密码 (至少6位) *'
                    }
                    value={newUserForm.password}
                    onChange={(e) =>
                      setNewUserForm({ ...newUserForm, password: e.target.value })
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setNewUserForm({
                        ...newUserForm,
                        password: generatePassword(),
                      })
                    }
                    title="生成随机密码"
                  >
                    随机
                  </Button>
                </div>
                <div className="sm:col-span-2 flex justify-end">
                  <Button type="submit" size="sm" className="w-full" disabled={creatingUser}>
                    <Plus className="h-3.5 w-3.5" />
                    添加用户
                  </Button>
                </div>
              </form>

              {users.length === 0 ? (
                <div className="py-8 text-center text-xs text-zinc-500">
                  暂无普通用户，可在上方创建或通过分配新沙箱自动建档。
                </div>
              ) : (
                <div className="divide-y divide-zinc-800/70 text-xs">
                  {users.map((u) => (
                    <div
                      key={u.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-2.5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-zinc-200">{u.email}</span>
                        {u.display_name && (
                          <span className="text-zinc-400">({u.display_name})</span>
                        )}
                        <Badge variant={u.status === 'active' ? 'success' : 'warning'}>
                          {u.status === 'active' ? '生效中' : '已禁用'}
                        </Badge>
                        {overview?.manager_auth_mode === 'oidc' ? (
                          <Badge variant="secondary">
                            {u.has_password ? 'OIDC + 已设本地密码' : 'OIDC 认证'}
                          </Badge>
                        ) : (
                          <Badge variant={u.has_password ? 'outline' : 'warning'}>
                            {u.has_password ? '已设密码' : '未设密码'}
                          </Badge>
                        )}
                        <Badge variant="outline">{u.sandbox_count} 个沙箱</Badge>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setResetPwTarget(u)
                            setResetPwValue('')
                          }}
                        >
                          <KeyRound className="h-3 w-3" />
                          {u.has_password ? '重置密码' : '设置密码'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            const nextStatus = u.status === 'active' ? 'disabled' : 'active'
                            try {
                              await apiFetch(`/api/users/${u.id}`, {
                                method: 'PATCH',
                                body: JSON.stringify({ status: nextStatus }),
                              })
                              notify(
                                nextStatus === 'active'
                                  ? `已启用用户 ${u.email}`
                                  : `已禁用用户 ${u.email}`,
                              )
                              await refreshAll()
                            } catch (err: any) {
                              notify(err.message, 'error')
                            }
                          }}
                        >
                          {u.status === 'active' ? '禁用' : '启用'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={u.sandbox_count > 0}
                          title={
                            u.sandbox_count > 0
                              ? '请先删除该用户名下的沙箱'
                              : '删除用户'
                          }
                          onClick={async () => {
                            try {
                              await apiFetch(`/api/users/${u.id}`, { method: 'DELETE' })
                              notify(`已删除用户 ${u.email}`)
                              await refreshAll()
                            } catch (err: any) {
                              notify(err.message, 'error')
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>平台管理员 (Platform Admins)</CardTitle>
              <CardDescription>拥有管理控制台权限与沙箱分配权限的管理员列表。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  try {
                    await apiFetch('/api/admins', {
                      method: 'POST',
                      body: JSON.stringify({
                        email: newAdminEmail.trim(),
                        display_name: newAdminName.trim() || null,
                      }),
                    })
                    notify('已添加平台管理员')
                    setNewAdminEmail('')
                    setNewAdminName('')
                    await refreshAll()
                  } catch (err: any) {
                    notify(err.message, 'error')
                  }
                }}
                className="flex gap-2"
              >
                <Input
                  type="email"
                  required
                  placeholder="管理员邮箱..."
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                />
                <Input
                  placeholder="显示名称 (可选)"
                  value={newAdminName}
                  onChange={(e) => setNewAdminName(e.target.value)}
                />
                <Button type="submit" size="sm">
                  添加
                </Button>
              </form>

              <div className="divide-y divide-zinc-800/70 text-xs">
                {admins.map((a) => (
                  <div key={a.email} className="flex items-center justify-between py-2.5">
                    <div>
                      <span className="font-medium text-zinc-200">{a.email}</span>
                      {a.display_name && (
                        <span className="ml-2 text-zinc-500">({a.display_name})</span>
                      )}
                    </div>
                    <Badge variant={a.active ? 'success' : 'secondary'}>
                      {a.active ? '生效中' : '已停用'}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>平台操作审计日志 (Audit Log)</CardTitle>
              <CardDescription>最近 25 条沙箱生命周期与模板变更记录。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-80 overflow-y-auto divide-y divide-zinc-800/60 text-xs">
                {overview?.audit_logs.map((log) => (
                  <div key={log.id} className="py-2 flex items-center justify-between gap-2">
                    <div>
                      <Badge variant="outline" className="font-mono text-[10px] mr-2">
                        {log.action}
                      </Badge>
                      <span className="text-zinc-300 font-mono">{log.target}</span>
                      {log.detail && (
                        <span className="ml-2 text-zinc-500">({log.detail})</span>
                      )}
                    </div>
                    <span className="text-[11px] text-zinc-500 shrink-0">
                      {new Date(log.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* DIALOG 1: Provision New Sandbox */}
      <Dialog
        open={createSbxOpen}
        onOpenChange={setCreateSbxOpen}
        title="分配新沙箱工作区 (管理员创建)"
        description="选择环境模板后将自动带出该模板绑定的 Docker 镜像、资源配额、预装插件与初始化脚本。"
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleCreateSandbox} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>归属员工邮箱 *</Label>
              <Input
                type="email"
                required
                list="existing-users-list"
                placeholder="employee@example.com"
                value={sbxForm.email}
                onChange={(e) => setSbxForm({ ...sbxForm, email: e.target.value })}
              />
              <datalist id="existing-users-list">
                {users.map((u) => (
                  <option key={u.id} value={u.email}>
                    {u.display_name || u.email}
                  </option>
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label>员工姓名 / 备注</Label>
              <Input
                placeholder="例如：张三 (AI 研发)"
                value={sbxForm.display_name}
                onChange={(e) => setSbxForm({ ...sbxForm, display_name: e.target.value })}
              />
            </div>

            {overview?.manager_auth_mode !== 'oidc' && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>用户初始登录密码 (仅首次建档或尚未设密码时写入，可选)</Label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    minLength={6}
                    placeholder="至少 6 位，若用户已有密码可留空"
                    value={sbxForm.initial_password}
                    onChange={(e) =>
                      setSbxForm({ ...sbxForm, initial_password: e.target.value })
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setSbxForm({ ...sbxForm, initial_password: generatePassword() })
                    }
                  >
                    随机生成
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>选择镜像与环境模板 *</Label>
              <Select
                value={sbxForm.template}
                onChange={(e) => applyTemplateToSandboxForm(e.target.value)}
              >
                {templates.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.name} ({t.key}) — {t.image_repo}:{t.image_tag}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>自定义二级目录标识 (Slug，留空自动按邮箱生成)</Label>
              <Input
                placeholder="例如：alice -> /s/alice/dsh/"
                value={sbxForm.slug}
                onChange={(e) => setSbxForm({ ...sbxForm, slug: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Docker 镜像仓库 (Image Repo)</Label>
              <Input
                value={sbxForm.image_repo}
                onChange={(e) => setSbxForm({ ...sbxForm, image_repo: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>镜像 Tag</Label>
              <Input
                value={sbxForm.image_tag}
                onChange={(e) => setSbxForm({ ...sbxForm, image_tag: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>CPU 核数限制 (vCPU)</Label>
              <Input
                type="number"
                step="0.5"
                min="0.5"
                max="64"
                value={sbxForm.cpu_limit}
                onChange={(e) => setSbxForm({ ...sbxForm, cpu_limit: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>内存限制 (如 2g, 4g, 8g)</Label>
              <Input
                value={sbxForm.memory_limit}
                onChange={(e) => setSbxForm({ ...sbxForm, memory_limit: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>注入默认 LLM 模型凭证 (可选)</Label>
              <Select
                value={sbxForm.llm_profile_id}
                onChange={(e) => setSbxForm({ ...sbxForm, llm_profile_id: e.target.value })}
              >
                <option value="">(不注入，由用户在沙箱内配置)</option>
                {llmProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.model})
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>预装自托管插件 (逗号分隔)</Label>
              <Input
                placeholder="file-manager"
                value={sbxForm.auto_install_plugins}
                onChange={(e) =>
                  setSbxForm({ ...sbxForm, auto_install_plugins: e.target.value })
                }
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>首次启动自动 Git Clone 仓库地址 (可选)</Label>
              <Input
                placeholder="https://github.com/org/repo.git"
                value={sbxForm.init_repo_url}
                onChange={(e) => setSbxForm({ ...sbxForm, init_repo_url: e.target.value })}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>首次启动初始化脚本 (`SANDBOX_INIT_SCRIPT`)</Label>
              <Textarea
                rows={3}
                value={sbxForm.init_script}
                onChange={(e) => setSbxForm({ ...sbxForm, init_script: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
            <Button type="button" variant="ghost" onClick={() => setCreateSbxOpen(false)}>
              取消
            </Button>
            <Button type="submit" disabled={creatingSbx}>
              {creatingSbx ? '正在创建容器并等待健康检查...' : '立即创建并分配沙箱'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* DIALOG 2: Create / Edit Sandbox Template */}
      <Dialog
        open={tplModalOpen}
        onOpenChange={setTplModalOpen}
        title={editingTpl ? `编辑模板：${editingTpl.name}` : '新建镜像与环境模板'}
        description="定义标准的 Agent OS 镜像、资源规格、预装插件与初始化脚本，供管理员分配沙箱时一键选用。"
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSaveTemplate} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>模板唯一标识 (Key，小写字母与连字符) *</Label>
              <Input
                required
                disabled={!!editingTpl}
                placeholder="例如：ai-researcher"
                value={tplForm.key}
                onChange={(e) => setTplForm({ ...tplForm, key: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>模板显示名称 *</Label>
              <Input
                required
                placeholder="例如：AI 算法研发环境"
                value={tplForm.name}
                onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>模板功能描述</Label>
              <Input
                placeholder="描述该模板包含的工具链、适用团队或预置服务..."
                value={tplForm.description}
                onChange={(e) => setTplForm({ ...tplForm, description: e.target.value })}
              />
            </div>

            {overview && overview.local_images.length > 0 && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>从本机已有 Docker 镜像快速选择</Label>
                <Select
                  value={`${tplForm.image_repo}:${tplForm.image_tag}`}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val.includes(':')) {
                      const [r, t] = val.split(':')
                      setTplForm({ ...tplForm, image_repo: r, image_tag: t })
                    }
                  }}
                >
                  {overview.local_images.map((img) => (
                    <option key={img.full_name} value={img.full_name}>
                      {img.full_name} ({img.size_mb} MB)
                    </option>
                  ))}
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Docker 镜像仓库 (`image_repo`) *</Label>
              <Input
                required
                value={tplForm.image_repo}
                onChange={(e) => setTplForm({ ...tplForm, image_repo: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Docker 镜像 Tag (`image_tag`) *</Label>
              <Input
                required
                value={tplForm.image_tag}
                onChange={(e) => setTplForm({ ...tplForm, image_tag: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>默认 CPU 配额 (vCPU)</Label>
              <Input
                type="number"
                step="0.5"
                min="0.5"
                max="64"
                value={tplForm.default_cpu_limit}
                onChange={(e) => setTplForm({ ...tplForm, default_cpu_limit: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>默认内存配额 (如 2g, 4g, 8g)</Label>
              <Input
                value={tplForm.default_memory_limit}
                onChange={(e) =>
                  setTplForm({ ...tplForm, default_memory_limit: e.target.value })
                }
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>自动预装的 DSH 插件 (逗号分隔，如 file-manager)</Label>
              <Input
                value={tplForm.auto_install_plugins}
                onChange={(e) =>
                  setTplForm({ ...tplForm, auto_install_plugins: e.target.value })
                }
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>工作区首次启动初始化脚本 (`init_script`，以 dev 用户在 `/home/dev/workspace` 执行)</Label>
              <Textarea
                rows={4}
                value={tplForm.init_script}
                onChange={(e) => setTplForm({ ...tplForm, init_script: e.target.value })}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>默认容器环境变量 JSON (`default_env_json`)</Label>
              <Textarea
                rows={2}
                value={tplForm.default_env_json}
                onChange={(e) => setTplForm({ ...tplForm, default_env_json: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
            <Button type="button" variant="ghost" onClick={() => setTplModalOpen(false)}>
              取消
            </Button>
            <Button type="submit" disabled={savingTpl}>
              {savingTpl ? '正在保存...' : '保存模板'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* DIALOG 3: Edit Sandbox Spec / Image / LLM */}
      <Dialog
        open={!!editSbx}
        onOpenChange={(o) => !o && setEditSbx(null)}
        title={`调整沙箱配置：${editSbx?.slug}`}
        description="动态更新容器 CPU/内存限制，或切换绑定的镜像版本与 LLM 模型配置（保留用户数据卷）。"
      >
        <form onSubmit={handleSaveSandboxSpec} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>CPU 限制 (vCPU)</Label>
              <Input
                type="number"
                step="0.5"
                value={editSbxForm.cpu_limit}
                onChange={(e) =>
                  setEditSbxForm({ ...editSbxForm, cpu_limit: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>内存限制</Label>
              <Input
                value={editSbxForm.memory_limit}
                onChange={(e) =>
                  setEditSbxForm({ ...editSbxForm, memory_limit: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>镜像仓库 (`image_repo`)</Label>
              <Input
                value={editSbxForm.image_repo}
                onChange={(e) =>
                  setEditSbxForm({ ...editSbxForm, image_repo: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>镜像 Tag (`image_tag`)</Label>
              <Input
                value={editSbxForm.image_tag}
                onChange={(e) =>
                  setEditSbxForm({ ...editSbxForm, image_tag: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>绑定 LLM 模型凭证</Label>
              <Select
                value={editSbxForm.llm_profile_id}
                onChange={(e) =>
                  setEditSbxForm({ ...editSbxForm, llm_profile_id: e.target.value })
                }
              >
                <option value="">(不绑定)</option>
                {llmProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.model})
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
            <Button type="button" variant="ghost" onClick={() => setEditSbx(null)}>
              取消
            </Button>
            <Button type="submit" disabled={savingSbx}>
              {savingSbx ? '正在应用更改...' : '保存并生效'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* DIALOG 4: Container Logs */}
      <Dialog
        open={!!logsTarget}
        onOpenChange={(o) => !o && setLogsTarget(null)}
        title={`容器实时日志：dsh-sbx-${logsTarget?.slug}`}
        description="显示 supervisord、Caddy、dsh-token 与 DeepSeek Harness 标准输出日志。"
        maxWidth="max-w-4xl"
      >
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs text-zinc-400 font-mono">
              Volume: {logsTarget?.volume_name}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => logsTarget && openLogsModal(logsTarget)}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loadingLogs && 'animate-spin')} />
                刷新
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyText('logs', logsText)}
              >
                <Copy className="h-3.5 w-3.5" />
                复制日志
              </Button>
            </div>
          </div>
          <pre className="h-96 overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-[11px] text-zinc-300 leading-relaxed">
            {loadingLogs ? '正在读取容器日志...' : logsText}
          </pre>
        </div>
      </Dialog>

      {/* DIALOG 5: Delete Sandbox Confirmation */}
      <Dialog
        open={!!deleteSbxTarget}
        onOpenChange={(o) => !o && setDeleteSbxTarget(null)}
        title={`确认销毁沙箱：${deleteSbxTarget?.slug}`}
        description={`归属用户：${deleteSbxTarget?.email}`}
      >
        <div className="space-y-4 text-xs">
          <label className="flex items-center gap-2.5 rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 text-rose-200 cursor-pointer">
            <input
              type="checkbox"
              checked={purgeVolume}
              onChange={(e) => setPurgeVolume(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-700"
            />
            <span>
              同时永久删除持久化数据卷 (<code>{deleteSbxTarget?.volume_name}</code>，不可恢复)
            </span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setDeleteSbxTarget(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleConfirmDeleteSandbox}>
              确认销毁
            </Button>
          </div>
        </div>
      </Dialog>

      {/* DIALOG 6: Reset User Password */}
      <Dialog
        open={!!resetPwTarget}
        onOpenChange={(o) => !o && setResetPwTarget(null)}
        title={`设置 / 重置用户密码：${resetPwTarget?.email}`}
        description="设置后，用户在非 OIDC 模式下须使用该密码登录个人工作区。"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!resetPwTarget) return
            setSavingPw(true)
            try {
              await apiFetch(`/api/users/${resetPwTarget.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ password: resetPwValue.trim() }),
              })
              notify(`已更新 ${resetPwTarget.email} 的登录密码`)
              setResetPwTarget(null)
              setResetPwValue('')
              await refreshAll()
            } catch (err: any) {
              notify(err.message, 'error')
            } finally {
              setSavingPw(false)
            }
          }}
          className="space-y-4 text-xs"
        >
          <div className="space-y-1.5">
            <Label>新密码 (至少 6 位) *</Label>
            <div className="flex gap-2">
              <Input
                type="text"
                required
                minLength={6}
                placeholder="输入新密码..."
                value={resetPwValue}
                onChange={(e) => setResetPwValue(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setResetPwValue(generatePassword())}
              >
                随机生成
              </Button>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setResetPwTarget(null)}>
              取消
            </Button>
            <Button type="submit" disabled={savingPw}>
              {savingPw ? '保存中...' : '确认设置'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* User Portal View (/my) — Strictly Admin-Provisioned Only!                  */
/* -------------------------------------------------------------------------- */

function UserPortalView({
  auth,
  notify,
}: {
  auth: AuthMe | null
  notify: (msg: string, type?: 'success' | 'error') => void
}) {
  const [sandboxes, setSandboxes] = useState<SandboxItem[]>([])
  const [loading, setLoading] = useState(true)
  const [logsTarget, setLogsTarget] = useState<SandboxItem | null>(null)
  const [logsText, setLogsText] = useState('')
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [pwModalOpen, setPwModalOpen] = useState(false)
  const [pwForm, setPwForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  })
  const [savingPw, setSavingPw] = useState(false)

  const openLogsModal = async (sbx: SandboxItem) => {
    setLogsTarget(sbx)
    setLoadingLogs(true)
    try {
      const res = await apiFetch<{ logs: string }>(`/api/sandboxes/${sbx.id}/logs?tail=400`)
      const cleaned = (res.logs || '(暂无日志输出)').replace(
        /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b[@-_]/g,
        '',
      )
      setLogsText(cleaned)
    } catch (err: any) {
      setLogsText(`读取日志失败: ${err.message}`)
    } finally {
      setLoadingLogs(false)
    }
  }

  const loadMySandboxes = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams(window.location.search)
      const qEmail = params.get('email') || auth?.email || ''
      const res = await apiFetch<{ items: SandboxItem[] }>(
        `/api/my/sandboxes${qEmail ? `?email=${encodeURIComponent(qEmail)}` : ''}`,
      )
      setSandboxes(res.items)
    } catch (err: any) {
      notify(err.message || '加载个人工作区失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [auth, notify])

  useEffect(() => {
    loadMySandboxes()
  }, [loadMySandboxes])

  const handleAction = async (sbx: SandboxItem, action: 'start' | 'stop' | 'restart') => {
    try {
      notify(`正在执行 ${action}...`)
      await apiFetch(`/api/my/sandboxes/${sbx.id}/${action}`, { method: 'POST' })
      notify('操作成功')
      await loadMySandboxes()
    } catch (err: any) {
      notify(err.message, 'error')
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">我的远程 Agent OS 工作区</h1>
          <p className="text-xs text-zinc-400 mt-1">
            当前账号：<span className="text-zinc-200 font-mono">{auth?.email}</span> · 工作区由平台管理员统一创建与分配
          </p>
        </div>
        <div className="flex items-center gap-2">
          {auth?.auth_mode !== 'oidc' && !auth?.admin && (
            <Button variant="outline" size="sm" onClick={() => setPwModalOpen(true)}>
              <KeyRound className="h-3.5 w-3.5" />
              修改密码
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={loadMySandboxes}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            刷新状态
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-xs text-zinc-500">正在查询您名下的沙箱工作区...</div>
      ) : sandboxes.length === 0 ? (
        <Card className="border-dashed border-zinc-800 bg-zinc-900/40">
          <CardContent className="py-14 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800/80 text-zinc-400">
              <Lock className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-medium text-zinc-200">暂未分配远程 Agent OS 工作区</h3>
            <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
              当前平台采用管理员集中分配策略，个人不支持自助新建工作区。请联系平台管理员（
              <code className="text-zinc-300">{auth?.default_admin_email || 'admin@example.com'}</code>
              ）为您开通专属沙箱环境。
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {sandboxes.map((sbx) => (
            <Card key={sbx.id} className="border-zinc-800">
              <CardContent className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-base font-semibold text-zinc-100">
                      {sbx.slug}
                    </span>
                    <Badge variant={sbx.status === 'running' ? 'success' : 'warning'}>
                      {sbx.status}
                    </Badge>
                    <Badge variant="secondary">{sbx.template}</Badge>
                  </div>
                  <div className="text-xs text-zinc-400 space-x-3 font-mono">
                    <span>入口: /s/{sbx.slug}/dsh/</span>
                    <span>·</span>
                    <span>应用: /s/{sbx.slug}/apps/&lt;name&gt;/</span>
                    <span>·</span>
                    <span>
                      规格: {sbx.cpu_limit} vCPU / {sbx.memory_limit}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="emerald"
                    onClick={() => window.open(`/sandboxes/${sbx.id}/open`, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4" />
                    进入 Agent OS 工作区
                  </Button>
                  {sbx.status === 'running' ? (
                    <Button variant="outline" size="sm" onClick={() => handleAction(sbx, 'stop')}>
                      <Square className="h-3.5 w-3.5 text-amber-400" />
                      停止
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => handleAction(sbx, 'start')}>
                      <Play className="h-3.5 w-3.5 text-emerald-400" />
                      启动
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => handleAction(sbx, 'restart')}>
                    <RotateCw className="h-3.5 w-3.5" />
                    重启
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openLogsModal(sbx)}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    查看日志
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`/api/sandboxes/${sbx.id}/backup`, '_blank')}
                  >
                    <Download className="h-3.5 w-3.5" />
                    下载备份 (.tar)
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* User Portal Logs Modal */}
      <Dialog
        open={!!logsTarget}
        onOpenChange={(o) => !o && setLogsTarget(null)}
        title={`工作区运行日志：dsh-sbx-${logsTarget?.slug}`}
        description="显示您的远程工作区容器实时运行日志。"
        maxWidth="max-w-4xl"
      >
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs text-zinc-400 font-mono">
              Volume: {logsTarget?.volume_name}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => logsTarget && openLogsModal(logsTarget)}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loadingLogs && 'animate-spin')} />
                刷新
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(logsText)
                  notify('日志已复制到剪贴板')
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                复制日志
              </Button>
            </div>
          </div>
          <pre className="h-96 overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-[11px] text-zinc-300 leading-relaxed whitespace-pre-wrap break-all">
            {loadingLogs ? '正在读取容器日志...' : logsText}
          </pre>
        </div>
      </Dialog>

      {/* Change My Password Modal */}
      <Dialog
        open={pwModalOpen}
        onOpenChange={(o) => !o && setPwModalOpen(false)}
        title="修改个人登录密码"
        description={`账号：${auth?.email}`}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (pwForm.new_password !== pwForm.confirm_password) {
              notify('两次输入的新密码不一致', 'error')
              return
            }
            setSavingPw(true)
            try {
              await apiFetch('/api/my/password', {
                method: 'POST',
                body: JSON.stringify({
                  current_password: pwForm.current_password || null,
                  new_password: pwForm.new_password,
                }),
              })
              notify('登录密码修改成功')
              setPwModalOpen(false)
              setPwForm({ current_password: '', new_password: '', confirm_password: '' })
            } catch (err: any) {
              notify(err.message, 'error')
            } finally {
              setSavingPw(false)
            }
          }}
          className="space-y-4 text-xs"
        >
          {auth?.has_password && (
            <div className="space-y-1.5">
              <Label>当前密码 *</Label>
              <Input
                type="password"
                required
                value={pwForm.current_password}
                onChange={(e) =>
                  setPwForm({ ...pwForm, current_password: e.target.value })
                }
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>新密码 (至少 6 位) *</Label>
            <Input
              type="password"
              required
              minLength={6}
              value={pwForm.new_password}
              onChange={(e) =>
                setPwForm({ ...pwForm, new_password: e.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>确认新密码 *</Label>
            <Input
              type="password"
              required
              minLength={6}
              value={pwForm.confirm_password}
              onChange={(e) =>
                setPwForm({ ...pwForm, confirm_password: e.target.value })
              }
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setPwModalOpen(false)}>
              取消
            </Button>
            <Button type="submit" disabled={savingPw}>
              {savingPw ? '提交中...' : '保存新密码'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
