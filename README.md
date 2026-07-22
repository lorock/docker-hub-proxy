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