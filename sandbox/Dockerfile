# ---------------------------------------------------------------------------
# Binary sources: reuse the official images instead of downloading tarballs.
# ---------------------------------------------------------------------------
# Full image prefix for Docker Hub images. Defaults to Docker Hub; override
# DOCKER_REGISTRY (e.g. your-registry.example.com/docker) in restricted networks.
ARG DOCKER_REGISTRY=docker.io/library
ARG CADDY_VERSION=2.11.9
ARG OAUTH2_PROXY_VERSION=v7.15.6
ARG DEBIAN_VERSION=13-slim

FROM ${DOCKER_REGISTRY}/caddy:${CADDY_VERSION}-alpine AS caddy-bin
FROM quay.io/oauth2-proxy/oauth2-proxy:${OAUTH2_PROXY_VERSION} AS oauth2proxy-bin

# ---------------------------------------------------------------------------
# Runtime image
# ---------------------------------------------------------------------------
FROM ${DOCKER_REGISTRY}/debian:${DEBIAN_VERSION}

ARG NODE_VERSION=24.22.3
ARG DSH_VERSION=0.2.2-rc.3
ARG INSTALL_BROWSER=false
ARG INSTALL_DOTNET=false
ARG DOTNET_VERSION=10.0.404
ARG DOTNET_SDK_URL=
ARG DEV_UID=1000
ARG DEV_GID=1000
# Optional Debian mirror hostname (e.g. mirrors.aliyun.com) and npm registry.
ARG APT_MIRROR=deb.debian.org
ARG NPM_REGISTRY=

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    TZ=UTC \
    DOTNET_ROOT=/usr/local/dotnet \
    DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    DOTNET_NOLOGO=1 \
    CHROME_BIN=/usr/bin/chromium \
    CHROMIUM_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
    PATH=/usr/local/bin:/usr/local/dotnet:/home/dev/.npm-global/bin:/home/dev/.local/bin:/home/dev/.dotnet/tools:/usr/bin:/bin:/usr/sbin:/sbin

