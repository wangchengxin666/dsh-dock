#!/usr/bin/env bash
# Regression tests for sandbox shell utilities:
#   - render-caddyfile.sh (none, basic, forward_auth, SITE_ADDRESS, /hooks/*, /p/*)
#   - sandbox-expose (--auth public|caddy, --set-auth, --list --json, rollback)
#   - sandbox-cron
#   - sandbox-service
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/../.." && pwd)
TMP_WORK=$(mktemp -d)
trap 'rm -rf "${TMP_WORK}"' EXIT

STUB_BIN="${TMP_WORK}/bin"
mkdir -p "${STUB_BIN}"

cat >"${STUB_BIN}/caddy" <<'EOF'
#!/usr/bin/env bash
case "${1:-}" in
  validate)
    if [ "${MOCK_CADDY_FAIL:-0}" = "1" ]; then
      echo "mock caddy validation error" >&2
      exit 1
    fi
    exit 0
    ;;
  reload)
    echo "reload $*" >>"${CADDY_LOG:-/dev/null}"
    exit 0
    ;;
  hash-password)
    printf '$2a$14$mockhashedpasswordfortests000000000000000000000000\n'
    exit 0
    ;;
esac
EOF
chmod +x "${STUB_BIN}/caddy"

RENDER="${REPO_ROOT}/sandbox/rootfs/usr/local/bin/render-caddyfile.sh"
APPS_DIR="${TMP_WORK}/apps.d"
mkdir -p "${APPS_DIR}"

echo "==> 1. Testing render-caddyfile.sh (none + hooks + port proxy)"
CADDY_AUTH_MODE=none APPS_DIR="${APPS_DIR}" "${RENDER}" "${TMP_WORK}/Caddyfile.none"

grep -q 'auto_https off' "${TMP_WORK}/Caddyfile.none"
grep -q 'handle /hooks/\*' "${TMP_WORK}/Caddyfile.none"
grep -q 'reverse_proxy 127.0.0.1:4095' "${TMP_WORK}/Caddyfile.none"
grep -q 'handle @portProxy' "${TMP_WORK}/Caddyfile.none"
grep -q 'handle_path /dsh/\*' "${TMP_WORK}/Caddyfile.none"
grep -q 'header_up -X-DSH-Gateway-Auth' "${TMP_WORK}/Caddyfile.none"
echo "    PASS none mode"

echo "==> 2. Testing render-caddyfile.sh (basic + custom domain HTTPS)"
SITE_ADDRESS=ai.example.com CADDY_AUTH_MODE=basic CADDY_AUTH_USER=alice \
  CADDY_AUTH_PASSWORD_HASH='$2a$14$test' APPS_DIR="${APPS_DIR}" \
  "${RENDER}" "${TMP_WORK}/Caddyfile.basic"

grep -q '^ai\.example\.com {' "${TMP_WORK}/Caddyfile.basic"
! grep -q 'auto_https off' "${TMP_WORK}/Caddyfile.basic"
grep -q 'basic_auth {' "${TMP_WORK}/Caddyfile.basic"
grep -q 'alice \$2a\$14\$test' "${TMP_WORK}/Caddyfile.basic"
grep -q 'X-DSH-Gateway-Auth "{\$DSH_GATEWAY_AUTH_SECRET}"' "${TMP_WORK}/Caddyfile.basic"
grep -q 'X-Forwarded-User "{http.auth.user.id}"' "${TMP_WORK}/Caddyfile.basic"
echo "    PASS basic + HTTPS mode"

echo "==> 3. Testing render-caddyfile.sh (forward_auth)"
CADDY_AUTH_MODE=forward_auth CADDY_FORWARD_AUTH_URL=http://oauth2-proxy:4180 \
  APPS_DIR="${APPS_DIR}" "${RENDER}" "${TMP_WORK}/Caddyfile.fwd"

