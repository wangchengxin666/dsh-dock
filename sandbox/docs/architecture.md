# 架构

## 设计约束

- **一个容器**：DSH、Caddy、oauth2-proxy、supervisor、用户服务都在同一个文件系统里。
- **一个发布端口**：只映射 `8080`；没有按用户或按服务发布端口。
- **一个认证入口**：只有 DSH 需要 OIDC；服务鉴权由服务自行实现。
- **非 root 开发**：DSH 和用户服务以 `dev` 运行；Caddy/oauth2-proxy 使用独立系统用户。
- **可预期的路径**：所有对外 URL 都是 `/<prefix>/...`，不依赖额外 DNS 或证书。

## 进程模型

```text
PID 1  supervisord (root)
├── caddy             :8080
├── oauth2-proxy      127.0.0.1:4180
├── dsh-token         127.0.0.1:3090
├── user-services     用户级 supervisord (dev)
│   └── 用户定义的服务
└── dsh               127.0.0.1:3080 (dev)
```

容器级 supervisor 保证 Caddy、oauth2-proxy 和用户服务编排器在 DSH 重启时仍然运行。
DSH 进程自身崩溃时由 supervisor 拉起；用户服务由嵌套 supervisor 管理。

## 路径规划

```text
/                    302 /dsh/
/dsh/*               DSH Web GUI / API / WebSocket
/_dsh-token          登录后自动交换 DSH token
/apps/<name>/*       用户服务（sandbox-expose）
/p/<port>/*          loopback 端口临时转发
/oauth2/*            oauth2-proxy 登录与回调
/healthz             Caddy 健康检查
```

除 `/dsh/*` 和 `/_dsh-token` 外，其余路径不经过 oauth2-proxy。

## 认证流程

```text
Browser
  │  GET /dsh/
  ▼
Caddy ── forward_auth ──▶ dsh-token /check
                            │  Host + Cookie
                            ▼
                         oauth2-proxy /oauth2/auth
                            │  202 + X-Auth-Request-Email
                            ▼
                         DSH_ALLOWED_EMAILS
                            │  pass / 403 / 302 /oauth2/start
                            ▼
                         DSH
```

oauth2-proxy 只负责 OIDC 认证；email 白名单检查发生在容器内部。未登录时返回
302 到 `/oauth2/start?rd=<原始 URI>`；email 不匹配时 403。

登录成功后，首次访问 `/dsh/` 会经过：

```text
/dsh/ (no marker) → /_dsh-token → 读取 web.log 中的启动 token
                  → 302 /dsh/?token=... → DSH 设置 session cookie
```

## Caddy 的角色

DSH 以 origin-root 方式提供 `/api`、`/assets` 等路径，但浏览器通过 `/dsh/` 访问。
Caddy 必须：

- 剥掉 `/dsh` 前缀，再转给 `127.0.0.1:3080`；
- 把 DSH 的 `Set-Cookie: Path=/` 改写为 `Path=/dsh/`；
- 保留浏览器 `Host`，供 DSH 的 trusted-host 校验；
- 透传 WebSocket Upgrade，并关闭长连接缓冲；
- 把 `/dsh` 308 到 `/dsh/`，保证相对资源正确解析。

这些规则集中在 `rootfs/usr/local/bin/render-caddyfile.sh`，容器启动时生成 Caddyfile
并校验。

## 临时端口路由

`/p/<port>/...` 始终开启，反代到 `127.0.0.1:<port>`。它是公开的，适合临时调试。
以下内部端口永远被排除：

| 端口 | 用途 |
| --- | --- |
| `2019` | Caddy admin API |
| `3080` | DSH |
| `3090` | token helper |
| `4180` | oauth2-proxy |
| `8080` | Caddy 自身 |

## 持久化

`/home/dev` 是唯一需要持久化的目录：

- `workspace/`
- `.dsh/`（profile、session、模型配置、skill）
- `.dsh-sandbox/`（Caddy apps 路由、用户 supervisord 配置）
- `logs/`

Compose 使用 named volume；也可以 bind mount，但需要保证 UID `1000` 可写。