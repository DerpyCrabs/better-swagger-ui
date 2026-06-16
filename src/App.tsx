import { createSignal, onMount, Show } from 'solid-js'
import { AlertCircle } from './icons'
import { ApiDocument } from './components/ApiDocument'
import { AppHeader } from './components/AppHeader'
import { AuthProvider } from './lib/auth-context'
import { loadSpecFromSwaggerUi } from './lib/load-spec'
import type { LoadedSpec } from './lib/load-spec'
import { readRoute, subscribeRoute, writeRoute } from './lib/router'

function App() {
  const initialRoute = readRoute()

  const [inputUrl, setInputUrl] = createSignal(initialRoute.url ?? '')
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [loaded, setLoaded] = createSignal<LoadedSpec | null>(null)
  const [expandedOp, setExpandedOp] = createSignal<string | null>(initialRoute.op)
  const [scrollToOp, setScrollToOp] = createSignal<string | null>(initialRoute.op)
  const [tryItOutOp, setTryItOutOp] = createSignal<string | null>(initialRoute.op)

  const syncRoute = (url: string, op: string | null) => {
    writeRoute({ url, op })
  }

  const handleLoad = async (url: string, op: string | null = null) => {
    const trimmed = url.trim()
    setLoading(true)
    setError(null)
    setLoaded(null)
    setExpandedOp(op)
    setScrollToOp(op)
    setTryItOutOp(op)
    setInputUrl(trimmed)
    syncRoute(trimmed, op)

    try {
      const result = await loadSpecFromSwaggerUi(trimmed)
      setLoaded(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load spec')
    } finally {
      setLoading(false)
    }
  }

  const handleExpandedOpChange = (op: string | null) => {
    setExpandedOp(op)
    setTryItOutOp(null)
    syncRoute(inputUrl(), op)
  }

  onMount(() => {
    const route = readRoute()
    if (route.url) {
      void handleLoad(route.url, route.op)
    }

    return subscribeRoute((next) => {
      if (next.url !== inputUrl()) {
        if (next.url) {
          void handleLoad(next.url, next.op)
        }
        return
      }

      setExpandedOp(next.op)
      setScrollToOp(next.op)
      setTryItOutOp(next.op)
    })
  })

  return (
    <AuthProvider loaded={loaded}>
      <div class="min-h-screen">
        <AppHeader
          url={inputUrl()}
          loading={loading()}
          specLoaded={!!loaded()}
          onUrlChange={setInputUrl}
          onLoad={(url) => void handleLoad(url, null)}
        />

        <Show when={error()}>
          <div class="mx-auto flex max-w-5xl items-start gap-2 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
            <AlertCircle size={16} class="mt-0.5 shrink-0" />
            <p>{error()}</p>
          </div>
        </Show>

        <Show when={loaded()}>
          {(spec) => (
            <main class="mx-auto max-w-5xl px-4 py-4">
              <ApiDocument
                loaded={spec()}
                expandedOp={expandedOp()}
                scrollToOp={scrollToOp()}
                tryItOutOp={tryItOutOp()}
                onTryItOutDismiss={() => setTryItOutOp(null)}
                onScrollToOpDone={() => setScrollToOp(null)}
                onExpandedOpChange={handleExpandedOpChange}
              />
            </main>
          )}
        </Show>

        <Show when={!loaded() && !loading() && !error()}>
          <p class="px-4 py-10 text-center text-sm text-zinc-500">
            Paste a Swagger UI URL above to get started.
          </p>
        </Show>
      </div>
    </AuthProvider>
  )
}

export default App