grep -q 'forward_auth http://oauth2-proxy:4180' "${TMP_WORK}/Caddyfile.fwd"
grep -q 'handle /oauth2/\*' "${TMP_WORK}/Caddyfile.fwd"
grep -q 'handle /hooks/\*' "${TMP_WORK}/Caddyfile.fwd"
echo "    PASS forward_auth mode"

echo "==> 4. Testing sandbox-expose (--auth public|caddy, --set-auth, --list --json, rollback)"
EXPOSE="${REPO_ROOT}/sandbox/rootfs/usr/local/bin/sandbox-expose"

PATH="${STUB_BIN}:${PATH}" SANDBOX_APPS_DIR="${APPS_DIR}" SANDBOX_CADDY_CONFIG="${TMP_WORK}/Caddyfile.basic" \
  SANDBOX_PUBLIC_ORIGIN="http://localhost:8080" "${EXPOSE}" web 5173 >/dev/null
test -f "${APPS_DIR}/web.caddy"
grep -q '# Auth: public' "${APPS_DIR}/web.caddy"
! grep -q 'import auth_guard' "${APPS_DIR}/web.caddy"

PATH="${STUB_BIN}:${PATH}" SANDBOX_APPS_DIR="${APPS_DIR}" SANDBOX_CADDY_CONFIG="${TMP_WORK}/Caddyfile.basic" \
  SANDBOX_PUBLIC_ORIGIN="http://localhost:8080" "${EXPOSE}" --set-auth web caddy >/dev/null
grep -q '# Auth: caddy' "${APPS_DIR}/web.caddy"
grep -q 'import auth_guard' "${APPS_DIR}/web.caddy"

PATH="${STUB_BIN}:${PATH}" SANDBOX_APPS_DIR="${APPS_DIR}" SANDBOX_CADDY_CONFIG="${TMP_WORK}/Caddyfile.basic" \
  SANDBOX_PUBLIC_ORIGIN="http://localhost:8080" "${EXPOSE}" --auth caddy admin-ui 9001 >/dev/null
grep -q '# Auth: caddy' "${APPS_DIR}/admin-ui.caddy"

json_out=$(PATH="${STUB_BIN}:${PATH}" SANDBOX_APPS_DIR="${APPS_DIR}" SANDBOX_CADDY_CONFIG="${TMP_WORK}/Caddyfile.basic" \
  SANDBOX_PUBLIC_ORIGIN="http://localhost:8080" "${EXPOSE}" --list --json)
printf '%s' "${json_out}" | grep -q '"name":"web"'
printf '%s' "${json_out}" | grep -q '"auth_mode":"caddy"'

for bad_args in "--auth bogus web 5173" "--set-auth web bogus" "BadName 5173" "web abc" "web 8080" "web 3080" "web 4095" "web 2019" "web 70000" "web 5173 /"; do
  if PATH="${STUB_BIN}:${PATH}" SANDBOX_APPS_DIR="${APPS_DIR}" SANDBOX_CADDY_CONFIG="${TMP_WORK}/Caddyfile.basic" \
    "${EXPOSE}" ${bad_args} >/dev/null 2>&1; then
    echo "ERROR: sandbox-expose should reject: ${bad_args}" >&2; exit 1
  fi
done

if MOCK_CADDY_FAIL=1 PATH="${STUB_BIN}:${PATH}" SANDBOX_APPS_DIR="${APPS_DIR}" SANDBOX_CADDY_CONFIG="${TMP_WORK}/Caddyfile.basic" \
  "${EXPOSE}" --set-auth web public >/dev/null 2>&1; then
  echo "ERROR: sandbox-expose --set-auth should fail when caddy validation fails" >&2; exit 1
fi
grep -q '# Auth: caddy' "${APPS_DIR}/web.caddy"

if MOCK_CADDY_FAIL=1 PATH="${STUB_BIN}:${PATH}" SANDBOX_APPS_DIR="${APPS_DIR}" SANDBOX_CADDY_CONFIG="${TMP_WORK}/Caddyfile.basic" \
  "${EXPOSE}" broken 9999 >/dev/null 2>&1; then
  echo "ERROR: sandbox-expose should fail when caddy validation fails" >&2; exit 1
