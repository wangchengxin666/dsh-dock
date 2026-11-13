# Sandbox Custom Toolchains (`/opt/toolchain`)

`dsh-sandbox` ships `Node.js` and `Python` (`python3` + `uv`) in the base image. Additional SDKs or custom build-time toolchains live as modular scripts under `sandbox/toolchain/toolchain.d/*.sh` and are toggled with a single build switch:

```bash
docker build --build-arg INSTALL_TOOLCHAIN=true -t dsh-sandbox:toolchain .
```

Or in `sandbox/.env` before `docker compose build`:

```dotenv
INSTALL_TOOLCHAIN=true
```

## Convention (`sandbox/toolchain/toolchain.d/*.sh`)

When `INSTALL_TOOLCHAIN=true`, `install.sh` runs every `*.sh` file under `sandbox/toolchain/toolchain.d/` in sorted filename order (`LC_ALL=C`), e.g.:

- `10-dotnet.sh` (included by default as `.NET SDK` reference)
- `20-go.sh`
- `30-jdk.sh`

Delete or rename a file away from `.sh` (e.g. `10-dotnet.sh.disabled`) to skip it, or drop in new `*.sh` scripts to extend the toolchain.

Available environment variables and helper functions inside each `toolchain.d/*.sh` script:

- `TOOLCHAIN_DIR`: `/opt/toolchain` — install SDKs under `/opt/toolchain/<name>` (keeps `/home/dev` clean and out of workspace `.tar` backups).
- `TOOLCHAIN_BIN_DIR`: `/opt/toolchain/bin` — use `toolchain_link_bin <binary>...` so binaries are directly on `PATH` even for non-shell `docker exec`.
- `TOOLCHAIN_ENV_FILE`: `/opt/toolchain/env.sh` — sourced automatically by login shells (`/etc/profile.d/toolchain.sh`), interactive bash (`/etc/bash.bashrc`), `dsh-web`, and `user-services`.
- `toolchain_resolve_arch` — prints `amd64` or `arm64`.
- `toolchain_append_env '<export line>'` — persists environment variables (such as `DOTNET_ROOT`, `JAVA_HOME`, `GOROOT`) into `/opt/toolchain/env.sh` only when installed.
- `toolchain_add_path '<dir>'` — adds `<dir>` to `PATH` in `/opt/toolchain/env.sh` without hardcoding tool paths in the base image.

### Example: adding Go (`sandbox/toolchain/toolchain.d/20-go.sh`)

```bash
#!/usr/bin/env bash
set -euo pipefail

ver="1.24.2"
arch="$(toolchain_resolve_arch)"
url="https://mirrors.aliyun.com/golang/go${ver}.linux-${arch}.tar.gz"
tmp="/tmp/go${ver}.tar.gz"

curl -fL --retry 3 "${url}" -o "${tmp}"
rm -rf "${TOOLCHAIN_DIR}/go"
tar -xzf "${tmp}" -C "${TOOLCHAIN_DIR}" --no-same-owner
rm -f "${tmp}"

toolchain_append_env "export GOROOT=\"${TOOLCHAIN_DIR}/go\""
toolchain_append_env 'export GOPATH="/home/dev/go"'
toolchain_append_env 'export GOPROXY="https://goproxy.cn,direct"'
toolchain_add_path "${TOOLCHAIN_DIR}/go/bin"
toolchain_add_path "/home/dev/go/bin"
toolchain_link_bin "${TOOLCHAIN_DIR}/go/bin/go" "${TOOLCHAIN_DIR}/go/bin/gofmt"
```

When `INSTALL_TOOLCHAIN=false` (default), `toolchain.d/*.sh` is skipped and no SDK-specific binaries, `PATH` segments, or environment variables are written into the image.
