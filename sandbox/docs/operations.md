# 构建与运维

## 环境分层

构建参数在 Dockerfile 的 ARG 默认值里；运行时配置只有一个文件：

| 文件 | 用途 | 是否进入容器 |
| --- | --- | --- |
| `.env` | 容器运行时环境 | 是，`env_file` |
| `.env.example` | 运行时模板 | — |

Compose 只把 `.env` 注入容器；`.dockerignore` 排除了 `.env*`，所以运行时
secret 不会进入构建上下文。

首次准备：

```bash
cp .env.example .env
chmod 600 .env
```

构建参数有内部默认值，通常不需要额外文件；需要覆盖时用 `--build-arg` 或 shell
环境变量。
Compose 的镜像名拆成两项：

```dotenv
DSH_IMAGE_REPO=dsh-sandbox
DSH_IMAGE_TAG=latest
```

`DSH_IMAGE_TAG` 是**镜像 tag**，和构建参数 `DSH_VERSION`（DSH npm 包版本）是两件事。


## 构建

```bash
make build
# 或
docker compose build
```

直接构建使用 Dockerfile 默认值：

```bash
docker build -t dsh-sandbox:latest .
```

覆盖某个参数：

```bash
docker build \
  --build-arg DSH_VERSION=0.2.2-rc.2 \
  --build-arg TARGETARCH=amd64 \
  -t dsh-sandbox:latest .
```

`.env` 只用于运行时 `--env-file`，不要传给 `docker build`（`docker compose build` 会读取 `.env` 中的同名变量作为构建参数）。

常用构建参数：

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `DSH_VERSION` | `0.2.2-rc.2` | `@deepseek-ai/dsh` 版本 |
| `NODE_VERSION` | `24.22.3` | Node 运行时 |
| `INSTALL_DOTNET` | `false` | 是否安装 .NET SDK |
| `DOTNET_VERSION` | `10.0.404` | .NET SDK 精确版本 |
| `DOTNET_SDK_URL` | 空 → Azure CDN | 覆盖 SDK tarball URL，可指向内部 artifact |
| `DEV_UID` / `DEV_GID` | `1000` | dev 用户 UID/GID |
| `DOCKER_REGISTRY` | `docker.io/library` | 基础镜像完整前缀 |
| `APT_MIRROR` | `deb.debian.org` | Debian 镜像源主机名 |
| `NPM_REGISTRY` | 空 → 官方 npm | npm 镜像源 URL |

在内网或国内网络构建时，可在 `.env` 或 `--build-arg` 中覆盖镜像源：

```bash
docker build \
  --build-arg DOCKER_REGISTRY=your-registry.example.com/docker \
  --build-arg APT_MIRROR=https://mirrors.aliyun.com \
  -t dsh-sandbox:latest .
```

Podman 需要保留 `HEALTHCHECK` 时使用：

```bash
podman build --format docker ... -t dsh-sandbox:latest .
```

## 启动

```bash
make up
```

`make up` 会构建、启动并等待健康检查，然后打印启动 URL。其他目标：

```bash
make down
make logs
make token
make shell
make expose NAME=web PORT=5173
```

手动运行：

```bash
docker run -d --name dsh-sandbox -p 18086:8080 \
  --env-file .env \
  -v dsh-sandbox-home:/home/dev \
  dsh-sandbox:latest
```

修改运行时 env 后需要**重建容器**，`restart` 不会重新读取 env。

## 健康检查

```bash
curl -fsS http://127.0.0.1:8080/healthz
```

容器健康检查只依赖 Caddy 的 `/healthz`；DSH 启动失败需要看日志：

```bash
docker compose logs -f
```

## 中文支持

镜像默认：

```text
LANG=C.UTF-8
zh_CN.UTF-8 locale 已生成
fonts-wqy-microhei + fontconfig
```

- 终端/文件/Node/Python 的中文 UTF-8 直接可用；
- 需要中文 locale 的程序可以 `setlocale(LC_ALL, "zh_CN.UTF-8")`；
- 服务端渲染（matplotlib、headless browser 截图、PDF）有 CJK 字体，不再 tofu；
- 默认 `LANG` 仍是 `C.UTF-8`，避免 CLI 日期/日志随 locale 变化。

浏览器里的 DSH UI 和终端本来就使用客户端字体，不依赖容器字体。

## 镜像体积

当前完整镜像约 2.6 GB（压缩后），主要构成：

| 层 | 约 |
| --- | --- |
| apt 工具链 + 开发头文件 | 619 MB |
| DSH/npm 全局依赖 | 833 MB |
| .NET 10 SDK | 681 MB |
| Node.js | 203 MB |
| `Caddy` | ~45 MB |
| uv | 32 MB |

可精简的空间：

- **安全**：去掉 `.NET templates`、文档/man 页，约几十 MB；中文改用 WQY 字体而不是 Noto CJK。
- **中等**：去掉 `build-essential` 和 `-dev` 头文件，约 200–300 MB，但会破坏 node-gyp/pip 原生扩展的现场编译。
- **较大**：维护一个不带 .NET SDK 的 slim 变体，可省约 680 MB；或只装 .NET runtime。
- **不建议**：裁剪 DSH npm 依赖（`@deepseek-ai` 约 622 MB），容易破坏 UI/插件/语音等运行时能力。

完整开发沙箱建议保留当前 full 镜像；只需要 Node/Python 的场景可以另出 slim 变体。

## 持久化与 UID

```yaml
volumes:
  - dsh-home:/home/dev
```

包含 workspace、DSH profile/session、模型配置、skill、apps.d 路由和日志。删除容器不会
删除 volume；`docker compose down -v` 才会。

bind mount 时保证 UID/GID 1000 可写：

```bash
sudo chown -R 1000:1000 ./home
```

或者用 `DEV_UID` / `DEV_GID` 重新构建。

## 升级

1. 修改 `DSH_VERSION` 或基础镜像版本；
2. `make build`；
3. 重新创建容器，保留 home volume。

DSH cookie 的签名密钥在 `/home/dev/.dsh` 中，升级后旧浏览器 cookie 仍然有效；启动 token
是进程级的，会随 DSH 重启变化。

## CA

`ca-bundle.crt` 会在构建时安装到系统信任库，并在每次启动时刷新。它包含公开 CA 证书，
不含私钥。替换为企业自己的 bundle 后重新构建即可。

## 镜像大小

完整工具链约 2.5–3 GB。基础镜像层和 npm/pip 缓存会复用；多用户场景建议使用内部
registry，并在宿主机预拉取。