export const STYLE_ATTR_PLUGIN = '@dsh-dock/self-evolve'

export const EVOLVE_CSS = `
.se-page { display:flex; flex-direction:column; height:100%; min-height:0; color:var(--dsw-alias-label-primary,#111827); font-family:inherit; font-size:14px; }
.se-scroll { flex:1 1 auto; min-height:0; overflow-y:auto; padding:24px 28px 44px; }
.se-container { max-width:1160px; margin:0 auto; display:flex; flex-direction:column; gap:16px; }
.se-header { display:flex; flex-wrap:wrap; align-items:flex-start; justify-content:space-between; gap:12px; }
.se-title-wrap { display:flex; align-items:flex-start; gap:12px; }
.se-title-badge { width:40px; height:40px; border-radius:12px; display:inline-flex; align-items:center; justify-content:center; color:#fff; background:linear-gradient(135deg,#10b981 0%,#14b8a6 55%,#0ea5e9 100%); box-shadow:0 4px 12px rgba(16,185,129,.28); flex:none; }
.se-title { margin:0; font-size:20px; font-weight:650; line-height:26px; }
.se-subtitle { margin:4px 0 0; font-size:13.5px; color:var(--dsw-alias-label-secondary,#6b7280); }
.se-stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; }
.se-stat { border-radius:12px; border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.2)); background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.04)); padding:12px 16px; }
.se-stat-label { font-size:12px; color:var(--dsw-alias-label-secondary,#6b7280); }
.se-stat-val { font-size:22px; font-weight:700; margin-top:4px; }
.se-card { border-radius:12px; border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.2)); background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.04)); padding:16px; display:flex; flex-direction:column; gap:12px; }
.se-card-head { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px; }
.se-card-title { font-size:15px; font-weight:600; }
.se-list { display:flex; flex-direction:column; gap:10px; }
.se-item { border-radius:10px; border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.18)); background:var(--dsw-alias-bg-base,rgba(255,255,255,.02)); padding:12px 14px; display:flex; flex-direction:column; gap:7px; }
.se-row { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px; }
.se-actions { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
.se-badge { display:inline-flex; align-items:center; padding:2px 8px; border-radius:999px; font-size:11.5px; font-weight:600; border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.25)); background:rgba(128,128,128,.08); }
.se-badge-ok { background:rgba(16,185,129,.12); color:#059669; border-color:rgba(16,185,129,.3); }
.se-badge-warn { background:rgba(245,158,11,.12); color:#d97706; border-color:rgba(245,158,11,.35); }
.se-badge-err { background:rgba(239,68,68,.12); color:#dc2626; border-color:rgba(239,68,68,.35); }
.se-mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; word-break:break-all; opacity:.9; }
.se-muted { color:var(--dsw-alias-label-secondary,#6b7280); font-size:13px; margin:0; }
.se-input, .se-textarea { width:100%; box-sizing:border-box; padding:8px 10px; border-radius:8px; border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3)); background:var(--dsw-alias-bg-base,transparent); color:inherit; font-family:inherit; font-size:13px; }
.se-textarea { min-height:110px; resize:vertical; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12.5px; }
.se-btn { display:inline-flex; align-items:center; gap:5px; padding:6px 12px; border-radius:8px; border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3)); background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.06)); color:inherit; font-size:12.5px; font-weight:500; cursor:pointer; }
.se-btn:hover { border-color:#10b981; }
.se-btn-sm { padding:4px 9px; font-size:12px; }
.se-btn-primary { background:#10b981; border-color:#10b981; color:#fff; }
.se-btn-danger { color:#dc2626; border-color:rgba(239,68,68,.35); }
.se-toast { position:fixed; right:24px; bottom:24px; z-index:99; padding:10px 14px; border-radius:10px; font-size:13px; font-weight:500; color:#fff; background:#111827; box-shadow:0 8px 24px rgba(0,0,0,.22); }
.se-toast.err { background:#dc2626; }
.se-tool { display:flex; flex-direction:column; gap:6px; }
.se-tool-trigger { display:inline-flex; align-items:center; gap:7px; padding:5px 10px; border-radius:8px; border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.22)); background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.04)); color:inherit; cursor:pointer; font-size:12.5px; }
.se-tool-body { padding:8px 10px; border-radius:8px; border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.16)); font-size:12px; white-space:pre-wrap; }
`

export function installStyles() {
  if (typeof document === 'undefined' || !document.head) return () => {}
  if (document.head.querySelector(`style[data-plugin="${STYLE_ATTR_PLUGIN}"]`)) return () => {}
  const el = document.createElement('style')
  el.setAttribute('data-plugin', STYLE_ATTR_PLUGIN)
  el.textContent = EVOLVE_CSS
  document.head.appendChild(el)
  return () => { try { el.remove() } catch {} }
}