fi
test ! -f "${APPS_DIR}/broken.caddy"

PATH="${STUB_BIN}:${PATH}" SANDBOX_APPS_DIR="${APPS_DIR}" SANDBOX_CADDY_CONFIG="${TMP_WORK}/Caddyfile.basic" "${EXPOSE}" --remove web >/dev/null
PATH="${STUB_BIN}:${PATH}" SANDBOX_APPS_DIR="${APPS_DIR}" SANDBOX_CADDY_CONFIG="${TMP_WORK}/Caddyfile.basic" "${EXPOSE}" --remove admin-ui >/dev/null
test ! -f "${APPS_DIR}/web.caddy"
echo "    PASS sandbox-expose"

echo "==> 5. Testing sandbox-cron with mock crontab"
TEST_HOME="${TMP_WORK}/home"
mkdir -p "${TEST_HOME}/logs"
cat >"${STUB_BIN}/crontab" <<EOF
#!/usr/bin/env bash
if [ "\${1:-}" = "-r" ]; then
  rm -f "${TMP_WORK}/active-crontab"
  exit 0
fi
cp "\$1" "${TMP_WORK}/active-crontab"
EOF
chmod +x "${STUB_BIN}/crontab"

CRON="${REPO_ROOT}/sandbox/rootfs/usr/local/bin/sandbox-cron"
HOME="${TEST_HOME}" PATH="${STUB_BIN}:${PATH}" "${CRON}" add "0 9 * * * echo hi" >/dev/null
HOME="${TEST_HOME}" PATH="${STUB_BIN}:${PATH}" "${CRON}" list | grep -q '0 9 \* \* \* echo hi'
grep -q '0 9 \* \* \* echo hi' "${TMP_WORK}/active-crontab"
HOME="${TEST_HOME}" PATH="${STUB_BIN}:${PATH}" "${CRON}" clear >/dev/null
[ ! -s "${TEST_HOME}/.dsh-sandbox/crontab" ]
echo "    PASS sandbox-cron"

echo "==> 6. Testing sandbox-service with mock supervisorctl"
mkdir -p "${TEST_HOME}/.dsh-sandbox/services/conf.d"
touch "${TEST_HOME}/.dsh-sandbox/services/supervisord.conf"
cat >"${STUB_BIN}/supervisorctl" <<'EOF'
#!/usr/bin/env bash
echo "supervisorctl:$*" >>"${SUP_LOG:-/dev/null}"
EOF
chmod +x "${STUB_BIN}/supervisorctl"

SVC="${REPO_ROOT}/sandbox/rootfs/usr/local/bin/sandbox-service"
export SUP_LOG="${TMP_WORK}/sup.log"

[ "$(HOME="${TEST_HOME}" PATH="${STUB_BIN}:${PATH}" "${SVC}" list)" = "no user services" ]
HOME="${TEST_HOME}" PATH="${STUB_BIN}:${PATH}" "${SVC}" add api "python3 -m http.server 5000" >/dev/null
test -f "${TEST_HOME}/.dsh-sandbox/services/conf.d/api.conf"
grep -q '\[program:api\]' "${TEST_HOME}/.dsh-sandbox/services/conf.d/api.conf"
if HOME="${TEST_HOME}" PATH="${STUB_BIN}:${PATH}" "${SVC}" add api "dup" >/dev/null 2>&1; then
  echo "ERROR: duplicate service should fail" >&2; exit 1
fi
HOME="${TEST_HOME}" PATH="${STUB_BIN}:${PATH}" "${SVC}" restart api >/dev/null
HOME="${TEST_HOME}" PATH="${STUB_BIN}:${PATH}" "${SVC}" stop api >/dev/null
HOME="${TEST_HOME}" PATH="${STUB_BIN}:${PATH}" "${SVC}" remove api >/dev/null
test ! -f "${TEST_HOME}/.dsh-sandbox/services/conf.d/api.conf"
echo "    PASS sandbox-service"

echo "ALL SANDBOX SCRIPT TESTS PASSED"
