import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sirv from 'sirv'
import { defineConfig } from 'vite-plus'
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
    configureServer(server: {
      middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void }
    }) {
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

function targetFromProxyPath(proxyPath: string): URL | null {
  try {
    const target = new URL(proxyPath, 'http://localhost').searchParams.get('url')
    if (!target) return null
    const url = new URL(target)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url
  } catch {
    return null
  }
}

export default defineConfig(({ mode }) => ({
  staged: {
    '*': 'vp check --fix',
  },
  fmt: {
    ignorePatterns: ['dist/**', 'coverage/**', 'test-results/**', 'tests/fixtures/**', 'tmp-*.ts'],
    singleQuote: true,
    jsxSingleQuote: false,
    semi: false,
    sortPackageJson: false,
  },
  lint: {
    ignorePatterns: ['dist/**', 'coverage/**', 'test-results/**', 'tests/fixtures/**', 'tmp-*.ts'],
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    rules: {
      'vite-plus/prefer-vite-plus-imports': 'error',
      // Solid assigns refs via JSX transform; tracking reads are intentional.
      'no-unassigned-vars': 'off',
      'no-unused-expressions': 'off',
      'no-control-regex': 'off',
      'typescript/no-redundant-type-constituents': 'off',
      'typescript/no-base-to-string': 'off',
      'typescript/restrict-template-expressions': 'off',
    },
    options: { typeAware: true, typeCheck: true },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/**/*-context.tsx'],
    },
  },
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
                options.rewrite = (proxyPath) => {
                  const url = targetFromProxyPath(proxyPath)
                  if (!url) return proxyPath
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
