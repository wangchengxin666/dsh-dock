# OIDC 接入（任意 Standard Provider）

DSH 沙箱平台已将身份认证统一收口至外层 **Traefik + `dsh-manager` ForwardAuth**：容器内部不再运行 `oauth2-proxy`。`dsh-manager` 同时负责 `/admin`、`/my` 以及各沙箱 DSH 入口的身份鉴权。

```text
/s/<slug>/           -> Traefik ForwardAuth -> dsh-manager (/api/auth/verify-sandbox/<slug>)
/s/<slug>/dsh/*      -> Traefik ForwardAuth -> dsh-manager -> sandbox Caddy -> DSH
/s/<slug>/_dsh-token -> Traefik ForwardAuth -> dsh-manager -> 交换 DSH launch token
/s/<slug>/apps/*     -> 公开（服务自行实现鉴权）
/s/<slug>/p/*        -> 公开（服务自行实现鉴权）
/s/<slug>/healthz    -> 公开健康检查
```

## Manager 配置（`manager/.env`）

当启用企业 SSO（Keycloak、Auth0、Authentik、Okta 等）时，在 `manager/.env` 中配置：

```dotenv
MANAGER_AUTH_MODE=oidc
MANAGER_ADMIN_EMAIL=admin@example.com
MANAGER_PUBLIC_URL=https://sandbox.example.com
MANAGER_INTERNAL_URL=http://dsh-manager:9000
SECRET_KEY=<32+ 随机字符>

OIDC_ISSUER_URL=https://idp.example.com/realms/main
# 可选：当 Manager 运行在 Docker 内且浏览器通过 localhost/外网访问 IdP 时，可填写容器内可达的 discovery 地址
# OIDC_DISCOVERY_URL=http://dsh-keycloak:8080/realms/main/.well-known/openid-configuration
OIDC_CLIENT_ID=dsh-sandbox
OIDC_CLIENT_SECRET=<client-secret>
OIDC_SCOPE=openid profile email
OIDC_EMAIL_CLAIM=email
```

若部署环境没有 IdP / OIDC，仅需设置 `MANAGER_AUTH_MODE=token`，管理员可在 `/admin` 添加普通用户并为其设置初始密码，普通用户通过 `/login` 即可登录自己的 `/my` 门户和工作区，并在 `/my` 自助修改密码。

## IdP 侧配置要点

- Confidential/web client（启用 Client authentication）+ Authorization Code flow；
- Redirect URI（仅需登记 `dsh-manager` 的统一回调）：
  ```text
  <MANAGER_PUBLIC_URL>/auth/callback
  ```
  例如 `https://sandbox.example.com/auth/callback` 或本地调试 `http://localhost:9000/auth/callback`；
- Scope 至少包含 `openid profile email`；
- Manager 通过 `OIDC_EMAIL_CLAIM`（默认 `email`，如改用 `preferred_username` 可相应修改）提取用户邮箱，并与 `platform_admins` 或沙箱 owner 邮箱（大小写不敏感）比对；
- 已登录但被管理员禁用（`status != "active"`）的普通用户在访问 `/login`、`/auth/callback`、`/my` 或 `/s/<slug>/dsh/*` 时会被拒绝（403 / 提示账号已禁用）。

## 登录后自动带 token

首次访问 `/s/<slug>/dsh/`：

1. Traefik 先调用 `/api/auth/verify-sandbox/<slug>`：未登录会 302 跳转至 OIDC 登录（或本地 `/login`）；登录身份既非 owner 也非管理员则返回 403；
2. 鉴权通过后请求抵达沙箱 Caddy；Caddy 若检测到浏览器没有 `dsh_token_seen_<slug>` cookie，自动 302 到 `/s/<slug>/_dsh-token`；
3. `/_dsh-token` 从 `/home/dev/.dsh/web.log` 读取最新 launch token，种下标记 cookie 并 302 到 `/s/<slug>/dsh/?token=...`；
4. DSH 完成 token 交换并签发自己的 session cookie。
