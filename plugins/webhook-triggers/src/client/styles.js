export const STYLE_ATTR_PLUGIN = '@dsh-dock/webhook-triggers'

export const WEBHOOK_CSS = `
.wh-page { display:flex; flex-direction:column; height:100%; min-height:0; color:var(--dsw-alias-label-primary,#111827); font-family:inherit; font-size:14px; }
.wh-scroll { flex:1 1 auto; min-height:0; overflow-y:auto; padding:24px 28px 44px; }
.wh-container { max-width:1160px; margin:0 auto; display:flex; flex-direction:column; gap:16px; }
.wh-header { display:flex; flex-wrap:wrap; align-items:flex-start; justify-content:space-between; gap:12px; }
.wh-title-wrap { display:flex; align-items:flex-start; gap:12px; }
.wh-title-badge { width:40px; height:40px; border-radius:12px; display:inline-flex; align-items:center; justify-content:center; color:#fff; background:linear-gradient(135deg,#f97316 0%,#ec4899 55%,#8b5cf6 100%); box-shadow:0 4px 12px rgba(236,72,153,.28); flex:none; }
.wh-title { margin:0; font-size:20px; font-weight:650; line-height:26px; }
.wh-subtitle { margin:4px 0 0; font-size:13.5px; color:var(--dsw-alias-label-secondary,#6b7280); }
.wh-card { border-radius:12px; border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.2)); background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.04)); padding:16px; display:flex; flex-direction:column; gap:12px; }
.wh-card-head { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px; }
.wh-card-title { font-size:15px; font-weight:600; }
.wh-list { display:flex; flex-direction:column; gap:10px; }
.wh-item { border-radius:10px; border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.18)); background:var(--dsw-alias-bg-base,rgba(255,255,255,.02)); padding:12px 14px; display:flex; flex-direction:column; gap:8px; }
.wh-row { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px; }
.wh-actions { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
.wh-badge { display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:999px; font-size:11.5px; font-weight:600; border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.25)); background:rgba(128,128,128,.08); }
.wh-badge-ok { background:rgba(16,185,129,.12); color:#059669; border-color:rgba(16,185,129,.3); }
.wh-badge-warn { background:rgba(245,158,11,.12); color:#d97706; border-color:rgba(245,158,11,.35); }
.wh-badge-err { background:rgba(239,68,68,.12); color:#dc2626; border-color:rgba(239,68,68,.35); }
.wh-badge-brand { background:rgba(236,72,153,.12); color:#db2777; border-color:rgba(236,72,153,.3); }
.wh-mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; word-break:break-all; opacity:.9; }
.wh-muted { color:var(--dsw-alias-label-secondary,#6b7280); font-size:13px; margin:0; }
.wh-form { display:flex; flex-direction:column; gap:10px; padding:12px; border-radius:10px; border:1px dashed var(--dsw-alias-border-l2,rgba(128,128,128,.3)); }
.wh-input, .wh-select, .wh-textarea { width:100%; box-sizing:border-box; padding:8px 10px; border-radius:8px; border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3)); background:var(--dsw-alias-bg-base,transparent); color:inherit; font-family:inherit; font-size:13px; }
.wh-textarea { min-height:76px; resize:vertical; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12.5px; }
.wh-btn { display:inline-flex; align-items:center; gap:5px; padding:6px 12px; border-radius:8px; border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3)); background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.06)); color:inherit; font-size:12.5px; font-weight:500; cursor:pointer; }
.wh-btn:hover { border-color:#ec4899; }
.wh-btn-sm { padding:4px 9px; font-size:12px; }
.wh-btn-primary { background:#ec4899; border-color:#ec4899; color:#fff; }
.wh-btn-danger { color:#dc2626; border-color:rgba(239,68,68,.35); }
.wh-pre { margin:0; padding:8px 10px; border-radius:8px; background:rgba(128,128,128,.08); font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; white-space:pre-wrap; word-break:break-word; }
.wh-toast { position:fixed; right:24px; bottom:24px; z-index:99; padding:10px 14px; border-radius:10px; font-size:13px; font-weight:500; color:#fff; background:#111827; box-shadow:0 8px 24px rgba(0,0,0,.22); }
.wh-toast.err { background:#dc2626; }
.wh-tool { display:flex; flex-direction:column; gap:6px; }
.wh-tool-trigger { display:inline-flex; align-items:center; gap:7px; padding:5px 10px; border-radius:8px; border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.22)); background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.04)); color:inherit; cursor:pointer; font-size:12.5px; }
.wh-tool-body { padding:8px 10px; border-radius:8px; border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.16)); font-size:12px; white-space:pre-wrap; }
`

export function installStyles() {
  if (typeof document === 'undefined' || !document.head) return () => {}
  if (document.head.querySelector(`style[data-plugin="${STYLE_ATTR_PLUGIN}"]`)) return () => {}
  const el = document.createElement('style')
  el.setAttribute('data-plugin', STYLE_ATTR_PLUGIN)
  el.textContent = WEBHOOK_CSS
  document.head.appendChild(el)
  return () => { try { el.remove() } catch {} }
}
