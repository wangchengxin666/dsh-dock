export const STYLE_ATTR_PLUGIN = '@dsh-dock/app-gateway'

export const APP_GATEWAY_CSS = `
.ag-page { display:flex; flex-direction:column; height:100%; min-height:0; color:var(--dsw-alias-label-primary,#111827); font-family:inherit; font-size:14px; }
.ag-scroll { flex:1 1 auto; min-height:0; overflow-y:auto; padding:24px 28px 44px; }
.ag-container { max-width:1160px; margin:0 auto; display:flex; flex-direction:column; gap:16px; }
.ag-header { display:flex; flex-wrap:wrap; align-items:flex-start; justify-content:space-between; gap:12px; }
.ag-title-wrap { display:flex; align-items:flex-start; gap:12px; }
.ag-title-badge { width:40px; height:40px; border-radius:12px; display:inline-flex; align-items:center; justify-content:center; color:#fff; background:linear-gradient(135deg,#3b82f6 0%,#6366f1 55%,#06b6d4 100%); box-shadow:0 4px 12px rgba(59,130,246,.28); flex:none; }
.ag-title { margin:0; font-size:20px; font-weight:650; line-height:26px; }
.ag-subtitle { margin:4px 0 0; font-size:13.5px; color:var(--dsw-alias-label-secondary,#6b7280); }
.ag-card { border-radius:12px; border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.2)); background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.04)); padding:16px; display:flex; flex-direction:column; gap:12px; }
.ag-card-head { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px; }
.ag-card-title { font-size:15px; font-weight:600; display:inline-flex; align-items:center; gap:7px; }
.ag-list { display:flex; flex-direction:column; gap:10px; }
.ag-item { border-radius:10px; border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.18)); background:var(--dsw-alias-bg-base,rgba(255,255,255,.02)); padding:12px 14px; display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px; }
.ag-item-main { display:flex; flex-direction:column; gap:4px; min-width:220px; flex:1 1 auto; }
.ag-actions { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
.ag-badge { display:inline-flex; align-items:center; padding:2px 8px; border-radius:999px; font-size:11.5px; font-weight:600; border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.25)); background:rgba(128,128,128,.08); }
.ag-badge-ok { background:rgba(16,185,129,.12); color:#059669; border-color:rgba(16,185,129,.3); }
.ag-badge-warn { background:rgba(245,158,11,.12); color:#d97706; border-color:rgba(245,158,11,.35); }
.ag-badge-brand { background:rgba(99,102,241,.14); color:#6366f1; border-color:rgba(99,102,241,.32); }
.ag-mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; word-break:break-all; opacity:.88; }
.ag-link { color:var(--dsw-alias-link,#0284c7); text-decoration:none; word-break:break-all; font-size:13px; }
.ag-link:hover { text-decoration:underline; }
.ag-muted { color:var(--dsw-alias-label-secondary,#6b7280); font-size:13px; margin:0; }
.ag-form { display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:12px; border-radius:10px; border:1px dashed var(--dsw-alias-border-l2,rgba(128,128,128,.3)); }
.ag-input, .ag-select { padding:7px 10px; border-radius:8px; border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3)); background:var(--dsw-alias-bg-base,transparent); color:inherit; font-family:inherit; font-size:13px; }
.ag-btn { display:inline-flex; align-items:center; gap:5px; padding:6px 12px; border-radius:8px; border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3)); background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.06)); color:inherit; font-size:12.5px; font-weight:500; cursor:pointer; text-decoration:none; }
.ag-btn:hover { border-color:#6366f1; }
.ag-btn-sm { padding:4px 9px; font-size:12px; }
.ag-btn-primary { background:#6366f1; border-color:#6366f1; color:#fff; }
.ag-btn-danger { color:#dc2626; border-color:rgba(239,68,68,.35); }
.ag-log-wrap { display:flex; flex-direction:column; gap:6px; margin-top:4px; padding:10px 12px; border-radius:8px; border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.2)); background:rgba(15,23,42,.04); }
.ag-log-box { margin:0; max-height:260px; overflow:auto; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; line-height:1.5; white-space:pre-wrap; word-break:break-word; }
.ag-toast { position:fixed; right:24px; bottom:24px; z-index:99; padding:10px 14px; border-radius:10px; font-size:13px; font-weight:500; color:#fff; background:#111827; box-shadow:0 8px 24px rgba(0,0,0,.22); }
.ag-toast.err { background:#dc2626; }
.ag-tool { display:flex; flex-direction:column; gap:6px; }
.ag-tool-trigger { display:inline-flex; align-items:center; gap:7px; padding:5px 10px; border-radius:8px; border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.22)); background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.04)); color:inherit; cursor:pointer; font-size:12.5px; }
.ag-tool-body { padding:8px 10px; border-radius:8px; border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.16)); font-size:12px; white-space:pre-wrap; }
`

export function installStyles() {
  if (typeof document === 'undefined' || !document.head) return () => {}
  if (document.head.querySelector(`style[data-plugin="${STYLE_ATTR_PLUGIN}"]`)) return () => {}
  const el = document.createElement('style')
  el.setAttribute('data-plugin', STYLE_ATTR_PLUGIN)
  el.textContent = APP_GATEWAY_CSS
  document.head.appendChild(el)
  return () => { try { el.remove() } catch {} }
}
