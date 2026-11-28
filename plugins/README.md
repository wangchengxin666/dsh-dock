# DSH Dock Plugins

First-party plugins for the single-container DeepSeek Harness workbench and the GitHub-backed Plugin Market index ([index.json](index.json)):

```text
git+https://github.com/wangchengxin666/dsh-dock.git?path=plugins/index.json
```

| Package | Role | Key Capabilities |
| --- | --- | --- |
| `@dsh-dock/custom-theme` | Theme Studio | CSS token editor, light/dark presets, brand styling |
| `@dsh-dock/file-manager` | File Explorer | Browse, preview, edit, chmod, zip, upload/download files |
| `@dsh-dock/sandbox-memory` | Long-Term Memory | BM25 search, auto-redacted persistent memory, env scanner |
| `@dsh-dock/app-gateway` | Apps & Services | Publish `/apps/*` (`public` / `caddy` toggle) + `supervisor` restart & live logs |
| `@dsh-dock/webhook-triggers` | Webhook Triggers | `/hooks/<slug>` HTTP ingress, HMAC/Bearer auth, payload archival, async DSH wakeup, replay |
| `@dsh-dock/self-evolve` | Safe Self-Evolution | `~/.dsh/skills/` editor, pre-change backup snapshots, verify-gate & 1-click rollback |
