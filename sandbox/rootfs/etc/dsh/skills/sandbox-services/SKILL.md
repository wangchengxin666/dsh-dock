---
name: sandbox-services
description: Run, supervise, expose, and diagnose long-running development services in this DSH sandbox. Use when a task needs a persistent dev server, a browser-reachable /apps URL, a service that survives DSH or container restarts, or a decision between a DSH plugin and an exposed service.
whenToUse: The user asks to start or daemonize a service, expose a local port, keep a dev server running after logout/restart, publish an app under /apps, or develop a DSH plugin that also owns an HTTP backend.
---

# Sandbox services

This container has one published port (`8080`, Caddy). All browser traffic goes
through Caddy:

```text
http://<host>:8080/          -> 302 /dsh/
http://<host>:8080/dsh/      -> DSH
http://<host>:8080/apps/X/   -> service X (public; auth belongs in X)
```

There is **no systemd**. Never use `systemctl --user` or `loginctl enable-linger`
inside the container; they are host-level concepts and are not available here.

## 1. Decide what the thing is

| Artifact | Exposure |
| --- | --- |
| DSH client/Host plugin | Loads inside DSH; no port, no `sandbox-expose` |
| Service used only by a plugin/agent | Bind `127.0.0.1:<port>`; no expose |
| Service a human opens in a browser | `sandbox-service` + `sandbox-expose`; public, add auth inside the service |
| Static files | Run a small loopback server (or a Caddy file_server snippet), then expose |

A DSH plugin that starts its own HTTP backend follows the service path for that
backend; the plugin itself still rides on `/dsh/`.

## 2. Long-running service with the user supervisord (`sandbox-service`) & Cron (`sandbox-cron`)

For scheduled / periodic jobs that survive container restarts, use `sandbox-cron`:

```bash
sandbox-cron add "0 9 * * * /home/dev/workspace/daily-report.sh >> /home/dev/logs/cron.log 2>&1"
sandbox-cron list
sandbox-cron clear
```

`sandbox-service` writes a program into the user-level supervisord. The
container-level supervisord starts that user instance as `dev`, so services
survive **DSH restarts and container restarts**; configuration and logs live in
the home volume.

```bash
cd ~/workspace/web

# The command runs from the current directory. autostart/autorestart are on.
sandbox-service add web "npm run dev -- --host 127.0.0.1 --port 5173 --base=/apps/web/"

sandbox-service list
sandbox-service status web
sandbox-service logs web
sandbox-service restart web
sandbox-service stop web
sandbox-service remove web
```

Complex shell commands:

```bash
sandbox-service add web "bash -lc 'cd ~/workspace/web && npm run dev -- --host 127.0.0.1 --port 5173'"
```

Paths:

```text
~/.dsh-sandbox/services/conf.d/<name>.conf
~/.dsh-sandbox/services/supervisord.conf
~/logs/<name>.log
~/logs/<name>.err
```

Direct supervisor control:

```bash
supervisorctl -c ~/.dsh-sandbox/services/supervisord.conf status
supervisorctl -c ~/.dsh-sandbox/services/supervisord.conf reread
supervisorctl -c ~/.dsh-sandbox/services/supervisord.conf update
```

Do not edit the **system** supervisor at `/etc/supervisor`; it is root-owned.
Use `sandbox-service` only.

## 3. Expose the loopback port

The service must listen on `127.0.0.1` (recommended) or at least only inside the
container; never try to publish a Docker port.

```bash
sandbox-expose web 5173
# http://<host>:8080/apps/web/
```

The route is **public**. `sandbox-expose` does not add any authentication. If
the service needs auth, implement it inside the service (session cookie,
Bearer token, mTLS, app login). The only OIDC-protected paths are `/dsh/*` and
`/_dsh-token`.

Useful forms:

```bash
sandbox-expose --list
sandbox-expose --remove web
sandbox-expose web 5173 /apps/custom/   # custom prefix
```

`sandbox-expose` writes `~/.dsh-sandbox/caddy/apps.d/web.caddy` and reloads
Caddy. The route persists in the home volume. Do not edit generated snippets by
hand; regenerate them.

Reserved ports (never expose): `2019` (Caddy admin), `3080` (DSH), `3090`
(token helper), `4180` (oauth2-proxy), `8080` (Caddy). `sandbox-expose` rejects
them, and `/p/<port>/` returns 404 for them.

External URLs a service should be written for:

```text
http://<host>:8080/apps/<name>/      # named route, strips the prefix
http://<host>:8080/p/<port>/         # temporary port router (always on)
```

Both are public. A browser reaching them sends normal cookies/headers; there is
no OIDC session on these routes unless the app implements its own auth.

## 4. Authentication and base paths

- Only `/dsh/*` and `/_dsh-token` use OIDC + `DSH_ALLOWED_EMAILS`.
- `/apps/*` and `/p/*` are public; no Caddy auth gate. If the service needs
  auth, implement it inside the service. `sandbox-expose` does not accept an
  auth mode anymore.
- The app must work under `/apps/<name>/`:
  - Vite: `--base=/apps/web/`
  - Next.js: `basePath: '/apps/web'`
  - static/custom: relative links or read `X-Forwarded-Prefix`
- WebSocket is proxied. Keep long-lived streams on the same `/apps/<name>/`
  prefix.
- Keep the service bound to `127.0.0.1`; users reach it only through Caddy.

## 5. DSH plugin development

Install a local plugin bundle into the web profile:

```bash
dsh plugin --profile web add /home/dev/workspace/my-dsh-plugin
```

Then enable it in **Settings -> Plugins** (or the plugin manager). Client
plugins usually reload/HMR. Host plugins may need DSH replaced; do not restart
the whole container casually because that also restarts user services and
terminals. The profile lives in `/home/dev/.dsh`, so it survives container
recreation.

If the plugin needs an HTTP backend only for itself, bind loopback and configure
the plugin with `http://127.0.0.1:<port>`; no expose. If a human needs it, use
`sandbox-service` + `sandbox-expose` as above.

## 6. Verify before reporting success

```bash
sandbox-service status web
curl -fsS http://127.0.0.1:5173/ >/dev/null && echo "loopback OK"
sandbox-expose --list | grep web
```

Then open `http://<host>:8080/apps/web/`. It is public; if it implements its
own auth, the redirect to that auth is expected. The only OIDC login is on
`/dsh/`.

## 7. Troubleshooting

| Symptom | Check |
| --- | --- |
| `sandbox-service` says no such service | `sandbox-service list`; config under `~/.dsh-sandbox/services/conf.d` |
| Service `FATAL` / restart loop | `sandbox-service logs <name>` and `<name>.err` |
| `/apps/x/` 404 | `sandbox-expose --list`; confirm the port and prefix; check Caddy logs |
| `/apps/x/` 403 | The service's own auth rejected it; DSH email does not apply |
| Page loads but assets 404 | App base path is wrong; rebuild with the `/apps/<name>/` base |
| Service dies after container recreation | Config is persistent and autostart should recover it; check `sandbox-service status` and logs |
| Port rejected | It is one of the reserved internal ports |

Never expose the DSH internals, Caddy admin, or oauth2-proxy; never run the
service as root; never use `systemctl`/`linger` inside this container.