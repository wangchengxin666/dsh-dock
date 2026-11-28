#!/usr/bin/env bash
# Default .NET SDK installer -> /opt/toolchain/dotnet
# Executed when INSTALL_TOOLCHAIN=true (ordered by filename in toolchain.d/*.sh).
set -euo pipefail

DOTNET_VER="${DOTNET_VERSION:-10.0.404}"
ARCH="$(toolchain_resolve_arch)"
case "${ARCH}" in
  amd64) dotnet_arch="x64" ;;
  arm64) dotnet_arch="arm64" ;;
esac

install_dir="${TOOLCHAIN_DIR}/dotnet"
url="https://builds.dotnet.microsoft.com/dotnet/Sdk/${DOTNET_VER}/dotnet-sdk-${DOTNET_VER}-linux-${dotnet_arch}.tar.gz"
tmp_tgz="/tmp/dotnet-sdk-${DOTNET_VER}.tar.gz"

echo "toolchain: installing .NET SDK ${DOTNET_VER} (${dotnet_arch}) -> ${install_dir}"
curl -fL --retry 3 "${url}" -o "${tmp_tgz}"
rm -rf "${install_dir}"
mkdir -p "${install_dir}"
tar -xzf "${tmp_tgz}" -C "${install_dir}" --no-same-owner
rm -f "${tmp_tgz}"

toolchain_append_env "export DOTNET_ROOT=\"${install_dir}\""
toolchain_append_env 'export DOTNET_CLI_HOME="/home/workspace"'
toolchain_append_env 'export DOTNET_CLI_TELEMETRY_OPTOUT="1"'
toolchain_append_env 'export DOTNET_NOLOGO="1"'
toolchain_add_path "${install_dir}"
toolchain_add_path "/home/workspace/.dotnet/tools"
toolchain_link_bin "${install_dir}/dotnet"

DOTNET_ROOT="${install_dir}" "${TOOLCHAIN_BIN_DIR}/dotnet" --version
