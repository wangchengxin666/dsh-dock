# DSH Dock — Self-Evolving Single-Container AI Workbench

[中文文档](README.zh-CN.md)

A clean, zero-baggage **single-container AI workbench** powered by **Caddy + Supervisor + DeepSeek Harness (`dsh web`) + Native Plugins**, persisted on a single `/home/workspace` volume.

```text
Internet / Localhost (:8080 or https://<SITE_ADDRESS>)
  └─ Caddy 2.11 (built-in gateway + auto HTTPS when domain is configured)
       ├─ /hooks/<slug>    ──▶ Webhook Triggers (:4095) · HMAC-SHA256 / Bearer auth · async session wakeup
       ├─ /dsh/*           ──▶ auth_guard (none | basic | forward_auth) + DSH Web (:3080, zero double login)
       ├─ /apps/<name>/*   ──▶ Dynamic per-app routes (`--auth public` or `--auth caddy`)
       └─ /p/<port>/*      ──▶ auth_guard + loopback port forwarder
```

All core capabilities (port forwarder, inbound webhooks, `supervisor`, `cron`, and all 6 built-in plugins) are **enabled by default**. Configure only your public address (`SITE_ADDRESS` / `DSH_PUBLIC_URL`) and auth mode (`CADDY_AUTH_MODE`), and set your LLM models directly inside DSH Web Settings.

## Quick Start

```bash
cp .env.example .env
# Edit CADDY_AUTH_PASSWORD in .env (or set SITE_ADDRESS / CADDY_AUTH_MODE)
docker compose up -d --build
```

Open `http://localhost:8080/dsh/`.
