#!/usr/bin/env bash
# Root entrypoint: prepare /home/workspace, configure Caddy auth, install all
# built-in plugins, render Caddyfile, and launch supervisord.
set -euo pipefail

log() { printf '[entrypoint] %s\n' "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "entrypoint must run as root"

WORKSPACE_USER=workspace
APPS_DIR=/home/workspace/.dsh-sandbox/caddy/apps.d
export DSH_PLUGIN_INDEX_URL=${DSH_PLUGIN_INDEX_URL:-git+https://github.com/wangchengxin666/dsh-dock.git?path=plugins/index.json}

# ---------------------------------------------------------------------------
# Public URL & Trusted Hosts
# ---------------------------------------------------------------------------
PUBLIC_URL=${DSH_PUBLIC_URL:-}
if [ -z "${PUBLIC_URL}" ]; then
  if [ -n "${SITE_ADDRESS:-}" ] && [[ "${SITE_ADDRESS}" != :* && "${SITE_ADDRESS}" != http://* ]]; then
    PUBLIC_URL="https://${SITE_ADDRESS}/dsh/"
  elif [ -n "${SITE_ADDRESS:-}" ] && [[ "${SITE_ADDRESS}" == http://* ]]; then
    PUBLIC_URL="${SITE_ADDRESS%/}/dsh/"
  else
    PUBLIC_URL="http://localhost:8080/dsh/"
  fi
fi
[ "${PUBLIC_URL%/}" = "${PUBLIC_URL}" ] || PUBLIC_URL=${PUBLIC_URL%/}
PUBLIC_URL="${PUBLIC_URL}/"

if [[ ! "${PUBLIC_URL}" =~ ^(https?)://([^/]+)(/.*)$ ]]; then
  die "DSH_PUBLIC_URL must look like https://host[:port]/dsh/ (got: ${PUBLIC_URL})"
fi
PUBLIC_SCHEME=${PUBLIC_SCHEME:-${BASH_REMATCH[1]}}
PUBLIC_HOST=${BASH_REMATCH[2]}
PUBLIC_ORIGIN="${BASH_REMATCH[1]}://${PUBLIC_HOST}"

DSH_TRUSTED_HOSTS=${DSH_TRUSTED_HOSTS:-${PUBLIC_HOST}}
DSH_PUBLIC_URL=${PUBLIC_URL}
SANDBOX_PUBLIC_ORIGIN=${PUBLIC_ORIGIN}
SANDBOX_PUBLIC_URL="${PUBLIC_ORIGIN}/"
export APPS_DIR PUBLIC_URL PUBLIC_SCHEME PUBLIC_HOST PUBLIC_ORIGIN
export SANDBOX_PUBLIC_ORIGIN SANDBOX_PUBLIC_URL DSH_TRUSTED_HOSTS DSH_PUBLIC_URL

# ---------------------------------------------------------------------------
# Caddy Auth & Zero-Double-Login Gateway Secret
# ---------------------------------------------------------------------------
CADDY_AUTH_MODE=${CADDY_AUTH_MODE:-none}
CADDY_AUTH_USER=${CADDY_AUTH_USER:-admin}
export CADDY_AUTH_MODE CADDY_AUTH_USER

case "${CADDY_AUTH_MODE}" in
  none)
    DSH_GATEWAY_AUTH_ACTIVE=false
    ;;
  basic)
    if [ -z "${CADDY_AUTH_PASSWORD_HASH:-}" ]; then
      if [ -z "${CADDY_AUTH_PASSWORD:-}" ]; then
        die "CADDY_AUTH_MODE=basic requires CADDY_AUTH_PASSWORD or CADDY_AUTH_PASSWORD_HASH"
      fi
      CADDY_AUTH_PASSWORD_HASH=$(/usr/local/bin/caddy hash-password --plaintext "${CADDY_AUTH_PASSWORD}")
      export CADDY_AUTH_PASSWORD_HASH
    fi
    DSH_GATEWAY_AUTH_SECRET=${DSH_GATEWAY_AUTH_SECRET:-$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')}
    export DSH_GATEWAY_AUTH_SECRET
    DSH_GATEWAY_AUTH_ACTIVE=true
    ;;
  forward_auth)
    DSH_GATEWAY_AUTH_SECRET=${DSH_GATEWAY_AUTH_SECRET:-$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')}
    export DSH_GATEWAY_AUTH_SECRET
    DSH_GATEWAY_AUTH_ACTIVE=true
    ;;
  *)
    die "unsupported CADDY_AUTH_MODE=${CADDY_AUTH_MODE} (expected none, basic, or forward_auth)"
    ;;
esac
export DSH_GATEWAY_AUTH_ACTIVE

# ---------------------------------------------------------------------------
# Home volume and persistent directories
# ---------------------------------------------------------------------------
install -d -o "${WORKSPACE_USER}" -g "${WORKSPACE_USER}" -m 0755 /home/workspace /home/workspace/.dsh
install -d -o "${WORKSPACE_USER}" -g "${WORKSPACE_USER}" -m 0755 /home/workspace/default-workspace
install -d -o "${WORKSPACE_USER}" -g "${WORKSPACE_USER}" -m 0755 /home/workspace/.dsh/skills
chown -R "${WORKSPACE_USER}:${WORKSPACE_USER}" /home/workspace/.dsh/skills 2>/dev/null || true
chmod -R a+rX /home/workspace/.dsh/skills 2>/dev/null || true
if [ -d /etc/dsh/skills ]; then
  for skill in /etc/dsh/skills/*; do
    [ -e "${skill}" ] || continue
    name=$(basename "${skill}")
    install -d -o "${WORKSPACE_USER}" -g "${WORKSPACE_USER}" -m 0755 "/home/workspace/.dsh/skills/${name}"
    runuser -u "${WORKSPACE_USER}" -- cp -R "${skill}/." "/home/workspace/.dsh/skills/${name}/"
  done
fi

install -d -o "${WORKSPACE_USER}" -g "${WORKSPACE_USER}" -m 0755 \
  /home/workspace/logs /home/workspace/.npm-global /home/workspace/.local /home/workspace/.local/bin
install -d -o "${WORKSPACE_USER}" -g "${WORKSPACE_USER}" -m 0755 \
  /home/workspace/.dsh-sandbox/services /home/workspace/.dsh-sandbox/services/conf.d \
  /home/workspace/.dsh-sandbox/webhooks /home/workspace/.dsh-sandbox/evolve-backups
install -d -o "${WORKSPACE_USER}" -g caddy -m 2775 \
  /home/workspace/.dsh-sandbox /home/workspace/.dsh-sandbox/caddy "${APPS_DIR}"
install -d -o caddy -g caddy -m 0755 /var/lib/caddy /var/lib/caddy/.config /var/lib/caddy/.local/share

printf '%s\n' "${PUBLIC_ORIGIN}" >/home/workspace/.dsh-sandbox/public-origin.txt
printf '%s\n' "${SANDBOX_PUBLIC_URL}" >/home/workspace/.dsh-sandbox/public-url.txt
jq -n \
  --arg public_origin "${PUBLIC_ORIGIN}" \
  --arg public_url "${SANDBOX_PUBLIC_URL}" \
  --arg dsh_public_url "${PUBLIC_URL}" \
  --arg apps_base_url "${PUBLIC_ORIGIN}/apps/" \
  --arg port_proxy_base_url "${PUBLIC_ORIGIN}/p/" \
  --arg hooks_base_url "${PUBLIC_ORIGIN}/hooks/" \
  --arg auth_mode "${CADDY_AUTH_MODE}" \
  '{
    public_origin: $public_origin,
    public_url: $public_url,
    dsh_public_url: $dsh_public_url,
    apps_base_url: $apps_base_url,
    port_proxy_base_url: $port_proxy_base_url,
    hooks_base_url: $hooks_base_url,
    auth_mode: $auth_mode
  }' >/home/workspace/.dsh-sandbox/info.json
chown "${WORKSPACE_USER}:${WORKSPACE_USER}" \
  /home/workspace/.dsh-sandbox/public-origin.txt \
  /home/workspace/.dsh-sandbox/public-url.txt \
  /home/workspace/.dsh-sandbox/info.json

if [ ! -f /home/workspace/.dsh-sandbox/services/supervisord.conf ]; then
  cat >/home/workspace/.dsh-sandbox/services/supervisord.conf <<'EOF'
[supervisord]
nodaemon=true
logfile=/home/workspace/logs/user-supervisord.log
logfile_maxbytes=10MB
logfile_backups=3
loglevel=info
pidfile=/home/workspace/.dsh-sandbox/services/supervisord.pid
childlogdir=/home/workspace/logs

[unix_http_server]
file=/home/workspace/.dsh-sandbox/services/supervisor.sock
chmod=0700

[rpcinterface:supervisor]
supervisor.rpcinterface_factory = supervisor.rpcinterface:make_main_rpcinterface

[supervisorctl]
serverurl=unix:///home/workspace/.dsh-sandbox/services/supervisor.sock

[include]
files = /home/workspace/.dsh-sandbox/services/conf.d/*.conf
EOF
  chown "${WORKSPACE_USER}:${WORKSPACE_USER}" /home/workspace/.dsh-sandbox/services/supervisord.conf
  chmod 0644 /home/workspace/.dsh-sandbox/services/supervisord.conf
fi

install -d -m 0755 /etc/caddy /etc/supervisor/conf.d /var/log/supervisor

# Custom CA certificates if mounted
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
chown "${WORKSPACE_USER}:caddy" "${APPS_DIR}/00-empty.caddy"
chmod 0644 "${APPS_DIR}/00-empty.caddy"

# Initialize web profile on fresh volumes
if [ ! -f /home/workspace/.dsh/profiles/web/package.json ]; then
  log "initializing DSH web profile under /home/workspace/.dsh"
  runuser -u "${WORKSPACE_USER}" -- env HOME=/home/workspace DSH_HOME=/home/workspace/.dsh \
    dsh --profile web --help >/dev/null
fi

# Always ensure the 6 built-in workbench plugins are installed
marker_file="/home/workspace/.dsh/.auto_installed_plugins"
touch "${marker_file}"
chown "${WORKSPACE_USER}:${WORKSPACE_USER}" "${marker_file}"

for plugin_dir in custom-theme file-manager sandbox-memory app-gateway webhook-triggers self-evolve; do
  spec="@dsh-dock/${plugin_dir}"
  if ! grep -Fxq "${spec}" "${marker_file}" 2>/dev/null && [ -f "/opt/dsh-plugins/${plugin_dir}/package.json" ]; then
    log "installing built-in plugin: ${spec}"
    if runuser -u "${WORKSPACE_USER}" -- env HOME=/home/workspace DSH_HOME=/home/workspace/.dsh \
      dsh plugin --profile web add "file:/opt/dsh-plugins/${plugin_dir}"; then
      printf '%s\n' "${spec}" >>"${marker_file}"
    else
      log "WARN: failed to install built-in plugin ${spec}; continuing"
    fi
  fi
done

/usr/local/bin/render-caddyfile.sh /etc/caddy/Caddyfile
/usr/local/bin/caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
chmod 0644 /etc/caddy/Caddyfile

if [ -s /home/workspace/.dsh-sandbox/crontab ]; then
  runuser -u "${WORKSPACE_USER}" -- /usr/local/bin/sandbox-cron sync || log "WARN: failed to restore user crontab"
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
user=workspace
directory=/home/workspace
environment=HOME="/home/workspace",PATH="/home/workspace/.npm-global/bin:/home/workspace/.local/bin:/opt/toolchain/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
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

[program:dsh]
command=/usr/local/bin/dsh-web
user=workspace
directory=/home/workspace
environment=HOME="/home/workspace",DSH_HOME="/home/workspace/.dsh",PATH="/home/workspace/.npm-global/bin:/home/workspace/.local/bin:/opt/toolchain/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
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

log "DSH URL: ${PUBLIC_URL} | Caddy: ${SITE_ADDRESS:-:8080} (auth=${CADDY_AUTH_MODE})"
exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf -n
