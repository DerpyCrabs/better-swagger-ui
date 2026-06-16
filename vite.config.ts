import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'

function targetFromProxyPath(path: string): URL | null {
  try {
    const target = new URL(path, 'http://localhost').searchParams.get('url')
    if (!target) return null
    const url = new URL(target)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url
  } catch {
    return null
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [solid(), tailwindcss()],
  server:
    mode === 'proxy'
      ? {
          proxy: {
            '/__proxy': {
              target: 'http://localhost',
              changeOrigin: true,
              secure: false,
              configure(proxy, options) {
                options.rewrite = (path) => {
                  const url = targetFromProxyPath(path)
                  if (!url) return path
                  options.target = url.origin
                  return url.pathname + url.search
                }
                proxy.on('proxyReq', (proxyReq) => {
                  proxyReq.removeHeader('cookie')
                })
              },
            },
          },
        }
      : undefined,
}))
