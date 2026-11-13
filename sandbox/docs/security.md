# 安全模型

## 认证边界

```text
/dsh/*          OIDC + DSH_ALLOWED_EMAILS
/_dsh-token     同 DSH
/apps/*         公开，服务自行鉴权
/p/*            公开，服务自行鉴权
/healthz        公开
/oauth2/*       公开（登录/回调）
```

只有一个 oauth2-proxy 实例。它只负责认证；email 白名单在容器内的 token helper 中
检查。`/apps/*` 和 `/p/*` 不经过它。

这意味着：

- DSH 不会被未授权用户打开；
- 你暴露的服务默认对任何能访问 8080 的人开放；
- 服务需要登录/token/API key 时，必须在服务内部实现；
- 不要依赖 `/p/` 或 `/apps/` 提供隐式安全。

## 容器边界

- 容器是沙箱边界。DSH 以 `dev` 运行，`DSH_PERMISSION_MODE=danger-full-access`，
  agent 在容器内有完整文件/终端权限。
- `dev` 可以读取容器环境变量，包括 OIDC client secret；也可以读取
  `/home/dev/.dsh` 中用户配置的模型 API key。
- 如果需要更严格的隔离，把 secret 放到外部 secret manager，并定期轮换。
- 不要让 `dev` 获得宿主机 Docker socket 或特权容器能力。

## 密钥

| 密钥 | 存放 |
| --- | --- |
| OIDC client secret | `.env`（`0600`，gitignored） |
| oauth2-proxy cookie secret | `.env`（32 字符） |
| 模型 API key | 用户通过 Settings → Models 写入 `/home/dev/.dsh` |
| DSH session 签名密钥 | `/home/dev/.dsh` |
| CA 私钥 | 不在仓库中 |

`.env` 不提交。构建参数在 Dockerfile ARG 默认值里；仓库只包含
`.env.example`。

## CA 证书

`ca-bundle.crt` 是公开 CA 证书集合（184 张），不包含私钥。提交到内部仓库在技术上
是安全的；它可能包含内部 CA 的名称/主题信息。

如果安全策略不允许内部 CA 信息进入代码库：

- 构建时从外部挂载或注入 `ca-bundle.crt`；
- 或替换为只包含所需根证书的 bundle；
- 不要把任何私钥提交到仓库。

## 端口

浏览器只应看到 `8080`。以下端口永远不应该通过 `/p/` 暴露：

```text
2019  Caddy admin
3080  DSH
3090  token helper
4180  oauth2-proxy
8080  Caddy
```

## 对外暴露服务的建议

- 默认假设 `/apps/*` 和 `/p/*` 是公网可达的。
- 服务内部做认证：session、Bearer、mTLS、应用登录。
- 不要暴露调试端口、数据库管理端口、内部 admin API。
- 用最小权限运行服务；不要用 root。
- 对外 URL 只使用 `http://<host>:8080/apps/<name>/` 或 `/p/<port>/`，不要假设
  有额外域名或 TLS。