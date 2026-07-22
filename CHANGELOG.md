# Changelog

## [1.0.1] - 2026-07-22

### Updated

- 更新 wrangler 版本从 ^3.0.0 到 ^4.113.0
- 修正 `wrangler.toml` 中 `compatibility_date` 从 2026-07-22 改为 2025-07-22

### Fixed

- 为 `/token` 认证端点添加 try-catch 错误处理，网络失败时返回 503
- 为 registry 代理请求添加 try-catch 错误处理，网络失败时返回 503  
- 为 blob 重定向 fetch 添加 try-catch 错误处理，网络失败时返回 503
