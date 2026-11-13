# OIDC 接入（任意 provider）

容器里只跑**一个** oauth2-proxy，完全用它官方的 `OAUTH2_PROXY_*` 环境变量
配置。它只保护 **DSH**：Caddy 对 `/dsh/*` 和 `/_dsh-token` 做 `forward_auth`，
调用 token helper 的 `/check`；helper 再用浏览器 Host + cookie 请求
oauth2-proxy `/oauth2/auth`，拿到 `X-Auth-Request-Email`，与
`DSH_ALLOWED_EMAILS` 比较。

```
/oauth2/*      -> oauth2-proxy 127.0.0.1:4180
/dsh/*         -> forward_auth helper /check -> oauth2-proxy -> email 检查
/_dsh-token    -> forward_auth helper /check
/apps/*        -> 公开（服务自己实现鉴权）
/p/*          -> 公开（服务自己实现鉴权）
/healthz       -> 公开
/              -> 302 /dsh/
```

## 配置

`.env`（官方变量名；构建参数在 Dockerfile ARG）：

```dotenv
AUTH_MODE=oidc

OAUTH2_PROXY_PROVIDER=oidc
OAUTH2_PROXY_OIDC_ISSUER_URL=https://idp.example.com/realms/staff
OAUTH2_PROXY_CLIENT_ID=dsh-sandbox
OAUTH2_PROXY_CLIENT_SECRET=...
OAUTH2_PROXY_REDIRECT_URL=https://sandbox.example.com/oauth2/callback
OAUTH2_PROXY_WHITELIST_DOMAINS=sandbox.example.com

# 16/24/32 bytes；oauth2-proxy 原生要求
OAUTH2_PROXY_COOKIE_SECRET=...
OAUTH2_PROXY_COOKIE_SECURE=true
OAUTH2_PROXY_COOKIE_SAMESITE=lax
OAUTH2_PROXY_COOKIE_EXPIRE=168h

OAUTH2_PROXY_SCOPE=openid profile email
OAUTH2_PROXY_OIDC_EMAIL_CLAIM=email
# 登录只要求 OIDC 成功；email 白名单在容器内检查
OAUTH2_PROXY_EMAIL_DOMAINS=*
OAUTH2_PROXY_REVERSE_PROXY=true
OAUTH2_PROXY_HTTP_ADDRESS=127.0.0.1:4180
OAUTH2_PROXY_UPSTREAMS=static://202
OAUTH2_PROXY_SET_XAUTHREQUEST=true
OAUTH2_PROXY_SKIP_PROVIDER_BUTTON=true
OAUTH2_PROXY_SKIP_CLAIMS_FROM_PROFILE_URL=true
OAUTH2_PROXY_SESSION_COOKIE_MINIMAL=true
OAUTH2_PROXY_TRUSTED_PROXY_IPS=127.0.0.1/32
OAUTH2_PROXY_PASS_USER_HEADERS=false

# DSH-only email 白名单，逗号分隔
DSH_ALLOWED_EMAILS=you@example.com
```

`entrypoint` 只校验必需变量和 cookie secret 长度，然后直接启动
`/usr/local/bin/oauth2-proxy`；没有自己的 env 翻译层。

## IdP 侧

- confidential/web client（有 client secret）+ authorization code flow；
- **一个** Redirect URI：
  ```
  https://sandbox.example.com/oauth2/callback
  ```
  内网 HTTP 就是 `http://host:8080/oauth2/callback`；
- scope 至少 `openid profile email`；
- Keycloak 的 realm `Require SSL` 需要允许 HTTP（内网无证书时设 `none` 或
  `external`）；
- 如果 email 在 `preferred_username` 等 claim，改
  `OAUTH2_PROXY_OIDC_EMAIL_CLAIM`；
- `email_verified=false` 的账号默认会被拒；需要放行时设
  `OAUTH2_PROXY_INSECURE_OIDC_ALLOW_UNVERIFIED_EMAIL=true`。

## email 检查

`DSH_ALLOWED_EMAILS` 是唯一授权开关，大小写不敏感：

```dotenv
DSH_ALLOWED_EMAILS=alice@example.com,bob@example.com
```

helper 的 `/check` 只接受 oauth2-proxy 返回的 202 + email；未登录返回 302
到 `/oauth2/start?rd=<原始 URI>`，email 不在列表返回 403。`/check` 只监听
`127.0.0.1:3090`，Caddy 只在 `/dsh/*` 和 `/_dsh-token` 的 `forward_auth`
调用它，外部无法直接访问。

## 公开服务

`/apps/*` 和 `/p/*` **不经过 oauth2-proxy**。任何能访问 8080 的人都能打开；
需要认证时由用户在自己的服务内部实现（session、Bearer、mTLS、应用登录等）。
`sandbox-expose` 不会加 Caddy 认证，`--auth` 也已移除。

## 登录后自动带 token

首次访问 `/dsh/`：

1. Caddy 发现没有 `dsh_token_seen`，302 到 `/_dsh-token`；
2. `/_dsh-token` 走 `/check`：未登录先 Keycloak；
3. 登录且 email 通过后，helper 从 `/home/dev/.dsh/web.log` 读最新 token，
   设置 marker cookie，302 到 `/dsh/?token=...`；
4. DSH 交换 token 并设置自己的 session，之后正常加载。

## 常见问题

| 现象 | 处理 |
| --- | --- |
| `missing setting: client-secret` | 必须 confidential client；填 `OAUTH2_PROXY_CLIENT_SECRET` |
| cookie secret 报错 | `OAUTH2_PROXY_COOKIE_SECRET` 必须是 16/24/32 字节 |
| 一直跳 IdP / 循环 | `OAUTH2_PROXY_REDIRECT_URL` 与实际访问 scheme/host 是否一致；IdP 是否登记该 URI |
| 登录成功但 403 | email 不在 `DSH_ALLOWED_EMAILS`，或 ID token 没有 email；看容器日志 `forbidden: email not allowed` |
| `/dsh/` 502 | oauth2-proxy 或 DSH 没起来：看 `[program:oauth2-proxy]` / `[program:dsh]` |
| `/apps/x/` 没有跳 IdP | 正常：apps 是公开的，自己加鉴权 |
| `/apps/x/` 502 | 是服务自己没起，不是 OIDC 的问题 |
| 想本机跳过登录 | `AUTH_MODE=none`，同时不要暴露端口 |

## OIDC / Keycloak 示例

```dotenv
AUTH_MODE=oidc
OAUTH2_PROXY_PROVIDER=oidc
OAUTH2_PROXY_OIDC_ISSUER_URL=https://idp.example.com/realms/main
OAUTH2_PROXY_CLIENT_ID=dsh-sandbox
OAUTH2_PROXY_CLIENT_SECRET=<client secret>
OAUTH2_PROXY_REDIRECT_URL=http://localhost:18086/oauth2/callback
OAUTH2_PROXY_WHITELIST_DOMAINS=localhost:18086,localhost
OAUTH2_PROXY_COOKIE_SECURE=false
DSH_ALLOWED_EMAILS=you@example.com
```

IdP 客户端登记 Redirect URI：

```
http://localhost:18086/oauth2/callback
```

如使用私有/企业自签名 CA，可将 PEM 证书放入 `ca-bundle.crt` 构建，或在运行时挂载到 `/etc/dsh/ca/custom-ca.crt`。