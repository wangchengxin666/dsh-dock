export const MESH_CSS = `
/* --- Shared base, icons, buttons & DSH theme tokens --- */
.sm-root, .sm-chat-shell {
  --sm-bg-base: var(--dsw-alias-bg-base, #f8fafc);
  --sm-bg-layer1: var(--dsw-alias-bg-layer-1, #ffffff);
  --sm-bg-layer2: var(--dsw-alias-bg-layer-2, #f1f5f9);
  --sm-bg-sidebar: var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-layer-1, #ffffff));
  --sm-bg-input: var(--dsw-specific-input-major, var(--dsw-alias-bg-base, #f8fafc));
  --sm-bg-code: var(--dsw-alias-markdown-code-block, var(--dsw-alias-bg-layer-2, #f1f5f9));
  --sm-bg-bubble-self: var(--dsw-specific-bubble, rgba(14, 165, 233, 0.11));
  --sm-fg-primary: var(--dsw-alias-label-primary, #0f172a);
  --sm-fg-secondary: var(--dsw-alias-label-secondary, #475569);
  --sm-border-l1: var(--dsw-alias-border-l1, rgba(148, 163, 184, 0.22));
  --sm-border-l2: var(--dsw-alias-border-l2, rgba(148, 163, 184, 0.36));
  --sm-accent: var(--dsw-alias-state-business-primary, var(--dsw-alias-link, #0284c7));
  --sm-brand: var(--dsw-alias-brand-primary, #0284c7);
  --sm-brand-fg: var(--dsw-alias-bg-base, #ffffff);
  color: var(--sm-fg-primary);
  background: var(--sm-bg-base);
  font-family: inherit, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  box-sizing: border-box;
}
.sm-root *, .sm-chat-shell * {
  box-sizing: border-box;
}
.sm-icon {
  display: inline-block;
  vertical-align: -0.16em;
  flex-shrink: 0;
}
.sm-nav-icon-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.sm-nav-badge-dot {
  position: absolute;
  top: -2px;
  right: -3px;
  min-width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #ef4444;
  border: 1.5px solid var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-base, #ffffff));
}
.sm-nav-badge-dot.live {
  background: var(--dsw-alias-state-business-primary, #0ea5e9);
  animation: sm-ring-pulse 1.5s infinite;
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
  border: 1px solid var(--sm-border-l2, var(--dsw-alias-border-l2, rgba(148, 163, 184, 0.36)));
  background: var(--sm-bg-layer1, var(--dsw-alias-bg-layer-1, #ffffff));
  color: var(--sm-fg-primary, var(--dsw-alias-label-primary, #0f172a));
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background 0.14s ease, border-color 0.14s ease, opacity 0.14s ease;
}
.sm-btn:not(.sm-btn-primary):hover:not(:disabled) {
  background: var(--sm-bg-layer2, var(--dsw-alias-bg-layer-2, #f1f5f9));
  border-color: var(--sm-accent, var(--dsw-alias-link, #0284c7));
}
.sm-btn-primary {
  background: var(--sm-brand, var(--dsw-alias-brand-primary, #0284c7));
  border-color: transparent;
  color: var(--sm-brand-fg, var(--dsw-alias-bg-base, #ffffff));
}
.sm-btn.sm-btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}
.sm-btn-ghost {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  font-size: 11.5px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--sm-fg-secondary, var(--dsw-alias-label-secondary, #475569));
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s ease, color 0.12s ease;
}
.sm-btn-ghost:hover:not(:disabled) {
  background: var(--sm-bg-layer2, var(--dsw-alias-bg-layer-2, rgba(148, 163, 184, 0.16)));
  color: var(--sm-fg-primary, var(--dsw-alias-label-primary, #0f172a));
}
.sm-btn:disabled, .sm-btn-ghost:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}
.sm-input {
  flex: 1;
  min-width: 0;
  padding: 7px 10px;
  font-size: 12.5px;
  border-radius: 7px;
  border: 1px solid var(--sm-border-l2, var(--dsw-alias-border-l2, rgba(148, 163, 184, 0.36)));
  background: var(--sm-bg-input, var(--dsw-specific-input-major, #f8fafc));
  color: var(--sm-fg-primary, var(--dsw-alias-label-primary, #0f172a));
  outline: none;
  transition: border-color 0.14s ease;
}
.sm-input:focus {
  border-color: var(--sm-accent, var(--dsw-alias-link, #0284c7));
}
.sm-code-inline {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11.5px;
  padding: 2.5px 6px;
  border-radius: 5px;
  background: var(--sm-bg-code, var(--dsw-alias-markdown-code-block, rgba(148, 163, 184, 0.14)));
  color: var(--sm-fg-primary, var(--dsw-alias-label-primary, #0f172a));
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
  background: rgba(14, 165, 233, 0.14);
  color: var(--sm-accent, var(--dsw-alias-link, #0284c7));
}
.sm-badge-moderator {
  background: rgba(245, 158, 11, 0.16);
  color: #d97706;
  border: 1px solid rgba(245, 158, 11, 0.34);
}
.sm-badge-unread {
  background: #ef4444;
  color: #ffffff;
  min-width: 18px;
  justify-content: center;
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
  background: rgba(139, 92, 246, 0.15);
  color: #8b5cf6;
  border: 1px solid rgba(139, 92, 246, 0.3);
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
  color: var(--sm-accent, var(--dsw-alias-link, #0284c7));
  border: 1px solid rgba(14, 165, 233, 0.3);
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
  border: 1px solid rgba(239, 68, 68, 0.28);
  color: var(--dsw-alias-state-error-primary, #dc2626);
}
.sm-toast {
  padding: 7px 12px;
  border-radius: 8px;
  font-size: 12px;
  background: rgba(16, 185, 129, 0.13);
  border: 1px solid rgba(16, 185, 129, 0.28);
  color: var(--dsw-alias-state-success-primary, #059669);
}

/* --- Avatars & Status Dots --- */
.sm-avatar {
  position: relative;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
  border: 1px solid transparent;
  user-select: none;
}
.sm-avatar-sm {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  font-size: 11.5px;
}
.sm-avatar-dot {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 9px;
  height: 9px;
  border-radius: 999px;
  border: 1.8px solid var(--sm-bg-sidebar);
  background: #10b981;
}
.sm-avatar-dot.offline {
  background: #94a3b8;
}
.sm-avatar-dot.err {
  background: #ef4444;
}
.sm-avatar-dot.live {
  background: var(--sm-accent);
  animation: sm-ring-pulse 1.5s infinite;
}

/* --- Left Sidebar Main View: Polished IM & Team Groups --- */
.sm-chat-shell {
  display: grid;
  grid-template-columns: 276px 1fr;
  height: 100%;
  min-height: 560px;
  overflow: hidden;
  position: relative;
}
@media (max-width: 860px) {
  .sm-chat-shell {
    grid-template-columns: 1fr;
  }
}
.sm-conv-sidebar {
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--sm-border-l1);
  background: var(--sm-bg-sidebar);
  overflow: hidden;
}
.sm-conv-top {
  padding: 14px 14px 10px;
  border-bottom: 1px solid var(--sm-border-l1);
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
  border-radius: 9px;
  background: var(--sm-bg-layer2);
  border: 1px solid var(--sm-border-l1);
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
  background: var(--sm-bg-layer1);
  border: 1px solid var(--sm-border-l1);
  cursor: pointer;
}
.sm-conv-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sm-room-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease, border-color 0.12s ease;
}
.sm-room-item:hover {
  background: var(--sm-bg-layer2);
}
.sm-room-item.active {
  border-color: color-mix(in srgb, var(--sm-accent) 34%, transparent);
  background: var(--dsw-specific-sidebar-nav-item-active, rgba(14, 165, 233, 0.11));
}
.sm-room-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.sm-room-top-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.sm-room-name {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--sm-fg-primary);
}
.sm-room-time {
  font-size: 10.5px;
  color: var(--sm-fg-secondary);
  white-space: nowrap;
  flex-shrink: 0;
}
.sm-room-preview-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.sm-room-preview {
  font-size: 11.5px;
  color: var(--sm-fg-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sm-room-preview.live {
  color: var(--sm-accent);
  font-weight: 500;
}

/* --- Right Chat Workspace (with optional Inspector Drawer) --- */
.sm-chat-stage {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  position: relative;
}
.sm-chat-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  height: 100%;
  min-height: 520px;
  background: var(--sm-bg-base);
  overflow: hidden;
  position: relative;
}
.sm-chat-header {
  padding: 11px 18px;
  background: var(--sm-bg-layer1);
  border-bottom: 1px solid var(--sm-border-l1);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.sm-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1 1 240px;
}
.sm-header-meta {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}
.sm-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.sm-member-tag {
  display: inline-flex;
  align-items: center;
  gap: 4.5px;
  padding: 2px 8.5px;
  border-radius: 999px;
  font-size: 11px;
  background: var(--sm-bg-layer2);
  border: 1px solid var(--sm-border-l1);
  color: var(--sm-fg-primary);
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.12s ease, background 0.12s ease;
}
.sm-member-tag.moderator {
  background: rgba(245, 158, 11, 0.13);
  border-color: rgba(245, 158, 11, 0.4);
  color: #d97706;
  font-weight: 600;
}
.sm-member-tag:hover:not(:disabled) {
  border-color: var(--sm-accent);
}
.sm-member-tag.busy {
  border-color: color-mix(in srgb, var(--sm-accent) 55%, transparent);
}

/* --- Live Multi-Sandbox Collaboration Topology Strip --- */
.sm-topology-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 7px 18px;
  background: color-mix(in srgb, var(--sm-accent) 7%, var(--sm-bg-layer1));
  border-bottom: 1px solid color-mix(in srgb, var(--sm-accent) 22%, var(--sm-border-l1));
  font-size: 11.5px;
  color: var(--sm-fg-primary);
}
.sm-topo-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-weight: 600;
  color: var(--sm-accent);
  white-space: nowrap;
}
.sm-topo-flow {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.sm-topo-node {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--sm-bg-layer1);
  border: 1px solid color-mix(in srgb, var(--sm-accent) 34%, var(--sm-border-l1));
  font-weight: 500;
}
.sm-topo-edge {
  color: var(--sm-accent);
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 11px;
  opacity: 0.85;
}

/* --- Message Stream --- */
.sm-messages {
  flex: 1;
  padding: 16px 20px 18px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sm-topic-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  align-self: stretch;
  margin: 6px 0;
  font-size: 11px;
  color: var(--sm-fg-secondary);
}
.sm-topic-divider::before,
.sm-topic-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--sm-border-l1);
}
.sm-system-pill {
  align-self: center;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 11.5px;
  color: var(--sm-fg-secondary);
  background: var(--sm-bg-layer2);
  border: 1px solid var(--sm-border-l1);
  max-width: 90%;
  text-align: center;
}

/* --- Collapsible Collaboration / Delegation Group --- */
.sm-collab-group {
  align-self: flex-start;
  width: min(88%, 720px);
  border-radius: 10px;
  border: 1px solid var(--sm-border-l1);
  background: var(--sm-bg-layer1);
  overflow: hidden;
}
.sm-collab-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--sm-fg-primary);
  font-size: 12px;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease;
}
.sm-collab-toggle:hover {
  background: var(--sm-bg-layer2);
}
.sm-collab-summary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
  overflow: hidden;
}
.sm-collab-preview {
  color: var(--sm-fg-secondary);
  font-size: 11.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sm-collab-steps {
  border-top: 1px solid var(--sm-border-l1);
  padding: 8px 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--sm-bg-base);
}
.sm-collab-step {
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--sm-border-l1);
  background: var(--sm-bg-layer1);
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12.5px;
}
.sm-collab-step.dispatch {
  border-left: 2.5px solid #f59e0b;
}
.sm-collab-step.report {
  border-left: 2.5px solid #8b5cf6;
}
.sm-collab-step-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: var(--sm-fg-secondary);
}

/* --- Typing / Live Indicators --- */
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
  background: var(--sm-accent, var(--dsw-alias-link, #0ea5e9));
  animation: sm-ring-pulse 1.5s infinite;
  flex-shrink: 0;
}
.sm-typing-bubble {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 13px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--sm-accent) 8%, var(--sm-bg-layer1));
  border: 1px dashed color-mix(in srgb, var(--sm-accent) 42%, transparent);
  color: var(--sm-fg-secondary);
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
  background: var(--sm-accent);
  animation: sm-dot-bounce 1.2s infinite ease-in-out;
}
.sm-typing-dot:nth-child(2) { animation-delay: 0.16s; }
.sm-typing-dot:nth-child(3) { animation-delay: 0.32s; }

/* --- Chat Message Bubbles --- */
.sm-msg {
  position: relative;
  max-width: 84%;
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--sm-bg-layer1);
  border: 1px solid var(--sm-border-l1);
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  align-self: flex-start;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
}
.sm-msg.self {
  align-self: flex-end;
  border-color: color-mix(in srgb, var(--sm-accent) 32%, var(--sm-border-l1));
  background: var(--sm-bg-bubble-self);
}
.sm-msg.agent {
  border-left: 3px solid #8b5cf6;
}
.sm-msg.moderator-agent {
  border-left: 3px solid #f59e0b;
}
.sm-msg-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 11px;
  color: var(--sm-fg-secondary);
}
.sm-msg-author {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-weight: 600;
  color: var(--sm-fg-primary);
}
.sm-msg-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.14s ease;
}
.sm-msg:hover .sm-msg-actions,
.sm-msg:focus-within .sm-msg-actions {
  opacity: 1;
}
.sm-msg-act-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border-radius: 5px;
  border: none;
  background: transparent;
  color: var(--sm-fg-secondary);
  font-size: 11px;
  cursor: pointer;
}
.sm-msg-act-btn:hover {
  background: var(--sm-bg-layer2);
  color: var(--sm-fg-primary);
}

/* --- Rich Markdown Typography --- */
.sm-md {
  display: flex;
  flex-direction: column;
  gap: 7px;
  line-height: 1.58;
  word-break: break-word;
  color: var(--sm-fg-primary, var(--dsw-alias-label-primary, #0f172a));
}
.sm-md-p {
  margin: 0;
}
.sm-md-h {
  margin: 4px 0 0;
  font-weight: 650;
  line-height: 1.35;
  color: var(--sm-fg-primary, var(--dsw-alias-label-primary, #0f172a));
}
.sm-md-h1 { font-size: 15.5px; }
.sm-md-h2 { font-size: 14.5px; }
.sm-md-h3 { font-size: 13.5px; }
.sm-md-h4 { font-size: 13px; }
.sm-md-hr {
  border: none;
  border-top: 1px solid var(--sm-border-l1, var(--dsw-alias-border-l1, rgba(148, 163, 184, 0.28)));
  margin: 4px 0;
}
.sm-md-quote {
  margin: 0;
  padding: 5px 10px;
  border-left: 3px solid var(--sm-accent, var(--dsw-alias-link, #0284c7));
  background: color-mix(in srgb, var(--sm-accent, #0284c7) 6%, transparent);
  border-radius: 0 6px 6px 0;
  color: var(--sm-fg-secondary, var(--dsw-alias-label-secondary, #475569));
}
.sm-md-list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.sm-md-inline-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.88em;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--sm-bg-code, var(--dsw-alias-markdown-code-block, rgba(148, 163, 184, 0.16)));
  border: 1px solid var(--sm-border-l1, var(--dsw-alias-border-l1, rgba(148, 163, 184, 0.22)));
}
.sm-md-codeblock {
  border-radius: 8px;
  border: 1px solid var(--sm-border-l1, var(--dsw-alias-border-l1, rgba(148, 163, 184, 0.26)));
  background: var(--sm-bg-code, var(--dsw-alias-markdown-code-block, #f1f5f9));
  overflow: hidden;
}
.sm-md-code-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 10px;
  border-bottom: 1px solid var(--sm-border-l1, var(--dsw-alias-border-l1, rgba(148, 163, 184, 0.2)));
  font-size: 11px;
  color: var(--sm-fg-secondary, var(--dsw-alias-label-secondary, #64748b));
}
.sm-md-code-lang {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  text-transform: lowercase;
}
.sm-md-copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 5px;
  border: none;
  background: transparent;
  color: var(--sm-fg-secondary, var(--dsw-alias-label-secondary, #475569));
  font-size: 11px;
  cursor: pointer;
}
.sm-md-copy-btn:hover {
  background: rgba(148, 163, 184, 0.18);
  color: var(--sm-fg-primary, var(--dsw-alias-label-primary, #0f172a));
}
.sm-md-pre {
  margin: 0;
  padding: 9px 12px;
  overflow-x: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
}
.sm-md-table-wrap {
  width: 100%;
  overflow-x: auto;
  border-radius: 8px;
  border: 1px solid var(--sm-border-l1, var(--dsw-alias-border-l1, rgba(148, 163, 184, 0.26)));
}
.sm-md-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.sm-md-table th,
.sm-md-table td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--sm-border-l1, var(--dsw-alias-border-l1, rgba(148, 163, 184, 0.2)));
  text-align: left;
  vertical-align: top;
}
.sm-md-table thead th {
  font-weight: 600;
  background: var(--sm-bg-layer2, var(--dsw-alias-bg-layer-2, rgba(148, 163, 184, 0.1)));
  white-space: nowrap;
}
.sm-md-table tbody tr:last-child td {
  border-bottom: none;
}
.sm-md-link {
  color: var(--sm-accent, var(--dsw-alias-link, #0284c7));
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* --- File Attachment Card & Preview Modal --- */
.sm-file-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
  padding: 9px 11px;
  border-radius: 9px;
  background: var(--sm-bg-layer2);
  border: 1px solid var(--sm-border-l1);
  font-size: 12px;
}
.sm-file-card-info {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  flex: 1 1 180px;
}
.sm-file-icon-box {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--sm-accent) 14%, transparent);
  color: var(--sm-accent);
  flex-shrink: 0;
}
.sm-file-meta {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.sm-file-name {
  font-weight: 600;
  font-size: 12.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sm-file-sub {
  font-size: 11px;
  color: var(--sm-fg-secondary);
}
.sm-file-actions {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}
.sm-preview-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.54);
  backdrop-filter: blur(2px);
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.sm-preview-modal {
  width: min(840px, 94vw);
  max-height: 84vh;
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  border: 1px solid var(--sm-border-l2);
  background: var(--sm-bg-layer1);
  color: var(--sm-fg-primary);
  box-shadow: 0 20px 56px rgba(0, 0, 0, 0.28);
  overflow: hidden;
}
.sm-preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--sm-border-l1);
}
.sm-preview-body {
  flex: 1;
  overflow: auto;
  padding: 16px;
  background: var(--sm-bg-base);
}
.sm-preview-pre {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}
.sm-preview-img {
  max-width: 100%;
  max-height: 66vh;
  border-radius: 8px;
  display: block;
  margin: 0 auto;
}

/* --- Right Room Inspector & Shared Files Drawer --- */
.sm-detail-drawer {
  width: 288px;
  flex-shrink: 0;
  border-left: 1px solid var(--sm-border-l1);
  background: var(--sm-bg-layer1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
@media (max-width: 980px) {
  .sm-detail-drawer {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 50;
    box-shadow: -8px 0 28px rgba(0, 0, 0, 0.16);
  }
}
.sm-drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--sm-border-l1);
  font-size: 13px;
  font-weight: 600;
}
.sm-drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.sm-drawer-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sm-drawer-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--sm-fg-secondary);
}
.sm-topic-jump-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 6px 9px;
  border-radius: 7px;
  border: 1px solid var(--sm-border-l1);
  background: var(--sm-bg-base);
  color: var(--sm-fg-primary);
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}
.sm-topic-jump-btn:hover {
  border-color: var(--sm-accent);
}

/* --- Drag & Drop Overlay --- */
.sm-drop-overlay {
  position: absolute;
  inset: 10px;
  border-radius: 12px;
  border: 2px dashed var(--sm-accent);
  background: color-mix(in srgb, var(--sm-accent) 10%, var(--sm-bg-layer1));
  z-index: 60;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--sm-accent);
  pointer-events: none;
}

/* --- Unified Composer with @ / # / Upload & Reply Bar --- */
.sm-composer-wrap {
  position: relative;
  padding: 10px 18px 14px;
  background: var(--sm-bg-layer1);
  border-top: 1px solid var(--sm-border-l1);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sm-reply-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  border-left: 3px solid var(--sm-accent);
  background: var(--sm-bg-layer2);
  font-size: 11.5px;
  color: var(--sm-fg-secondary);
}
.sm-popover {
  position: absolute;
  left: 18px;
  right: 18px;
  bottom: calc(100% - 4px);
  max-height: 224px;
  overflow-y: auto;
  background: var(--sm-bg-layer1);
  border: 1px solid var(--sm-border-l2);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
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
  color: var(--sm-fg-secondary);
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
  color: var(--sm-fg-primary);
  text-align: left;
}
.sm-popover-item:hover, .sm-popover-item.active {
  background: color-mix(in srgb, var(--sm-accent) 14%, transparent);
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
  background: rgba(14, 165, 233, 0.13);
  color: var(--sm-accent);
  border: 1px solid rgba(14, 165, 233, 0.3);
}
.sm-composer-box {
  display: flex;
  align-items: flex-end;
  gap: 7px;
  padding: 6px 8px;
  border-radius: 10px;
  border: 1px solid var(--sm-border-l2);
  background: var(--sm-bg-input);
  transition: border-color 0.14s ease;
}
.sm-composer-box:focus-within {
  border-color: var(--sm-accent);
}
.sm-composer-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--sm-fg-primary);
  font-size: 13px;
  font-family: inherit;
  line-height: 1.48;
  padding: 4px 6px;
  outline: none;
  resize: none;
  max-height: 140px;
}
.sm-trigger-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--sm-fg-secondary);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.12s ease;
}
.sm-trigger-btn:hover, .sm-trigger-btn.active {
  background: color-mix(in srgb, var(--sm-accent) 14%, transparent);
  color: var(--sm-accent);
  border-color: color-mix(in srgb, var(--sm-accent) 32%, transparent);
}

/* --- Native DSH Main-Chat Tool Call & Incoming Wake Cards --- */
.sm-tool-card {
  border-radius: 9px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(148, 163, 184, 0.26));
  background: var(--dsw-alias-bg-layer-1, rgba(148, 163, 184, 0.05));
  color: var(--dsw-alias-label-primary, #0f172a);
  overflow: hidden;
  font-size: 12.5px;
  margin: 2px 0;
}
.sm-tool-card.running {
  border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary, #0284c7) 42%, transparent);
}
.sm-tool-card.error {
  border-color: rgba(239, 68, 68, 0.36);
}
.sm-tool-head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 11px;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
  font: inherit;
}
.sm-tool-head:hover:not(:disabled) {
  background: var(--dsw-alias-bg-layer-2, rgba(148, 163, 184, 0.1));
}
.sm-tool-head-left {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
  overflow: hidden;
}
.sm-tool-icon {
  display: inline-flex;
  color: var(--dsw-alias-state-business-primary, var(--dsw-alias-link, #0284c7));
  flex-shrink: 0;
}
.sm-tool-title {
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}
.sm-tool-target {
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(139, 92, 246, 0.14);
  color: #8b5cf6;
  white-space: nowrap;
  flex-shrink: 0;
}
.sm-tool-preview {
  color: var(--dsw-alias-label-secondary, #64748b);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sm-tool-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}
.sm-tool-status.running { color: var(--dsw-alias-state-business-primary, #0284c7); }
.sm-tool-status.ok { color: var(--dsw-alias-state-success-primary, #059669); }
.sm-tool-status.error { color: var(--dsw-alias-state-error-primary, #dc2626); }
.sm-tool-body {
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(148, 163, 184, 0.22));
  padding: 10px 12px;
  background: var(--dsw-alias-bg-base, transparent);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sm-tool-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sm-tool-section-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary, #64748b);
}
.sm-tool-files {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}
.sm-tool-roster {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sm-wake-card {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 8px 10px;
  border-radius: 9px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(148, 163, 184, 0.28));
  background: var(--dsw-alias-bg-layer-1, rgba(148, 163, 184, 0.06));
  color: var(--dsw-alias-label-primary, inherit);
}
.sm-wake-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
}
.sm-wake-body {
  font-size: 13px;
}
.sm-wake-raw {
  margin: 0;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--dsw-alias-markdown-code-block, rgba(148, 163, 184, 0.12));
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 260px;
  overflow: auto;
}

/* --- Action variants, badges & confirmations --- */
.sm-btn-sm {
  padding: 3.5px 8.5px;
  font-size: 11.5px;
}
.sm-btn-danger {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.36);
  color: var(--dsw-alias-state-error-primary, #dc2626);
}
.sm-btn.sm-btn-danger:hover:not(:disabled) {
  background: #dc2626;
  border-color: #dc2626;
  color: #ffffff;
}
.sm-badge-ok {
  background: rgba(16, 185, 129, 0.15);
  color: var(--dsw-alias-state-success-primary, #059669);
}
.sm-badge-warn {
  background: rgba(245, 158, 11, 0.16);
  color: #d97706;
}
.sm-badge-err {
  background: rgba(239, 68, 68, 0.13);
  color: var(--dsw-alias-state-error-primary, #dc2626);
}
.sm-confirm-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.28);
  font-size: 12px;
  color: var(--sm-fg-primary);
}
.sm-unpaired-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.32);
  font-size: 12.5px;
  color: var(--sm-fg-primary);
}
.sm-onboarding-card {
  margin: auto;
  width: 100%;
  max-width: 590px;
  padding: 24px 26px;
  border-radius: 14px;
  background: var(--sm-bg-layer1);
  border: 1px solid var(--sm-border-l1);
  box-shadow: 0 8px 30px rgba(15, 23, 42, 0.07);
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.sm-pair-step {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 9px;
  background: var(--sm-bg-layer2);
  border: 1px solid var(--sm-border-l1);
}
.sm-pair-step-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12.5px;
  font-weight: 600;
}
.sm-invite-expiry {
  font-size: 11px;
  font-weight: 500;
  color: var(--sm-fg-secondary);
}

/* --- Settings View: Pairing, Presets & Node Config --- */
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
  color: var(--sm-fg-secondary);
  line-height: 1.48;
}
.sm-card {
  background: var(--sm-bg-layer1);
  border: 1px solid var(--sm-border-l1);
  border-radius: 12px;
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
.sm-template-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 11.5px;
  color: var(--sm-fg-secondary);
}
.sm-template-pill {
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid var(--sm-border-l2);
  background: var(--sm-bg-base);
  color: var(--sm-fg-primary);
  font-size: 11.5px;
  cursor: pointer;
  transition: border-color 0.12s ease, background 0.12s ease;
}
.sm-template-pill:hover {
  border-color: var(--sm-accent);
  background: color-mix(in srgb, var(--sm-accent) 10%, transparent);
}
.sm-invite-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  color: var(--sm-fg-secondary);
}
.sm-invite-code {
  flex: 1;
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  padding: 5px 9px;
  border-radius: 6px;
  background: var(--sm-bg-input);
  border: 1px solid var(--sm-border-l2);
  color: var(--sm-fg-primary);
  outline: none;
  cursor: text;
}
.sm-invite-code:focus {
  border-color: var(--sm-accent);
}
.sm-peer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 13px;
  border-radius: 10px;
  background: var(--sm-bg-layer2);
  border: 1px solid var(--sm-border-l1);
}
.sm-advanced-details {
  font-size: 12px;
  color: var(--sm-fg-secondary);
}
.sm-advanced-details summary {
  cursor: pointer;
  user-select: none;
  font-weight: 500;
}
.sm-advanced-body {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
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
