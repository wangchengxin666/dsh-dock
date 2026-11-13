#!/usr/bin/env bash
# Root entrypoint: prepare the home volume, render runtime configs, then hand
# the container to supervisord (caddy + oauth2-proxy + dsh).
set -euo pipefail

log() { printf '[entrypoint] %s\n' "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "entrypoint must run as root"

DEV_USER=dev
CADDY_PORT=${CADDY_PORT:-8080}
DSH_PORT=${DSH_PORT:-3080}
SANDBOX_BASE_PATH=${SANDBOX_BASE_PATH:-}
SANDBOX_BASE_PATH=${SANDBOX_BASE_PATH%/}
if [ -n "${SANDBOX_BASE_PATH}" ] && [[ "${SANDBOX_BASE_PATH}" != /* ]]; then
  SANDBOX_BASE_PATH="/${SANDBOX_BASE_PATH}"
fi
if [ -z "${DSH_MOUNT:-}" ] || { [ -n "${SANDBOX_BASE_PATH}" ] && [ "${DSH_MOUNT}" = "/dsh" ]; }; then
  DSH_MOUNT="${SANDBOX_BASE_PATH}/dsh"
fi
DSH_MOUNT=${DSH_MOUNT%/}
APPS_DIR=${APPS_DIR:-/home/dev/.dsh-sandbox/caddy/apps.d}
OAUTH2_PROXY_PORT=${OAUTH2_PROXY_PORT:-4180}
DSH_TOKEN_PORT=${DSH_TOKEN_PORT:-3090}
AUTH_MODE=${AUTH_MODE:-oidc}

# ---------------------------------------------------------------------------
# Public URL
# ---------------------------------------------------------------------------
PUBLIC_URL=${DSH_PUBLIC_URL:-}
if [ -z "${PUBLIC_URL}" ]; then
  PUBLIC_URL="http://localhost:${CADDY_PORT}${DSH_MOUNT}/"
  log "WARN: DSH_PUBLIC_URL is unset; advertising ${PUBLIC_URL}."
  log "WARN: set it to the browser-facing URL (e.g. https://sandbox.example.com/s/alice/dsh/)."
fi
[ "${PUBLIC_URL%/}" = "${PUBLIC_URL}" ] || PUBLIC_URL=${PUBLIC_URL%/}
PUBLIC_URL="${PUBLIC_URL}/"

if [[ ! "${PUBLIC_URL}" =~ ^(https?)://([^/]+)(/.*)$ ]]; then
  die "DSH_PUBLIC_URL must look like https://host[:port][/prefix]/ (got: ${PUBLIC_URL})"
fi
PUBLIC_SCHEME=${BASH_REMATCH[1]}
PUBLIC_HOST=${BASH_REMATCH[2]}
PUBLIC_PATH=${BASH_REMATCH[3]}
if [ "${PUBLIC_PATH}" != "${DSH_MOUNT}/" ]; then
  die "DSH_MOUNT (${DSH_MOUNT}) does not match the path in DSH_PUBLIC_URL (${PUBLIC_PATH}); they must be identical"
fi
PUBLIC_ORIGIN="${PUBLIC_SCHEME}://${PUBLIC_HOST}"
PUBLIC_HOSTNAME=${PUBLIC_HOST%%:*}

DSH_TRUSTED_HOSTS=${DSH_TRUSTED_HOSTS:-${PUBLIC_HOST}}
DSH_PUBLIC_URL=${PUBLIC_URL}
export CADDY_PORT DSH_PORT SANDBOX_BASE_PATH DSH_MOUNT APPS_DIR OAUTH2_PROXY_PORT DSH_TOKEN_PORT AUTH_MODE
export PUBLIC_URL PUBLIC_SCHEME PUBLIC_HOST PUBLIC_HOSTNAME PUBLIC_ORIGIN
export DSH_TRUSTED_HOSTS DSH_PUBLIC_URL

# ---------------------------------------------------------------------------
# Home volume and directories
# ---------------------------------------------------------------------------
install -d -o "${DEV_USER}" -g "${DEV_USER}" -m 0755 /home/dev /home/dev/workspace /home/dev/.dsh
install -d -o "${DEV_USER}" -g "${DEV_USER}" -m 0755 /home/dev/deepseek-harness
install -d -o "${DEV_USER}" -g "${DEV_USER}" -m 0755 /home/dev/.dsh/skills
# Existing volumes may contain root-owned skill dirs from older images.
chown -R "${DEV_USER}:${DEV_USER}" /home/dev/.dsh/skills 2>/dev/null || true
chmod -R a+rX /home/dev/.dsh/skills 2>/dev/null || true
if [ -d /etc/dsh/skills ]; then
  for skill in /etc/dsh/skills/*; do
    [ -e "${skill}" ] || continue
    name=$(basename "${skill}")
    if [ ! -e "/home/dev/.dsh/skills/${name}" ]; then
      runuser -u "${DEV_USER}" -- cp -R "${skill}" "/home/dev/.dsh/skills/${name}"
    fi
  done
fi
install -d -o "${DEV_USER}" -g "${DEV_USER}" -m 0755 /home/dev/logs /home/dev/.npm-global /home/dev/.local/bin
install -d -o "${DEV_USER}" -g "${DEV_USER}" -m 0755 \
  /home/dev/.dsh-sandbox/services /home/dev/.dsh-sandbox/services/conf.d
install -d -o "${DEV_USER}" -g caddy -m 2775 \
  /home/dev/.dsh-sandbox /home/dev/.dsh-sandbox/caddy "${APPS_DIR}"
install -d -o oauth -g oauth -m 0750 /home/dev/.dsh-sandbox/oauth2
install -d -o caddy -g caddy -m 0755 /var/lib/caddy /var/lib/caddy/.config /var/lib/caddy/.local/share
install -d -o oauth -g oauth -m 0755 /var/lib/oauth2-proxy

printf '%s\n' "${SANDBOX_BASE_PATH}" >/home/dev/.dsh-sandbox/base-path.txt
chown "${DEV_USER}:${DEV_USER}" /home/dev/.dsh-sandbox/base-path.txt

# User-level supervisord: long-running dev services under the home volume.
if [ ! -f /home/dev/.dsh-sandbox/services/supervisord.conf ]; then
  cat >/home/dev/.dsh-sandbox/services/supervisord.conf <<'EOF'
[supervisord]
nodaemon=true
logfile=/home/dev/logs/user-supervisord.log
logfile_maxbytes=10MB
logfile_backups=3
loglevel=info
pidfile=/home/dev/.dsh-sandbox/services/supervisord.pid
childlogdir=/home/dev/logs

[unix_http_server]
file=/home/dev/.dsh-sandbox/services/supervisor.sock
chmod=0700

[rpcinterface:supervisor]
supervisor.rpcinterface_factory = supervisor.rpcinterface:make_main_rpcinterface

[supervisorctl]
serverurl=unix:///home/dev/.dsh-sandbox/services/supervisor.sock

[include]
files = /home/dev/.dsh-sandbox/services/conf.d/*.conf
EOF
  chown "${DEV_USER}:${DEV_USER}" /home/dev/.dsh-sandbox/services/supervisord.conf
  chmod 0644 /home/dev/.dsh-sandbox/services/supervisord.conf
fi

install -d -m 0755 /etc/caddy /etc/supervisor/conf.d /var/log/supervisor

# ---------------------------------------------------------------------------
# Refresh the system trust store when custom/enterprise CA certs are provided
# ---------------------------------------------------------------------------
if compgen -G "/etc/dsh/ca/*.crt" >/dev/null 2>&1; then
  for cert in /etc/dsh/ca/*.crt; do
    if grep -q "^-----BEGIN CERTIFICATE-----" "${cert}" 2>/dev/null; then
      cp "${cert}" "/usr/local/share/ca-certificates/$(basename "${cert}")"
    fi
  done
fi
if compgen -G "/usr/local/share/ca-certificates/*.crt" >/dev/null 2>&1; then
  update-ca-certificates >/dev/null 2>&1 || log "WARN: update-ca-certificates failed"
fi

if [ ! -f "${APPS_DIR}/00-empty.caddy" ]; then
  printf '# Drop-in Caddy routes. See sandbox-expose(1).\n' >"${APPS_DIR}/00-empty.caddy"
fi
chown "${DEV_USER}:caddy" "${APPS_DIR}/00-empty.caddy"
chmod 0644 "${APPS_DIR}/00-empty.caddy"

# A bind-mounted empty HOME has no pre-built profile; build it once here.
if [ ! -f /home/dev/.dsh/profiles/web/package.json ]; then
  log "initializing the DSH web profile under /home/dev/.dsh"
  runuser -u "${DEV_USER}" -- env HOME=/home/dev DSH_HOME=/home/dev/.dsh \
    dsh --profile web --help >/dev/null
fi

# ---------------------------------------------------------------------------
# Workspace Template & Initial Git Repository Clone
# ---------------------------------------------------------------------------
SANDBOX_TEMPLATE=${SANDBOX_TEMPLATE:-agent-os}
template_marker="/home/dev/.dsh-sandbox/.template_initialized"
if [ ! -f "${template_marker}" ]; then
  log "initializing workspace template: ${SANDBOX_TEMPLATE}"
  case "${SANDBOX_TEMPLATE}" in
    fullstack-web)
      install -d -o "${DEV_USER}" -g "${DEV_USER}" -m 0755 /home/dev/workspace/web-app
      cat >/home/dev/workspace/web-app/server.js <<'EOF'
const http = require('node:http');
const port = Number(process.env.PORT || 5173);
http.createServer((req, res) => {
  const prefix = req.headers['x-forwarded-prefix'] || '';
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html><body style="font-family:sans-serif;padding:2rem">
    <h1>Fullstack Sandbox App</h1>
    <p>Running inside your persistent Agent OS workspace.</p>
    <p>Mounted prefix: <code>${prefix || '/'}</code> · Request path: <code>${req.url}</code></p>
  </body></html>`);
}).listen(port, '127.0.0.1', () => console.log('listening on 127.0.0.1:' + port));
EOF
      chown "${DEV_USER}:${DEV_USER}" /home/dev/workspace/web-app/server.js
      ;;
    python-data)
      install -d -o "${DEV_USER}" -g "${DEV_USER}" -m 0755 /home/dev/workspace/data-lab
      cat >/home/dev/workspace/data-lab/main.py <<'EOF'
"""Starter Python data & automation script in your persistent Agent OS."""
import platform
import sys

def main() -> None:
    print(f"Python {sys.version} on {platform.platform()}")

if __name__ == "__main__":
    main()
EOF
      chown "${DEV_USER}:${DEV_USER}" /home/dev/workspace/data-lab/main.py
      ;;
    minimal)
      ;;
    *)
      if [ ! -f /home/dev/workspace/README.md ]; then
        cat >/home/dev/workspace/README.md <<EOF
# Agent OS Workspace

Welcome to your persistent remote DeepSeek Harness environment.

- **DSH URL**: \`${PUBLIC_URL}\`
- **Expose a web service**: \`sandbox-service add web "node server.js"\` + \`sandbox-expose web 5173\` -> \`${PUBLIC_ORIGIN}${SANDBOX_BASE_PATH}/apps/web/\`
- **Quick port forward**: \`${PUBLIC_ORIGIN}${SANDBOX_BASE_PATH}/p/<port>/\`
- **Persistent cron**: \`sandbox-cron add "0 9 * * * /home/dev/workspace/task.sh"\`
- **Headless Chromium**: \`/usr/bin/chromium --headless --dump-dom https://example.com\`
EOF
        chown "${DEV_USER}:${DEV_USER}" /home/dev/workspace/README.md
      fi
      ;;
  esac
  printf '%s\n' "${SANDBOX_TEMPLATE}" >"${template_marker}"
  chown "${DEV_USER}:${DEV_USER}" "${template_marker}"
fi

if [ -n "${SANDBOX_INIT_SCRIPT:-}" ]; then
  script_marker="/home/dev/.dsh-sandbox/.init_script_executed"
  if [ ! -f "${script_marker}" ]; then
    log "executing template initialization script"
    printf '%s\n' "${SANDBOX_INIT_SCRIPT}" >/home/dev/.dsh-sandbox/init-template.sh
    chown "${DEV_USER}:${DEV_USER}" /home/dev/.dsh-sandbox/init-template.sh
    chmod 0755 /home/dev/.dsh-sandbox/init-template.sh
    if runuser -u "${DEV_USER}" -- env HOME=/home/dev DSH_HOME=/home/dev/.dsh \
      bash -lc "cd /home/dev/workspace && /home/dev/.dsh-sandbox/init-template.sh"; then
      date -u +"%Y-%m-%dT%H:%M:%SZ" >"${script_marker}"
      chown "${DEV_USER}:${DEV_USER}" "${script_marker}"
    else
      log "WARN: template initialization script exited non-zero; continuing startup"
    fi
  fi
fi

if [ -n "${SANDBOX_INIT_REPO_URL:-}" ]; then
  repo_marker="/home/dev/.dsh-sandbox/.init_repo_cloned"
  if [ ! -f "${repo_marker}" ]; then
    log "cloning initial repository: ${SANDBOX_INIT_REPO_URL}"
    repo_name=$(basename "${SANDBOX_INIT_REPO_URL}" .git)
    target_dir="/home/dev/workspace/${repo_name}"
    if [ ! -e "${target_dir}" ]; then
      if runuser -u "${DEV_USER}" -- git clone "${SANDBOX_INIT_REPO_URL}" "${target_dir}"; then
        printf '%s\n' "${SANDBOX_INIT_REPO_URL}" >"${repo_marker}"
        chown "${DEV_USER}:${DEV_USER}" "${repo_marker}"
      else
        log "WARN: git clone ${SANDBOX_INIT_REPO_URL} failed; continuing startup"
      fi
    fi
  fi
fi

# Record self-hosted plugin index URL and auto-install configured plugins
if [ -n "${DSH_PLUGIN_INDEX_URL:-}" ]; then
  printf '%s\n' "${DSH_PLUGIN_INDEX_URL}" >/home/dev/.dsh-sandbox/plugin-index-url.txt
  chown "${DEV_USER}:${DEV_USER}" /home/dev/.dsh-sandbox/plugin-index-url.txt
  log "plugin index URL configured: ${DSH_PLUGIN_INDEX_URL}"
fi

if [ -n "${DSH_AUTO_INSTALL_PLUGINS:-}" ] && [ "${SANDBOX_TEMPLATE}" != "minimal" ]; then
  marker_file="/home/dev/.dsh/.auto_installed_plugins"
  touch "${marker_file}"
  chown "${DEV_USER}:${DEV_USER}" "${marker_file}"
  IFS=',' read -r -a plugin_specs <<<"${DSH_AUTO_INSTALL_PLUGINS}"
  for spec in "${plugin_specs[@]}"; do
    spec=$(printf '%s' "${spec}" | awk '{gsub(/^[ \t]+|[ \t]+$/, ""); print}')
    [ -n "${spec}" ] || continue
    if ! grep -Fxq "${spec}" "${marker_file}" 2>/dev/null; then
      log "auto-installing DSH plugin into web profile: ${spec}"
      if runuser -u "${DEV_USER}" -- env HOME=/home/dev DSH_HOME=/home/dev/.dsh \
        dsh plugin --profile web add "${spec}"; then
        printf '%s\n' "${spec}" >>"${marker_file}"
      else
        log "WARN: failed to auto-install plugin ${spec}; skipping"
      fi
    fi
  done
fi

# ---------------------------------------------------------------------------
# One oauth2-proxy instance
# ---------------------------------------------------------------------------
rm -f /etc/supervisor/conf.d/10-oauth2-proxy.conf /etc/supervisor/conf.d/11-oauth2-apps.conf

case "${AUTH_MODE}" in
  none|oidc) ;;
  *) die "AUTH_MODE must be 'oidc' or 'none' (got: ${AUTH_MODE})" ;;
esac

if [ "${AUTH_MODE}" = "oidc" ]; then
  : "${OAUTH2_PROXY_OIDC_ISSUER_URL:?OAUTH2_PROXY_OIDC_ISSUER_URL is required when AUTH_MODE=oidc}"
  : "${OAUTH2_PROXY_CLIENT_ID:?OAUTH2_PROXY_CLIENT_ID is required when AUTH_MODE=oidc}"
  : "${OAUTH2_PROXY_CLIENT_SECRET:?OAUTH2_PROXY_CLIENT_SECRET is required when AUTH_MODE=oidc}"
  : "${OAUTH2_PROXY_REDIRECT_URL:?OAUTH2_PROXY_REDIRECT_URL is required when AUTH_MODE=oidc}"
  : "${OAUTH2_PROXY_COOKIE_SECRET:?OAUTH2_PROXY_COOKIE_SECRET is required when AUTH_MODE=oidc}"
  case "${#OAUTH2_PROXY_COOKIE_SECRET}" in
    16|24|32) ;;
    *) die "OAUTH2_PROXY_COOKIE_SECRET must be 16, 24, or 32 bytes (got ${#OAUTH2_PROXY_COOKIE_SECRET})" ;;
  esac

  DSH_ALLOWED_EMAILS=${DSH_ALLOWED_EMAILS:-}
  [ -n "${DSH_ALLOWED_EMAILS}" ] || die "DSH_ALLOWED_EMAILS is required when AUTH_MODE=oidc"
  DSH_ALLOWED_EMAILS=$(printf '%s' "${DSH_ALLOWED_EMAILS}" | tr ',' '\n' \
    | awk 'NF {gsub(/^[ \t]+|[ \t]+$/, ""); print}' | paste -sd, -)
  [ -n "${DSH_ALLOWED_EMAILS}" ] || die "DSH_ALLOWED_EMAILS contains no addresses"
  export DSH_ALLOWED_EMAILS

  export OAUTH2_PROXY_PROVIDER="${OAUTH2_PROXY_PROVIDER:-oidc}"
  export OAUTH2_PROXY_PORT="${OAUTH2_PROXY_PORT:-4180}"
  export OAUTH2_PROXY_HTTP_ADDRESS="${OAUTH2_PROXY_HTTP_ADDRESS:-127.0.0.1:${OAUTH2_PROXY_PORT}}"
  export OAUTH2_PROXY_UPSTREAMS="${OAUTH2_PROXY_UPSTREAMS:-static://202}"
  export OAUTH2_PROXY_PROXY_PREFIX="${OAUTH2_PROXY_PROXY_PREFIX:-${SANDBOX_BASE_PATH}/oauth2}"

  cat >/etc/supervisor/conf.d/10-oauth2-proxy.conf <<'EOF'
[program:oauth2-proxy]
command=/usr/local/bin/oauth2-proxy
user=oauth
directory=/var/lib/oauth2-proxy
environment=HOME="/var/lib/oauth2-proxy"
priority=15
autostart=true
autorestart=true
startsecs=2
stopasgroup=true
killasgroup=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
redirect_stderr=true
EOF
  log "DSH gate: oauth2-proxy OIDC (${OAUTH2_PROXY_PROVIDER}); email checked inside the container for [${DSH_ALLOWED_EMAILS}]"
else
  log "WARN: AUTH_MODE=none - /dsh relies on the DSH token/cookie; all routes are public."
fi

# ---------------------------------------------------------------------------
# Runtime configuration
# ---------------------------------------------------------------------------
/usr/local/bin/render-caddyfile.sh /etc/caddy/Caddyfile
/usr/local/bin/caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
chmod 0644 /etc/caddy/Caddyfile

# Restore persistent user crontab if present
if [ -s /home/dev/.dsh-sandbox/crontab ]; then
  runuser -u "${DEV_USER}" -- /usr/local/bin/sandbox-cron sync || log "WARN: failed to restore user crontab"
fi

cat >/etc/supervisor/conf.d/00-runtime.conf <<'EOF'
[program:cron]
command=/usr/sbin/cron -f
user=root
priority=12
autostart=true
autorestart=true
startsecs=1
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
redirect_stderr=true

[program:user-services]
command=/usr/local/bin/user-services
user=dev
directory=/home/dev
environment=HOME="/home/dev",PATH="/home/dev/.npm-global/bin:/home/dev/.local/bin:/usr/local/dotnet:/home/dev/.dotnet/tools:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
priority=22
autostart=true
autorestart=true
startsecs=2
stopasgroup=true
killasgroup=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
redirect_stderr=true

[program:caddy]
command=/usr/local/bin/caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
user=caddy
environment=HOME="/var/lib/caddy",XDG_CONFIG_HOME="/var/lib/caddy/.config",XDG_DATA_HOME="/var/lib/caddy/.local/share"
priority=10
autostart=true
autorestart=true
startsecs=2
stopasgroup=true
killasgroup=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
redirect_stderr=true

[program:dsh-token]
command=/usr/local/bin/dsh-token
user=dev
directory=/home/dev
environment=HOME="/home/dev",DSH_HOME="/home/dev/.dsh"
priority=18
autostart=true
autorestart=true
startsecs=1
stopasgroup=true
killasgroup=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
redirect_stderr=true

[program:dsh]
command=/usr/local/bin/dsh-web
user=dev
directory=/home/dev/workspace
environment=HOME="/home/dev",DSH_HOME="/home/dev/.dsh",DOTNET_CLI_HOME="/home/dev",PATH="/home/dev/.npm-global/bin:/home/dev/.local/bin:/usr/local/dotnet:/home/dev/.dotnet/tools:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
priority=20
autostart=true
autorestart=true
startsecs=3
stopasgroup=true
killasgroup=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
redirect_stderr=true
EOF

log "public URL: ${PUBLIC_URL}"
log "DSH listener: 127.0.0.1:${DSH_PORT} (mount ${DSH_MOUNT}, base ${SANDBOX_BASE_PATH:-/}); Caddy: :${CADDY_PORT}"
log "open ${PUBLIC_URL} with the ?token=... suffix printed by the dsh program below"

exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf -n
