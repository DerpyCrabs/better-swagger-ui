import { createSignal, onMount, Show } from 'solid-js'
import { AlertCircle } from 'lucide-solid'
import { ApiDocument } from './components/ApiDocument'
import { SpecInput } from './components/SpecInput'
import { ThemeToggle } from './components/ThemeToggle'
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
    })
  })

  return (
    <div class="min-h-screen">
      <header class="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
        <div class="mx-auto max-w-5xl space-y-4 px-4 py-5">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h1 class="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                Better Swagger UI
              </h1>
              <p class="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Paste a Swagger UI link — the OpenAPI spec is resolved automatically via dev proxy.
              </p>
            </div>
            <ThemeToggle />
          </div>
          <SpecInput
            url={inputUrl()}
            loading={loading()}
            onUrlChange={setInputUrl}
            onLoad={(url) => void handleLoad(url, null)}
          />
        </div>
      </header>

      <Show when={error()}>
        <div class="mx-auto flex max-w-5xl items-start gap-2 px-4 py-4 text-sm text-rose-700 dark:text-rose-300">
          <AlertCircle size={18} class="mt-0.5 shrink-0" />
          <p>{error()}</p>
        </div>
      </Show>

      <Show when={loaded()}>
        {(spec) => (
          <main class="mx-auto max-w-5xl px-4 py-6">
            <ApiDocument
              loaded={spec()}
              expandedOp={expandedOp()}
              scrollToOp={scrollToOp()}
              onScrollToOpDone={() => setScrollToOp(null)}
              onExpandedOpChange={handleExpandedOpChange}
            />
          </main>
        )}
      </Show>

      <Show when={!loaded() && !loading() && !error()}>
        <p class="px-4 py-10 text-center text-sm text-zinc-500">
          Load a Swagger UI URL to get started.
        </p>
      </Show>
    </div>
  )
}

export default App