RUN if [ -n "${APT_MIRROR}" ] && [ "${APT_MIRROR}" != "deb.debian.org" ]; then \
      sed -i "s|deb.debian.org|${APT_MIRROR}|g; s|security.debian.org|${APT_MIRROR}|g" /etc/apt/sources.list.d/debian.sources; \
    fi \
 && apt-get -o Acquire::Retries=5 update \
 && apt-get -o Acquire::Retries=5 install -y --no-install-recommends \
      ca-certificates curl wget git openssh-client gnupg \
      build-essential pkg-config libssl-dev zlib1g-dev libffi-dev libsqlite3-dev \
      libicu-dev libunwind8 \
      python3 python3-venv python3-pip python3-dev pipx \
      jq ripgrep fd-find unzip zip xz-utils tar less nano vim-tiny tmux cron \
      procps htop iproute2 dnsutils netcat-openbsd rsync file tzdata \
      supervisor bubblewrap \
      locales fontconfig fonts-wqy-microhei \
 && localedef -i zh_CN -f UTF-8 zh_CN.UTF-8 \
 && fc-cache -f \
 && rm -rf /var/lib/apt/lists/* \
 && ln -sf /usr/bin/fdfind /usr/local/bin/fd

# Optional Headless Chromium + Xvfb layer (enable with --build-arg INSTALL_BROWSER=true)
RUN if [ "${INSTALL_BROWSER}" = "true" ]; then \
      apt-get -o Acquire::Retries=5 update \
      && apt-get -o Acquire::Retries=5 install -y --no-install-recommends chromium xvfb dbus-x11 \
      && rm -rf /var/lib/apt/lists/*; \
    fi

# ---------------------------------------------------------------------------
# Node.js (DSH itself requires Node >= 24.9)
# ---------------------------------------------------------------------------
# Set automatically by BuildKit; default keeps plain docker build on amd64.
ARG TARGETARCH=amd64
RUN set -eux; \
    case "${TARGETARCH}" in \
      amd64) node_arch=x64 ;; \
      arm64) node_arch=arm64 ;; \
      *) echo "unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL --retry 3 "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${node_arch}.tar.xz" -o /tmp/node.tar.xz; \
    tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 --no-same-owner; \
    rm -f /tmp/node.tar.xz; \
    node --version; npm --version

# npm >= 11.6 blocks dependency install scripts unless approved. DSH needs
# node-pty's prebuild and koffi's native build, so allow the pinned packages'
# scripts explicitly for this build-time install.
ARG DSH_PACKAGE_VERSION=0.2.2-rc.3
RUN set -eux; \
    registry_flag=""; \
    if [ -n "${NPM_REGISTRY}" ]; then registry_flag="--registry=${NPM_REGISTRY}"; fi; \
    npm install -g --no-fund --no-audit --dangerously-allow-all-scripts ${registry_flag} \
      "pnpm@10" "@deepseek-ai/dsh@${DSH_PACKAGE_VERSION}" \
 && npm cache clean --force

# ---------------------------------------------------------------------------
# Optional .NET SDK (enable with --build-arg INSTALL_DOTNET=true) and uv (Python)
# ---------------------------------------------------------------------------
RUN set -eux; \
    if [ "${INSTALL_DOTNET}" = "true" ]; then \
      case "${TARGETARCH}" in \
        amd64) dotnet_arch=x64 ;; \
        arm64) dotnet_arch=arm64 ;; \
        *) echo "unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
      esac; \
      url="${DOTNET_SDK_URL:-https://dotnetcli.azureedge.net/dotnet/Sdk/${DOTNET_VERSION}/dotnet-sdk-${DOTNET_VERSION}-linux-${dotnet_arch}.tar.gz}"; \
      echo "downloading ${url}"; \
      curl -fL --retry 3 "$url" -o /tmp/dotnet-sdk.tar.gz; \
      mkdir -p /usr/local/dotnet; \
      tar -xzf /tmp/dotnet-sdk.tar.gz -C /usr/local/dotnet; \
      ln -sf /usr/local/dotnet/dotnet /usr/local/bin/dotnet; \
      rm -f /tmp/dotnet-sdk.tar.gz; \
      dotnet --version; \
    fi

RUN curl -fsSL https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh \
 && uv --version

# ---------------------------------------------------------------------------
# Reverse proxy and identity-aware proxy binaries
# ---------------------------------------------------------------------------
COPY --from=caddy-bin /usr/bin/caddy /usr/local/bin/caddy
COPY --from=oauth2proxy-bin /bin/oauth2-proxy /usr/local/bin/oauth2-proxy

# ---------------------------------------------------------------------------
# Optional custom / enterprise CA bundle. Installed only if PEM certificates
# are present in ca-bundle.crt, or mounted into /etc/dsh/ca/*.crt at runtime.
# ---------------------------------------------------------------------------
RUN mkdir -p /etc/dsh/ca
COPY ca-bundle.crt /tmp/ca-bundle.crt
RUN if grep -q "^-----BEGIN CERTIFICATE-----" /tmp/ca-bundle.crt 2>/dev/null; then \
      cp /tmp/ca-bundle.crt /usr/local/share/ca-certificates/custom-ca-bundle.crt; \
      update-ca-certificates; \
    fi \
 && rm -f /tmp/ca-bundle.crt

# Node uses its own store; Go/Python/git honor these. The file is regenerated
# by update-ca-certificates and includes both Debian roots and any custom CAs.
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt \
    SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt \
    REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt \
    CURL_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt \
    GIT_SSL_CAINFO=/etc/ssl/certs/ca-certificates.crt

# ---------------------------------------------------------------------------
# Users: dev is the only account the agent runs as; caddy/oauth run daemons.
# ---------------------------------------------------------------------------
RUN set -eux; \
    groupadd -g "${DEV_GID}" dev; \
    useradd -m -u "${DEV_UID}" -g dev -s /bin/bash dev; \
    groupadd -r caddy; \
    useradd -r -g caddy -d /var/lib/caddy -s /usr/sbin/nologin caddy; \
    groupadd -r oauth; \
    useradd -r -g oauth -d /var/lib/oauth2-proxy -s /usr/sbin/nologin oauth; \
    \
    install -d -o dev   -g dev   -m 0755 /home/dev /home/dev/workspace /home/dev/.dsh; \
    install -d -o dev   -g caddy -m 2775 /home/dev/.dsh-sandbox /home/dev/.dsh-sandbox/caddy /home/dev/.dsh-sandbox/caddy/apps.d; \
    install -d -o oauth -g oauth -m 0750 /home/dev/.dsh-sandbox/oauth2; \
    install -d -o caddy -g caddy -m 0755 /var/lib/caddy /var/lib/caddy/.config /var/lib/caddy/.local/share; \
    install -d -o oauth -g oauth -m 0755 /var/lib/oauth2-proxy; \
    install -d -o dev   -g dev   -m 0755 /home/dev/.npm-global /home/dev/.local/bin /home/dev/logs; \
    \
    printf '# Drop-in Caddy routes. See sandbox-expose(1).\n' > /home/dev/.dsh-sandbox/caddy/apps.d/00-empty.caddy; \
    chown dev:caddy /home/dev/.dsh-sandbox/caddy/apps.d/00-empty.caddy; \
    chmod 0644 /home/dev/.dsh-sandbox/caddy/apps.d/00-empty.caddy; \
    \
    printf 'prefix=/home/dev/.npm-global\n' > /home/dev/.npmrc; \
    chown dev:dev /home/dev/.npmrc

# ---------------------------------------------------------------------------
# Application files
# ---------------------------------------------------------------------------
COPY rootfs/ /
RUN sed -i 's/\r$//' \
      /usr/local/bin/dsh-token \
      /usr/local/bin/dsh-web \
      /usr/local/bin/entrypoint.sh \
      /usr/local/bin/render-caddyfile.sh \
      /usr/local/bin/sandbox-cron \
      /usr/local/bin/sandbox-expose \
      /usr/local/bin/sandbox-service \
      /usr/local/bin/user-services \
      /etc/dsh/*.yml \
      /etc/supervisor/supervisord.conf \
 && chmod 0755 /usr /usr/local /usr/local/bin /etc /etc/dsh /etc/supervisor \
 && chmod -R a+rX /etc/dsh \
 && chmod 0755 /usr/local/bin/* \
 && chmod 0644 /etc/supervisor/supervisord.conf

# Pre-initialize the Web profile so the first start does not need extra work
# and so a bind-mounted empty HOME still has a template to fall back on.
USER dev
RUN HOME=/home/dev DSH_HOME=/home/dev/.dsh dsh --profile web --help >/dev/null
USER root

# Build-time guard: root-mounted and subpath-mounted (/s/alice) variants must parse.
RUN CADDY_PORT=8080 DSH_PORT=3080 DSH_MOUNT=/dsh AUTH_MODE=none \
      APPS_DIR=/home/dev/.dsh-sandbox/caddy/apps.d PUBLIC_SCHEME=http \
      /usr/local/bin/render-caddyfile.sh /tmp/Caddyfile.none \
 && caddy validate --config /tmp/Caddyfile.none --adapter caddyfile \
 && CADDY_PORT=8080 DSH_PORT=3080 SANDBOX_BASE_PATH=/s/alice DSH_MOUNT=/s/alice/dsh AUTH_MODE=oidc \
      APPS_DIR=/home/dev/.dsh-sandbox/caddy/apps.d PUBLIC_SCHEME=https \
      /usr/local/bin/render-caddyfile.sh /tmp/Caddyfile.subpath \
 && caddy validate --config /tmp/Caddyfile.subpath --adapter caddyfile \
 && rm -f /tmp/Caddyfile.none /tmp/Caddyfile.subpath

ENV DSH_HOME=/home/dev/.dsh \
    DSH_PERMISSION_MODE=danger-full-access \
    CADDY_PORT=8080 \
    DSH_PORT=3080 \
    DSH_MOUNT=/dsh \
    APPS_DIR=/home/dev/.dsh-sandbox/caddy/apps.d

WORKDIR /home/dev/workspace
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${CADDY_PORT:-8080}/healthz" || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
