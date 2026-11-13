# DSH Sandbox

一个容器、一个端口，交付完整的 DeepSeek Harness 开发环境。

`Node 24` · `Python 3.13` · `.NET 10` · `Caddy` · `oauth2-proxy` · `supervisor`

---

## 概览

DSH Sandbox 把 DSH Web、开发工具链和长期运行的服务收进一个**单端口、非 root** 的容器。
浏览器只访问 Caddy；DSH 是唯一需要登录的入口，其他服务保持开放，由服务自己决定如何鉴权。

| 能力 | 说明 |
| --- | --- |
| **单一入口** | 只发布 `8080`，所有路径由容器内 Caddy 统一路由 |
| **开箱即用** | Node、Python、.NET、git、tmux、uv、pnpm、企业 CA、中文 locale/字体 |
| **DSH 专属认证** | `/dsh/*` 使用 OIDC + email 白名单；其余路径不拦截 |
| **服务模型** | `sandbox-service` 管常驻进程，`sandbox-expose` 挂载 `/apps/<name>/` |
| **临时端口** | `/p/<port>/` 始终可用，适合快速验证 |
| **Agent 友好** | 内置 `sandbox-services` skill，告诉 agent 如何起服务、暴露 URL、排查问题 |
| **可复现** | 固定版本、构建参数与运行时 env 完全分离 |

## 架构

```text
                    ┌──────────────── dsh-sandbox ────────────────┐
Browser ── :8080 ──▶│ Caddy                                      │
                    │ ├── /                 → 302 /dsh/          │
                    │ ├── /dsh/*            → DSH (OIDC + email) │
                    │ ├── /apps/<name>/*    → user services      │
                    │ ├── /p/<port>/*       → loopback ports     │
                    │ ├── /oauth2/*         → oauth2-proxy       │
                    │ └── /healthz          → 200                │
                    │                                            │
                    │ supervisor                                 │
                    │ ├── caddy                                  │
                    │ ├── oauth2-proxy                           │
                    │ ├── dsh-token                              │
                    │ ├── dsh            (user: dev)             │
                    │ └── user-services  (user: dev)             │
                    └────────────────────────────────────────────┘
```

认证边界很窄：**只有 DSH** 需要 OIDC 和 email 白名单。`/apps/*`、`/p/*` 公开，
鉴权由服务自己实现。

## 快速开始

```bash
cp .env.example .env
chmod 600 .env

# 默认可直接构建运行（AUTH_MODE=none 本地模式，或配置 OIDC_* 开启 SSO）：
make up
```

打开：

```text
http://<host>:8080/
```

首页会跳转到 `/dsh/`。首次登录后，token 由容器内 helper 自动附加（OIDC 模式）或由 `make up` / `make token` 输出。

手动运行：

```bash
docker run -d --name dsh-sandbox -p 18086:8080 \
  --env-file .env \
  -v dsh-sandbox-home:/home/dev \
  dsh-sandbox:latest
```

## 访问与认证

| 路径 | 行为 |
| --- | --- |
| `/` | 302 到 `/dsh/` |
| `/dsh/*` | **OIDC + `DSH_ALLOWED_EMAILS`** |
| `/_dsh-token` | 同 DSH 门禁，登录后自动交换 token |
| `/apps/<name>/` | 公开；服务自己实现鉴权 |
| `/p/<port>/` | 公开；临时端口转发 |
| `/oauth2/*` | oauth2-proxy 登录/回调 |
| `/healthz` | 公开健康检查 |

> `/apps/*` 和 `/p/*` 一旦暴露，任何能访问 8080 的人都能访问。需要登录、Bearer、
> mTLS 或 API key 时，请在你的服务内部实现。

## 文档

| 文档 | 内容 |
| --- | --- |
| [架构](docs/architecture.md) | 进程模型、路径规划、DSH token 流程 |
| [构建与运维](docs/operations.md) | 构建参数、env 分层、Compose、持久化 |
| [服务与暴露](docs/services.md) | DSH 插件、`sandbox-service`、`sandbox-expose`、base path |
| [OIDC](docs/OIDC.md) | 一个官方 oauth2-proxy、email 检查、Keycloak 示例 |
| [安全模型](docs/security.md) | 认证边界、容器边界、CA、密钥 |
| [故障排查](docs/troubleshooting.md) | 登录、路由、服务、资源问题 |

## 安全与 CA

- 容器是安全边界：DSH 以 `dev` 运行，没有 sudo，服务只在容器内监听。
- `ca-bundle.crt` 是公开 CA 证书集合（184 张），**不含私钥**；提交到内网仓库是安全的。
  如果安全策略不允许内部 CA 名称进入代码库，可在构建时从外部挂载或替换该文件。
- 不要把 `.env` 提交到仓库；它已在 `.gitignore` 中。
- 不要把 Caddy admin、DSH、oauth2-proxy、token helper 的内部端口通过 `/p/` 暴露。

## 目录

```text
.
├── Dockerfile
├── docker-compose.yml
├── Makefile
├── .env.example      # 运行时
├── docs/
├── ca-bundle.crt
└── rootfs/                   # entrypoint、Caddy、supervisor、skill、helper
```