# DSH Sandbox Platform

Per-user DeepSeek Harness (DSH) remote Agent OS workspaces on a Docker host, plus a control plane (`dsh-manager`) that provisions, manages, and serves a self-hosted plugin index and registry.

```text
                    ┌──────────────────────────────────────────┐
                    │ dsh-gateway (Traefik v3.7) :9000         │
                    │ Single-domain router + ForwardAuth       │
                    └──────┬───────────────────────────┬───────┘
                           │ /                         │ /s/<slug>/* (owner/admin verified)
                           ▼                           ▼
              ┌─────────────────────────┐   ┌──────────────────────────┐
              │ dsh-manager :9000       │   │ dsh-sbx-alice :8080      │
              │ FastAPI + SQLite        │   │ Caddy + DSH + Supervisor │
              │ React + shadcn/ui SPA   │   │ dsh-alice-home volume    │
              │ Self-Hosted Plugins     │   └──────────────────────────┘
              └─────────────────────────┘
```

## Repository layout

```text
sandbox/    runtime image: Caddy, optional OIDC (oauth2-proxy), DSH 0.2.2-rc.3,
            dev toolchains, user services, /p/<port> port router, sandbox-services skill
manager/    control plane: Traefik v3.7 gateway + FastAPI + SQLite + Docker SDK,
            React 19 + shadcn/ui Admin/User SPA, Templates, ForwardAuth, Plugin Registry
plugins/    hot-mounted DSH bundles auto-discovered by manager (file-manager, ...)
```

Each component has its own README and docs:

- [sandbox/README.md](sandbox/README.md)
- [sandbox/docs/](sandbox/docs/)
- [manager/README.md](manager/README.md)
- [plugins/README.md](plugins/README.md)

## Quick start

### 1. Build the sandbox image

```bash
cd sandbox
cp .env.example .env
docker compose build
```

A standalone sandbox can also be started directly with `docker compose up -d` (published on `${HOST_PORT:-8080}`). When using `manager`, building the `dsh-sandbox:latest` image on the host is sufficient.

### 2. Start the manager

```bash
cd manager
cp .env.example .env
# Edit SECRET_KEY, MANAGER_ADMIN_TOKEN (or OIDC_* when using SSO)
docker compose up -d --build
```

Open:

- Admin console: `http://<host>:9000/admin`
- User self-service workspace portal: `http://<host>:9000/my`
- Self-hosted DSH Plugin Discover Index: `http://<host>:9000/plugins/index.json`

## Authentication modes

Both the manager and sandboxes support flexible authentication configured in `manager/.env`:

- **`MANAGER_AUTH_MODE=token` / `SANDBOX_AUTH_MODE=none` (Zero external dependencies)**:
  - Sign in to `/admin` using `MANAGER_ADMIN_EMAIL` + `MANAGER_ADMIN_TOKEN` (or call `/api/*` with `Authorization: Bearer <MANAGER_ADMIN_TOKEN>`).
  - Sandboxes use DSH's built-in launch token and session cookie.
- **`MANAGER_AUTH_MODE=oidc` / `SANDBOX_AUTH_MODE=oidc` (Enterprise SSO)**:
  - Integrates with any standard OIDC provider (Keycloak, Auth0, Authentik, Okta, etc.).
  - Platform admins access `/admin`; regular users are directed to `/my` to launch or manage their own workspace.
  - Each sandbox gets isolated cookie names/secrets and enforces `DSH_ALLOWED_EMAILS`.

## Enterprise / Internal Network Customization (Zero Code Changes)

To run in an internal corporate network (private registry, apt/pip/npm mirrors, corporate PKI CA certificates, .NET SDK, or internal OIDC), configure `.env` and `ca-bundle.crt` without modifying tracked source files:

1. **Private Mirrors & Registries** (in `sandbox/.env` and `manager/.env`):
   ```dotenv
   DOCKER_REGISTRY=your-registry.internal/docker
   PYTHON_IMAGE=your-registry.internal/docker/python:3.12-slim
   APT_MIRROR=mirrors.aliyun.com
   PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/
   NPM_REGISTRY=https://registry.npmmirror.com
   INSTALL_DOTNET=true
   ```
2. **Corporate CA Certificates**:
   - Paste PEM certificates into `sandbox/ca-bundle.crt` and `manager/ca-bundle.crt` before building, **or**
   - Set `CUSTOM_CA_BUNDLE_PATH=/path/to/corporate-ca.crt` in `manager/.env` to bind-mount the CA bundle into every sandbox container at runtime.

## Ports

| Port | Purpose |
|---|---|
| `9000` | Manager UI, API, and self-hosted `/plugins/*` registry |
| `8080` | Standalone sandbox, when run directly with its compose |
| `18000–18999` | Managed per-user sandbox ports |
| `2019` / `3080` / `4180` / `3090` | Internal Caddy / DSH / oauth2-proxy / token helper, never published |
