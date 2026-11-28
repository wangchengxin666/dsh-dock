#!/usr/bin/env bash
# Render the container Caddyfile cleanly for a single-workbench container.
# Routes:
#   /healthz         -> 200 ok
#   /                -> 302 /dsh/
#   /hooks/*         -> Webhook Triggers (127.0.0.1:4095, HMAC/Bearer auth)
#   /oauth2/*        -> OAuth2 proxy upstream (when CADDY_AUTH_MODE=forward_auth)
#   /dsh/*           -> auth_guard + DSH Web (127.0.0.1:3080)
#   /p/<port>/*      -> auth_guard + loopback port forwarder
#   /apps/<name>/*   -> imported from ${APPS_DIR}/*.caddy (per-app public|caddy auth)
set -euo pipefail

out=${1:-/etc/caddy/Caddyfile}
port=${CADDY_PORT:-8080}
admin_port=${CADDY_ADMIN_PORT:-2019}
site_address=${SITE_ADDRESS:-}
dsh_port=${DSH_PORT:-3080}
webhook_port=${WEBHOOK_PORT:-4095}
apps_dir=${APPS_DIR:-/home/workspace/.dsh-sandbox/caddy/apps.d}
scheme=${PUBLIC_SCHEME:-http}

auth_mode=${CADDY_AUTH_MODE:-none}
auth_user=${CADDY_AUTH_USER:-admin}
auth_hash=${CADDY_AUTH_PASSWORD_HASH:-}
fwd_url=${CADDY_FORWARD_AUTH_URL:-http://oauth2-proxy:4180}
fwd_url=${fwd_url%/}

if [ -z "${site_address}" ]; then
  site_header=":${port}"
  auto_https_line="	auto_https off"
elif [[ "${site_address}" == :* || "${site_address}" == http://* ]]; then
  site_header="${site_address}"
  auto_https_line="	auto_https off"
else
  site_header="${site_address}"
  auto_https_line=""
  scheme="https"
fi

case "${auth_mode}" in
  none)
    read -r -d '' auth_guard_block <<'EOF' || true
(auth_guard) {
}
EOF
    dsh_header_block="			header_up -X-DSH-Gateway-Auth
			header_up -X-Forwarded-User
			header_up -X-Auth-Request-User
			header_up -X-Auth-Request-Email"
    ;;
  basic)
    if [ -z "${auth_hash}" ]; then
      echo "render-caddyfile.sh: CADDY_AUTH_PASSWORD_HASH is required when CADDY_AUTH_MODE=basic" >&2
      exit 1
    fi
    read -r -d '' auth_guard_block <<EOF || true
(auth_guard) {
	basic_auth {
		${auth_user} ${auth_hash}
	}
}
EOF
    dsh_header_block='			header_up X-DSH-Gateway-Auth "{$DSH_GATEWAY_AUTH_SECRET}"
			header_up X-Forwarded-User "{http.auth.user.id}"
			header_up -X-Auth-Request-User
			header_up -X-Auth-Request-Email'
    ;;
  forward_auth)
    read -r -d '' auth_guard_block <<EOF || true
(auth_guard) {
	forward_auth ${fwd_url} {
		uri /oauth2/auth
		copy_headers X-Forwarded-User X-Auth-Request-User X-Auth-Request-Email
		@unauth status 401
		handle_response @unauth {
			redir * /oauth2/start?rd={http.request.uri} 302
		}
	}
}
EOF
    dsh_header_block='			header_up X-DSH-Gateway-Auth "{$DSH_GATEWAY_AUTH_SECRET}"'
    ;;
  *)
    echo "render-caddyfile.sh: unsupported CADDY_AUTH_MODE=${auth_mode} (expected none, basic, or forward_auth)" >&2
    exit 1
    ;;
esac

if [ "${scheme}" = "https" ]; then
  cookie_replacement="Path=/dsh/; Secure"
else
  cookie_replacement="Path=/dsh/"
fi

oauth_block=""
if [ "${auth_mode}" = "forward_auth" ]; then
  oauth_block="
	handle /oauth2/* {
		reverse_proxy ${fwd_url}
	}"
fi

tmp=$(mktemp "$(dirname "${out}")/.Caddyfile.XXXXXX")
trap 'rm -f "${tmp}"' EXIT

cat >"${tmp}" <<EOF
# Managed by render-caddyfile.sh; do not edit by hand.
# CADDY_AUTH_MODE=${auth_mode}

{
	admin localhost:${admin_port}
${auto_https_line}
}

${auth_guard_block}

${site_header} {
	handle /healthz {
		respond "ok\n" 200
	}

	@root path /
	redir @root /dsh/ 302
${oauth_block}

	handle /hooks/* {
		reverse_proxy 127.0.0.1:${webhook_port}
	}

	@dshBare path /dsh
	redir @dshBare /dsh/ 308

	handle_path /dsh/* {
		import auth_guard
		header >Set-Cookie "Path=/;" "${cookie_replacement}"
		header >Set-Cookie "SameSite=Strict" "SameSite=Lax"
		reverse_proxy 127.0.0.1:${dsh_port} {
${dsh_header_block}
			flush_interval -1
			stream_close_delay 5m
		}
	}

	@portBare path_regexp portbare ^/p/([0-9]+)$
	redir @portBare /p/{re.portbare.1}/ 308

	@portProxy path_regexp port ^/p/([0-9]+)(/.*)?$
	handle @portProxy {
		import auth_guard
		uri strip_prefix /p/{re.port.1}
		reverse_proxy 127.0.0.1:{re.port.1}
	}

	import ${apps_dir}/*.caddy

	handle {
		import auth_guard
		respond "Not Found" 404
	}
}
EOF

mv "${tmp}" "${out}"
chmod 0644 "${out}"
