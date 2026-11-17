export const MESH_CSS = `
/* --- Shared base, icons & buttons --- */
.sm-root, .sm-chat-shell {
  color: var(--dsw-alias-label-pri, #0f172a);
  background: var(--dsw-alias-bg-base, #f8fafc);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  box-sizing: border-box;
}
.sm-icon {
  display: inline-block;
  vertical-align: -0.16em;
  flex-shrink: 0;
}
.sm-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 5px 11px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 7px;
  border: 1px solid var(--dsw-alias-border-def, #cbd5e1);
  background: var(--dsw-alias-bg-elevated, #f1f5f9);
  color: var(--dsw-alias-label-pri, #0f172a);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.14s ease;
}
.sm-btn:not(.sm-btn-primary):hover:not(:disabled) {
  background: var(--dsw-alias-bg-hover, #e2e8f0);
}
.sm-btn-primary {
  background: var(--dsw-alias-Interactive-pri, #0284c7);
  border-color: var(--dsw-alias-Interactive-pri, #0284c7);
  color: #ffffff;
}
.sm-btn.sm-btn-primary:hover:not(:disabled) {
  background: var(--dsw-alias-Interactive-pri-hover, #0369a1);
}
.sm-btn-ghost {
  padding: 4px 8px;
  font-size: 11.5px;
  border-color: transparent;
  background: transparent;
  color: var(--dsw-alias-label-sec, #475569);
}
.sm-btn-ghost:hover:not(:disabled) {
  background: var(--dsw-alias-bg-elevated, #f1f5f9);
  color: var(--dsw-alias-label-pri, #0f172a);
}
.sm-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.sm-input {
  flex: 1;
  min-width: 0;
  padding: 7px 10px;
  font-size: 12.5px;
  border-radius: 7px;
  border: 1px solid var(--dsw-alias-border-def, #cbd5e1);
  background: var(--dsw-alias-bg-base, #f8fafc);
  color: var(--dsw-alias-label-pri, #0f172a);
  outline: none;
}
.sm-input:focus {
  border-color: var(--dsw-alias-Interactive-pri, #0284c7);
}
.sm-code-inline {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11.5px;
  padding: 3px 7px;
  border-radius: 5px;
  background: var(--dsw-alias-bg-elevated, #f1f5f9);
  color: var(--dsw-alias-label-pri, #0f172a);
}
.sm-badge {
  display: inline-flex;
  align-items: center;
  gap: 3.5px;
  padding: 1.5px 7px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
  background: rgba(14, 165, 233, 0.13);
  color: var(--dsw-alias-Interactive-pri, #0284c7);
}
.sm-badge-moderator {
  background: rgba(245, 158, 11, 0.15);
  color: #b45309;
  border: 1px solid rgba(245, 158, 11, 0.34);
}
.sm-badge-unread {
  background: #ef4444;
  color: #ffffff;
}
.sm-inline-mention {
  display: inline-flex;
  align-items: center;
  gap: 3.5px;
  padding: 1px 7px;
  margin: 0 2px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  background: rgba(139, 92, 246, 0.14);
  color: #7c3aed;
  border: 1px solid rgba(139, 92, 246, 0.28);
  vertical-align: baseline;
}
.sm-inline-file {
  display: inline-flex;
  align-items: center;
  gap: 3.5px;
  padding: 1px 7px;
  margin: 0 2px;
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11.5px;
  background: rgba(14, 165, 233, 0.13);
  color: var(--dsw-alias-Interactive-pri, #0284c7);
  border: 1px solid rgba(14, 165, 233, 0.28);
  vertical-align: baseline;
}
.sm-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sm-alert {
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  background: rgba(239, 68, 68, 0.12);
  color: #dc2626;
}
.sm-toast {
  padding: 7px 12px;
  border-radius: 8px;
  font-size: 12px;
  background: rgba(16, 185, 129, 0.14);
  color: #059669;
}

/* --- Left Sidebar Main View: Minimalist IM & Team Groups --- */
.sm-chat-shell {
  display: grid;
  grid-template-columns: 268px 1fr;
  height: 100%;
  min-height: 560px;
  overflow: hidden;
}
@media (max-width: 860px) {
  .sm-chat-shell {
    grid-template-columns: 1fr;
  }
}
.sm-conv-sidebar {
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--dsw-alias-border-def, #e2e8f0);
  background: var(--dsw-alias-bg-surface, #ffffff);
  overflow: hidden;
}
.sm-conv-top {
  padding: 14px 14px 10px;
  border-bottom: 1px solid var(--dsw-alias-border-def, #e2e8f0);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sm-conv-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.sm-conv-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}
.sm-group-drawer {
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-elevated, #f1f5f9);
  border: 1px solid var(--dsw-alias-border-def, #e2e8f0);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sm-peer-checks {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.sm-peer-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11.5px;
  white-space: nowrap;
  background: var(--dsw-alias-bg-surface, #ffffff);
  border: 1px solid var(--dsw-alias-border-def, #e2e8f0);
  cursor: pointer;
}
.sm-conv-list {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.sm-room-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 11px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease;
}
.sm-room-item:hover {
  background: var(--dsw-alias-bg-elevated, #f1f5f9);
}
.sm-room-item.active {
  border-color: rgba(14, 165, 233, 0.35);
  background: rgba(14, 165, 233, 0.1);
}
.sm-chat-main {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 520px;
  background: var(--dsw-alias-bg-base, #f8fafc);
  overflow: hidden;
}
.sm-chat-header {
  padding: 12px 18px;
  background: var(--dsw-alias-bg-surface, #ffffff);
  border-bottom: 1px solid var(--dsw-alias-border-def, #e2e8f0);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}
.sm-member-tag {
  display: inline-flex;
  align-items: center;
  gap: 4.5px;
  padding: 2.5px 9px;
  border-radius: 999px;
  font-size: 11px;
  background: var(--dsw-alias-bg-elevated, #f1f5f9);
  border: 1px solid var(--dsw-alias-border-def, #e2e8f0);
  color: var(--dsw-alias-label-pri, #0f172a);
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.12s ease;
}
.sm-member-tag.moderator {
  background: rgba(245, 158, 11, 0.12);
  border-color: rgba(245, 158, 11, 0.42);
  color: #b45309;
  font-weight: 600;
}
.sm-member-tag:hover {
  border-color: var(--dsw-alias-Interactive-pri, #0284c7);
}
.sm-messages {
  flex: 1;
  padding: 16px 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sm-topic-divider {
  align-self: center;
  font-size: 11px;
  color: var(--dsw-alias-label-sec, #64748b);
  padding: 4px 12px;
  opacity: 0.8;
}
@keyframes sm-dot-bounce {
  0%, 80%, 100% { transform: translateY(0) scale(0.8); opacity: 0.4; }
  40% { transform: translateY(-3px) scale(1.05); opacity: 1; }
}
@keyframes sm-ring-pulse {
  0% { box-shadow: 0 0 0 0 rgba(14, 165, 233, 0.55); }
  70% { box-shadow: 0 0 0 5px rgba(14, 165, 233, 0); }
  100% { box-shadow: 0 0 0 0 rgba(14, 165, 233, 0); }
}
.sm-dot-live {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--dsw-alias-Interactive-pri, #0ea5e9);
  animation: sm-ring-pulse 1.5s infinite;
  flex-shrink: 0;
}
.sm-member-tag.busy {
  border-color: rgba(14, 165, 233, 0.45);
}
.sm-typing-bubble {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 13px;
  border-radius: 10px;
  background: rgba(14, 165, 233, 0.07);
  border: 1px dashed rgba(14, 165, 233, 0.35);
  color: var(--dsw-alias-label-sec, #334155);
  font-size: 12px;
  max-width: 82%;
}
.sm-typing-dots {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 12px;
}
.sm-typing-dot {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--dsw-alias-Interactive-pri, #0284c7);
  animation: sm-dot-bounce 1.2s infinite ease-in-out;
}
.sm-typing-dot:nth-child(2) {
  animation-delay: 0.16s;
}
.sm-typing-dot:nth-child(3) {
  animation-delay: 0.32s;
}
.sm-msg {
  max-width: 82%;
  padding: 10px 13px;
  border-radius: 10px;
  background: var(--dsw-alias-bg-surface, #ffffff);
  border: 1px solid var(--dsw-alias-border-def, #e2e8f0);
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 13px;
  align-self: flex-start;
}
.sm-msg.self {
  align-self: flex-end;
  border-color: rgba(14, 165, 233, 0.38);
  background: rgba(14, 165, 233, 0.08);
}
.sm-msg.agent {
  border-left: 3px solid #8b5cf6;
}
.sm-msg-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 11px;
  color: var(--dsw-alias-label-sec, #64748b);
}
.sm-msg-author {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-weight: 600;
  color: var(--dsw-alias-label-pri, #0f172a);
}
.sm-file-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 7px 10px;
  border-radius: 7px;
  background: var(--dsw-alias-bg-elevated, #f1f5f9);
  border: 1px solid var(--dsw-alias-border-def, #e2e8f0);
  font-size: 11.5px;
}

/* --- Unified Single Composer with @ and # Popover --- */
.sm-composer-wrap {
  position: relative;
  padding: 12px 18px 14px;
  background: var(--dsw-alias-bg-surface, #ffffff);
  border-top: 1px solid var(--dsw-alias-border-def, #e2e8f0);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sm-popover {
  position: absolute;
  left: 18px;
  right: 18px;
  bottom: calc(100% - 4px);
  max-height: 220px;
  overflow-y: auto;
  background: var(--dsw-alias-bg-surface, #ffffff);
  border: 1px solid var(--dsw-alias-border-def, #cbd5e1);
  border-radius: 10px;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.14);
  padding: 6px;
  z-index: 40;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sm-popover-header {
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--dsw-alias-label-sec, #64748b);
}
.sm-popover-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12.5px;
  cursor: pointer;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-pri, #0f172a);
  text-align: left;
}
.sm-popover-item:hover, .sm-popover-item.active {
  background: rgba(14, 165, 233, 0.12);
}
.sm-attached-files {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.sm-attached-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11.5px;
  background: rgba(14, 165, 233, 0.12);
  color: var(--dsw-alias-Interactive-pri, #0284c7);
  border: 1px solid rgba(14, 165, 233, 0.28);
}
.sm-composer-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 9px;
  border: 1px solid var(--dsw-alias-border-def, #cbd5e1);
  background: var(--dsw-alias-bg-base, #f8fafc);
}
.sm-composer-box:focus-within {
  border-color: var(--dsw-alias-Interactive-pri, #0284c7);
}
.sm-composer-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-pri, #0f172a);
  font-size: 13px;
  padding: 4px 6px;
  outline: none;
}

/* --- Settings View: Pairing & Node Config (No label wrap!) --- */
.sm-root {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 24px;
  max-width: 860px;
}
.sm-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.sm-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.sm-subtitle {
  margin: 4px 0 0;
  font-size: 12.5px;
  color: var(--dsw-alias-label-sec, #475569);
  line-height: 1.45;
}
.sm-card {
  background: var(--dsw-alias-bg-surface, #ffffff);
  border: 1px solid var(--dsw-alias-border-def, #e2e8f0);
  border-radius: 10px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sm-card-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.sm-invite-box {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-elevated, #f1f5f9);
  border: 1px solid var(--dsw-alias-border-def, #e2e8f0);
}
.sm-invite-item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.sm-invite-label {
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
  min-width: 130px;
  color: var(--dsw-alias-label-sec, #334155);
}
.sm-invite-code {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  padding: 5px 9px;
  border-radius: 6px;
  background: var(--dsw-alias-bg-surface, #ffffff);
  border: 1px solid var(--dsw-alias-border-def, #cbd5e1);
  color: var(--dsw-alias-label-pri, #0f172a);
}
.sm-peer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-elevated, #f1f5f9);
  border: 1px solid var(--dsw-alias-border-def, #e2e8f0);
}
`

export function installStyles() {
  if (typeof document === 'undefined' || !document.head) return () => {}
  const existing = document.head.querySelector('style[data-plugin="sandbox-mesh"]')
  if (existing) {
    return () => { existing.remove() }
  }
  const styleEl = document.createElement('style')
  styleEl.setAttribute('data-plugin', 'sandbox-mesh')
  styleEl.textContent = MESH_CSS
  document.head.appendChild(styleEl)
  return () => {
    styleEl.remove()
  }
}
