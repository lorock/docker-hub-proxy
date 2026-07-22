/**
 * Cloudflare Worker - Docker Hub Pull-through Proxy
 *
 * 将 Docker 客户端请求反代到 Docker Hub：
 *   - /token  -> auth.docker.io （认证）
 *   - 其他    -> registry-1.docker.io （元数据与 blob）
 *
 * 关键点：
 *   1. 改写 Www-Authenticate，把 auth.docker.io 换成自己的域名
 *   2. 自行 follow blob 的 307 重定向（production.cloudflare.docker.com 在国内被墙）
 */

const HUB_HOST = 'registry-1.docker.io'
const AUTH_URL = 'https://auth.docker.io'

// 你的自定义域名（也可在 wrangler.toml 的 [vars] 里配置 WORKERS_URL 覆盖）
const DEFAULT_WORKERS_URL = 'https://docker.cd.run'

const PREFLIGHT_INIT = {
    status: 204,
    headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,TRACE,DELETE,HEAD,OPTIONS',
        'access-control-max-age': '1728000',
    },
}

export default {
    async fetch(request, env, ctx) {
        const workers_url = env.WORKERS_URL || DEFAULT_WORKERS_URL
        const url = new URL(request.url)

        // CORS 预检
        if (request.method === 'OPTIONS') {
            return new Response(null, PREFLIGHT_INIT)
        }

        // ---- /token：转发到 auth.docker.io ----
        if (url.pathname === '/token') {
            const target = AUTH_URL + url.pathname + url.search
            const headers = buildHeaders(request, 'auth.docker.io')
            const init = {
                method: request.method,
                headers,
                body: request.body,
                redirect: 'follow',
            }
            return fetch(new Request(target, init))
        }

        // ---- 其余请求：转发到 registry-1.docker.io ----
        url.hostname = HUB_HOST
        const headers = buildHeaders(request, HUB_HOST)
        const init = {
            method: request.method,
            headers,
            body: request.body,
            redirect: 'manual', // 手动处理 307，避免客户端直连被墙的 blob 域名
        }

        const response = await fetch(new Request(url.toString(), init))
        const newHeaders = new Headers(response.headers)

        // 改写 Www-Authenticate，让客户端向我们的 /token 请求认证
        const wwwAuth = response.headers.get('Www-Authenticate')
        if (wwwAuth) {
            newHeaders.set(
                'Www-Authenticate',
                wwwAuth.replace(/https:\/\/auth\.docker\.io/g, workers_url)
            )
        }

        // 处理 blob 的 3xx 重定向：Worker 自己拉取再回传给客户端
        const location = response.headers.get('Location')
        const status = response.status
        if (location && [301, 302, 307, 308].includes(status)) {
            const blobResp = await fetch(location, {
                method: request.method,
                headers: { 'User-Agent': request.headers.get('User-Agent') || 'docker/24.0' },
                redirect: 'follow',
            })
            const blobHeaders = new Headers(blobResp.headers)
            blobHeaders.set('access-control-allow-origin', '*')
            blobHeaders.set('access-control-expose-headers', '*')
            return new Response(blobResp.body, {
                status: blobResp.status,
                headers: blobHeaders,
            })
        }

        // 常规响应：补 CORS 头
        newHeaders.set('access-control-allow-origin', '*')
        newHeaders.set('access-control-expose-headers', '*')

        return new Response(response.body, {
            status: response.status,
            headers: newHeaders,
        })
    },
}

/**
 * 构造转发请求头：保留必要的客户端头，覆盖 Host
 */
function buildHeaders(request, host) {
    const headers = new Headers()
    const copy = [
        'user-agent', 'accept', 'accept-language', 'accept-encoding',
        'authorization', 'cache-control', 'content-type',
    ]
    for (const key of copy) {
        const val = request.headers.get(key)
        if (val) headers.set(key, val)
    }
    headers.set('Host', host)
    headers.set('Connection', 'keep-alive')
    return headers
}