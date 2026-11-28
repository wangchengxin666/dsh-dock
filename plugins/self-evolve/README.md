# `@dsh-dock/self-evolve`

Safe Self-Evolution Manager for a Single-Container DeepSeek Harness Workbench.

- **Workspace Skills Lifecycle**: Creates and updates `~/.dsh/skills/<slug>/SKILL.md` and executable helper scripts cleanly.
- **Snapshot-Before-Edit + Verification Gates**: Automatically snapshots the previous state under `~/.dsh-sandbox/evolve-backups/<id>/`, runs optional `verifyCommand`, and automatically rolls back if verification fails.
- **1-Click Rollback & Evolution Journal**: Tracks milestones and lessons under `~/.dsh-sandbox/evolution-log.json` with instant rollback in UI or via `evolve_rollback`.
