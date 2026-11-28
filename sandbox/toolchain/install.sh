#!/usr/bin/env bash
# Build-time toolchain bootstrapper for dsh-sandbox.
# Always initializes /opt/toolchain, /opt/toolchain/bin, and /opt/toolchain/env.sh.
# When INSTALL_TOOLCHAIN=true, executes scripts under toolchain.d/*.sh in filename order.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLCHAIN_DIR="${TOOLCHAIN_DIR:-/opt/toolchain}"
TOOLCHAIN_BIN_DIR="${TOOLCHAIN_DIR}/bin"
TOOLCHAIN_ENV_FILE="${TOOLCHAIN_DIR}/env.sh"

export TOOLCHAIN_DIR TOOLCHAIN_BIN_DIR TOOLCHAIN_ENV_FILE

mkdir -p "${TOOLCHAIN_DIR}" "${TOOLCHAIN_BIN_DIR}"

if [ ! -f "${TOOLCHAIN_ENV_FILE}" ]; then
  cat >"${TOOLCHAIN_ENV_FILE}" <<'EOF'
# Auto-generated during image build. Sourced by shells, dsh-web, and user-services.
export TOOLCHAIN_DIR="/opt/toolchain"
export TOOLCHAIN_BIN_DIR="/opt/toolchain/bin"
case ":${PATH:-}:" in
  *":/opt/toolchain/bin:"*) ;;
  *) export PATH="/opt/toolchain/bin:${PATH:-/usr/local/bin:/usr/bin:/bin}" ;;
esac
EOF
fi

toolchain_resolve_arch() {
  local raw="${TARGETARCH:-$(uname -m)}"
  case "${raw}" in
    amd64|x86_64) printf 'amd64\n' ;;
    arm64|aarch64) printf 'arm64\n' ;;
    *)
      echo "toolchain: unsupported architecture: ${raw}" >&2
      return 1
      ;;
  esac
}

toolchain_append_env() {
  local line="$1"
  if ! grep -Fqx "${line}" "${TOOLCHAIN_ENV_FILE}" 2>/dev/null; then
    printf '%s\n' "${line}" >>"${TOOLCHAIN_ENV_FILE}"
  fi
}

toolchain_add_path() {
  local dir="$1"
  local marker="# PATH:${dir}"
  if ! grep -Fqx "${marker}" "${TOOLCHAIN_ENV_FILE}" 2>/dev/null; then
    cat >>"${TOOLCHAIN_ENV_FILE}" <<EOF
${marker}
case ":\${PATH:-}:" in
  *":${dir}:"*) ;;
  *) export PATH="${dir}:\${PATH:-}" ;;
esac
EOF
  fi
  case ":${PATH}:" in
    *":${dir}:"*) ;;
    *) export PATH="${dir}:${PATH}" ;;
  esac
}

toolchain_link_bin() {
  local target=""
  for target in "$@"; do
    [ -e "${target}" ] || continue
    ln -sf "${target}" "${TOOLCHAIN_BIN_DIR}/$(basename "${target}")"
  done
}

export -f toolchain_resolve_arch toolchain_append_env toolchain_add_path toolchain_link_bin

if [ "${INSTALL_TOOLCHAIN:-false}" = "true" ]; then
  dropin_dir="${SCRIPT_DIR}/toolchain.d"
  if [ -d "${dropin_dir}" ]; then
    while IFS= read -r -d '' script_file; do
      echo "toolchain: executing ${script_file}"
      bash -euo pipefail "${script_file}"
    done < <(find "${dropin_dir}" -maxdepth 1 -type f -name '*.sh' -print0 | LC_ALL=C sort -z)
  else
    echo "toolchain: INSTALL_TOOLCHAIN=true but ${dropin_dir} not found" >&2
    exit 1
  fi
else
  echo "toolchain: INSTALL_TOOLCHAIN=${INSTALL_TOOLCHAIN:-false}; skipping toolchain.d/*.sh"
fi

chmod -R a+rX "${TOOLCHAIN_DIR}"
chmod 0644 "${TOOLCHAIN_ENV_FILE}"
