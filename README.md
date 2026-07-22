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

## 原理

- `/token` 请求 → 转发到 `auth.docker.io`（认证）
- 其他请求 → 转发到 `registry-1.docker.io`（元数据与 blob）
- 改写 `Www-Authenticate` 响应头，将认证地址替换为代理域名
- 自动处理 blob 的 307 重定向，避免客户端直连被墙的域名
- 官方镜像自动补全 `library/` 前缀（如 `nginx` → `library/nginx`）
- IP 白名单通过 `CF-Connecting-IP` 头校验客户端真实 IP
