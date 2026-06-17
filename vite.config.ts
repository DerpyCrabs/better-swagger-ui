import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sirv from 'sirv'
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'

const fixturesRoot = path.join(fileURLToPath(new URL('.', import.meta.url)), 'tests/fixtures')

function serveTestFixtures() {
  const serve = sirv(fixturesRoot, {
    dev: true,
    setHeaders(res) {
      res.setHeader('Access-Control-Allow-Origin', '*')
    },
  })

  return {
    name: 'serve-test-fixtures',
    configureServer(server: { middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/v3/api-docs')) {
          req.url = `/fixtures${req.url}`
        }
        if (!req.url?.startsWith('/fixtures')) return next()
        req.url = req.url.slice('/fixtures'.length) || '/'
        serve(req, res, next)
      })
    },
  }
}

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
  plugins: [solid(), tailwindcss(), serveTestFixtures()],
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
