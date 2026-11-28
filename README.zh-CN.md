# DSH Dock — 极简单容器自进化 AI 工作台

[English Documentation](README.md)

基于 **Caddy + Supervisor + DeepSeek Harness (`dsh web`) + 原生插件体系** 的单容器 AI 工作台：无多租户控制面、无数据库外挂、全部能力（端口转发、Webhook 触发器、自进化、内置 6 大插件、GitHub 插件索引）**开箱默认启用**，大模型直接在 DSH Web 设置界面内配置。

```text
外部访问 (:8080 或填写 SITE_ADDRESS 自动 HTTPS)
  └─ Caddy 2.11（内置统一网关）
       ├─ /hooks/<slug>    ──▶ Webhook 触发器 (:4095) · HMAC-SHA256 / Bearer 验签 · 异步唤醒会话
       ├─ /dsh/*           ──▶ auth_guard（none | basic | forward_auth）+ DSH Web (:3080，免二次登录)
       ├─ /apps/<name>/*   ──▶ 动态发布应用路由（一键切换 `public` 公开或 `caddy` 保护）
       └─ /p/<port>/*      ──▶ auth_guard + 本机回环端口转发
```

## 快速启动

仅需配置公开地址与登录鉴权两件事：

```bash
cp .env.example .env
# 在 .env 修改 CADDY_AUTH_PASSWORD（如需绑定域名或接入 OAuth2 再改对应项）
docker compose up -d --build
```

启动后浏览器打开 `http://localhost:8080/dsh/`，在设置页中填入你的大模型 API 即可开始使用。

### 内置插件（默认全开）

- **应用与服务 (`@dsh-dock/app-gateway`)**：集中查看 Caddy 发布出去的 `/apps/*` 应用并一键切换 **公开访问 / Caddy 登录保护**，同时支持后台 `supervisor` 服务启停、重启与日志查看。
- **Webhook 触发器 (`@dsh-dock/webhook-triggers`)**：配置 `/hooks/<slug>` 外部触发入口，支持 HMAC/Bearer 验签、报文落盘与一键重放。
- **自进化中心 (`@dsh-dock/self-evolve`)**：管理 `~/.dsh/skills/`，自动快照备份、支持测试门禁与一键回滚。
- **长期记忆 (`@dsh-dock/sandbox-memory`)**、**文件管理 (`@dsh-dock/file-manager`)**、**自定义主题 (`@dsh-dock/custom-theme`)**。
