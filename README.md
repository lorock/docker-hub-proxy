# Docker Hub Proxy (Cloudflare Worker)

用 Cloudflare Worker 反代 Docker Hub，解决国内拉镜像慢/被墙的问题。

## 功能

- 反代 Docker Hub 官方镜像与私有镜像
- 自动处理 token 认证与 blob 重定向
- 零服务器成本（Cloudflare 免费额度足够个人/小团队）
- **支持全局认证**：配置 Docker Hub 账号后，所有未认证请求自动使用全局认证，解决未认证拉取速率限制
- **支持 IP 白名单**：配置白名单后，只有指定 IP 才能使用，避免公开代理被滥用封号
- **自动补全 library/ 前缀**：`docker pull docker.cd.run/nginx` 自动识别为官方镜像
- **Token 缓存**：减少重复认证请求，提升性能

## 部署

### 方式一：Wrangler 本地部署

1. 修改 `src/index.js` 顶部的 `DEFAULT_WORKERS_URL` 为你的域名
2. 修改 `wrangler.toml` 里的 `pattern` 为你的域名
3. 安装并登录：

```bash
npm install
npx wrangler login
```

4. 部署：

```bash
npm run deploy
```

### 方式二：GitHub Actions 自动部署

1. **Fork 本仓库**到你的 GitHub 账号

2. **配置 Cloudflare 密钥**：在仓库的 Settings → Secrets and variables → Actions 中添加以下两个 secrets：
   - `CLOUDFLARE_API_TOKEN`: Cloudflare API Token（需包含 Workers 权限）
   - `CLOUDFLARE_ACCOUNT_ID`: Cloudflare Account ID

3. **修改配置**：
   - 修改 `src/index.js` 中的 `DEFAULT_WORKERS_URL` 为你的域名
   - 修改 `wrangler.toml` 中的 `pattern` 为你的域名

4. **推送代码**：将修改推送到 `main` 分支，GitHub Actions 会自动触发部署

## 使用

```bash
# 直接使用代理地址拉取镜像（推荐）
docker pull docker.cd.run/nginx:latest

# 也可以带 library/ 前缀
docker pull docker.cd.run/library/nginx:latest

# 拉取用户镜像
docker pull docker.cd.run/myuser/myimage:latest

# 拉取后可重命名为短名方便使用
docker tag docker.cd.run/nginx:latest nginx:latest
```

## 全局认证（解决拉取速率限制）

Docker Hub 对未认证用户有严格的拉取速率限制（每 6 小时 100 次），配置全局认证后可提升至每 6 小时 200 次。

### 配置步骤

1. 在 [Docker Hub](https://hub.docker.com/settings/security) 创建一个 **Personal Access Token**（推荐使用令牌而非密码）

2. 在 Cloudflare Dashboard 中配置 Worker Secrets：
   - 进入 Workers → 选择你的 Worker → Settings → Variables → Secrets
   - 添加以下两个 secrets：
     - `DOCKER_HUB_USERNAME`: Docker Hub 用户名
     - `DOCKER_HUB_TOKEN`: 上面创建的个人访问令牌

3. 重新部署 Worker

## IP 白名单（防止滥用封号）

公开代理容易被他人滥用导致 Cloudflare 账号被封。配置 IP 白名单后，只有指定 IP 才能使用代理。

### 配置步骤

1. 在 Cloudflare Dashboard 中配置 Worker Secret：
   - 进入 Workers → 选择你的 Worker → Settings → Variables → Secrets
   - 添加 secret：
     - `ALLOWED_IPS`: 允许访问的 IP 列表，逗号分隔（如 `1.2.3.4,5.6.7.8`）

2. 重新部署 Worker

### 查看你的 IP

```bash
curl -s https://ifconfig.me
```

### 特点

- 对 Docker 客户端完全透明，不需要 `docker login`
- 不影响 `docker pull` 的 Bearer token 认证流程
- 未配置 `ALLOWED_IPS` 时为公开模式，所有 IP 可访问

## 配置 Registry Mirror（推荐）

配置后 `docker pull debian` 自动走代理，不需要每次加前缀：

### macOS (Docker Desktop)

Docker Desktop → Settings → Docker Engine → 添加：

```json
{
    "registry-mirrors": ["https://docker.cd.run"]
}
```

Apply & restart 后生效。

### Linux

```bash
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json <<'EOF'
{
    "registry-mirrors": ["https://docker.cd.run"]
}
EOF
sudo systemctl daemon-reload
sudo systemctl restart docker
```

## 常见问题 & 踩坑记录

### 1. 为什么不用 Basic Auth 做代理认证？

Docker 客户端的 `docker pull` 流程与 Basic Auth 冲突：客户端先请求 `/v2/` 拿到 Bearer challenge，再去 `/token` 获取 token。如果代理要求 Basic Auth，会与 Docker Hub 的 Bearer 认证流程冲突，导致 `docker pull` 失败。

**解决方案**：使用 IP 白名单代替 Basic Auth，对 Docker 完全透明。

### 2. 官方镜像 `library/` 前缀问题

Docker Hub 官方镜像（如 `nginx`、`debian`）实际仓库名是 `library/nginx`、`library/debian`。当用简写 `docker pull docker.cd.run/nginx` 时，代理需要在两处同时重写：

- 请求路径：`/v2/nginx/...` → `/v2/library/nginx/...`
- Token scope：`repository:nginx:pull` → `repository:library/nginx:pull`

只改一处会导致 token 权限不匹配，报 `denied: requested access to the resource is denied`。

### 3. IP 白名单只配置了 IPv4，IPv6 访问被拒

如果你的网络支持 IPv6，Docker 可能优先用 IPv6 连接代理。需要把 IPv6 地址也加入白名单，或者在 Cloudflare 中关闭 IPv6：

Cloudflare Dashboard → 域名 → Network → IPv6 → 关闭

查看你的 IP：
```bash
curl -s -4 https://ifconfig.me   # IPv4
curl -s -6 https://ifconfig.me   # IPv6
```

### 4. wrangler 4.x 需要 Node.js 22+

wrangler 3.x 最高支持 compatibility_date 到 2025 年左右，升级到 wrangler 4.x 后需要 Node.js 22 或更高版本。GitHub Actions 中要把 `node-version` 设为 `'22'`。

### 5. GitHub Actions 的 Environment Secrets

如果把 secrets 配置在 Environment（环境）中，工作流必须声明 `environment: <环境名>` 才能访问这些 secrets，否则会报缺少 `CLOUDFLARE_API_TOKEN` 的错误。

### 6. `npm ci` vs `npm install`

GitHub Actions 中推荐用 `npm ci` 而非 `npm install`，因为 `npm ci` 严格按照 `package-lock.json` 安装，确保构建可复现。前提是 `package-lock.json` 要提交到仓库。

## 原理

- `/token` 请求 → 转发到 `auth.docker.io`（认证）
- 其他请求 → 转发到 `registry-1.docker.io`（元数据与 blob）
- 改写 `Www-Authenticate` 响应头，将认证地址替换为代理域名
- 自动处理 blob 的 307 重定向，避免客户端直连被墙的域名
- 官方镜像自动补全 `library/` 前缀（路径和 scope 两处都重写）
- IP 白名单通过 `CF-Connecting-IP` 头校验客户端真实 IP
- 支持全局 Docker Hub 认证，提升未认证用户的拉取速率限制
