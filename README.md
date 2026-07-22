# Docker Hub Proxy (Cloudflare Worker)

用 Cloudflare Worker 反代 Docker Hub，解决国内拉镜像慢/被墙的问题。

## 功能

- 反代 Docker Hub 官方镜像与私有镜像
- 自动处理 token 认证与 blob 重定向
- 零服务器成本（Cloudflare 免费额度足够个人/小团队）

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

## 原理

- `/token` 请求 → 转发到 `auth.docker.io`（认证）
- 其他请求 → 转发到 `registry-1.docker.io`（元数据与 blob）
- 改写 `Www-Authenticate` 响应头，将认证地址替换为代理域名
- 自动处理 blob 的 307 重定向，避免客户端直连被墙的域名
