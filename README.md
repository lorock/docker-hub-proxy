# Docker Hub Proxy (Cloudflare Worker)

用 Cloudflare Worker 反代 Docker Hub，解决国内拉镜像慢/被墙的问题。

## 功能

- 反代 Docker Hub 官方镜像与私有镜像
- 自动处理 token 认证与 blob 重定向
- 零服务器成本（Cloudflare 免费额度足够个人/小团队）
- **支持全局认证**：配置 Docker Hub 账号后，所有未认证请求自动使用全局认证，解决未认证拉取速率限制
- **支持私有化**：配置代理访问认证后，只有授权用户才能使用，避免公开代理被滥用封号
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

配置 Docker 守护进程或直接使用镜像地址：

```bash
# 使用代理拉取镜像
docker pull docker.cd.run/library/nginx:latest

# 配置 Docker 守护进程使用代理（推荐）
# 在 /etc/docker/daemon.json 中添加：
# {
#   "registry-mirrors": ["https://docker.cd.run"]
# }
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

> **注意**：如果客户端已经提供了自己的认证信息（通过 `docker login`），代理会优先使用客户端的认证，全局认证仅作为兜底。

## 私有化代理（防止滥用封号）

公开代理容易被他人滥用导致 Cloudflare 账号被封。配置代理访问认证后，只有授权用户才能使用。

### 配置步骤

1. 在 Cloudflare Dashboard 中配置 Worker Secrets：
   - 进入 Workers → 选择你的 Worker → Settings → Variables → Secrets
   - 添加以下两个 secrets：
     - `PROXY_USERNAME`: 代理访问用户名（自定义，如 `admin`）
     - `PROXY_PASSWORD`: 代理访问密码（建议使用强密码）

2. 重新部署 Worker

### 客户端使用

启用私有化后，客户端需要先登录才能使用代理：

```bash
# 登录代理（输入上面配置的用户名和密码）
docker login docker.cd.run

# 登录后即可正常拉取镜像
docker pull docker.cd.run/library/nginx:latest
```

> **注意**：启用代理认证后，不能再将代理配置为 `registry-mirrors`（Docker daemon 的 mirror 不支持认证）。请改用完整镜像地址方式拉取。

## 原理

- `/token` 请求 → 转发到 `auth.docker.io`（认证）
- 其他请求 → 转发到 `registry-1.docker.io`（元数据与 blob）
- 改写 `Www-Authenticate` 响应头，将认证地址替换为代理域名
- 自动处理 blob 的 307 重定向，避免客户端直连被墙的域名
- 未认证请求自动使用全局认证，解决速率限制问题
- 代理访问认证（Basic Auth），区分代理认证与 Docker Hub 认证，防止公开代理被滥用
