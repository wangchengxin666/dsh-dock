---
name: sandbox-services
description: Run, supervise, expose, and diagnose long-running web apps and services inside the container.
whenToUse: The user asks to daemonize a service, expose an app under /apps/<name>/, toggle public vs Caddy auth protection, inspect exposed URLs, or check supervisor logs.
---

# Sandbox Services & App Exposure

Inspect the container's live public origin first via `sandbox-expose --info` or `~/.dsh-sandbox/info.json`.

URL layout:
```text
${SANDBOX_PUBLIC_ORIGIN}/               -> 302 /dsh/
${SANDBOX_PUBLIC_ORIGIN}/dsh/           -> DSH Web UI (protected when CADDY_AUTH_MODE != none)
${SANDBOX_PUBLIC_ORIGIN}/hooks/<slug>   -> Inbound Webhooks (HMAC / Bearer authenticated)
${SANDBOX_PUBLIC_ORIGIN}/apps/<name>/   -> Exposed web app (`--auth public` or `--auth caddy`)
${SANDBOX_PUBLIC_ORIGIN}/p/<port>/      -> Direct port forwarder (protected when CADDY_AUTH_MODE != none)
```

## Run Persistent Services (`sandbox-service`)

There is no `systemd`. Use `sandbox-service` (user-level `supervisord`):

```bash
sandbox-service add web "bash -lc 'cd ~/web && npm run dev -- --host 127.0.0.1 --port 5173 --base=/apps/web/'"
sandbox-service list
sandbox-service restart web
sandbox-service logs web
sandbox-service remove web
```

## Publish & Protect Routes (`sandbox-expose`)

```bash
sandbox-expose web 5173 --auth public
sandbox-expose admin 9001 --auth caddy
sandbox-expose --set-auth web caddy
sandbox-expose --list
sandbox-expose --remove web
```

Always report `${SANDBOX_PUBLIC_ORIGIN}/apps/<name>/` and configure relative links or `/apps/<name>/` as the app base path.
