import { createSignal, onMount, Show } from 'solid-js'
import { AlertCircle } from './icons'
import { ApiDocument } from './components/ApiDocument'
import { AppHeader } from './components/AppHeader'
import { AuthProvider } from './lib/auth-context'
import { loadSpecDocument, loadSpecFromSwaggerUi } from './lib/load-spec'
import type { LoadedSpec } from './lib/load-spec'
import { readRoute, subscribeRoute, writeRoute } from './lib/router'
import type { SpecDefinition } from './lib/spec-definitions'

function normalizeSourceUrl(url: string): string {
  try {
    const parsed = new URL(url.trim())
    parsed.hash = ''
    return parsed.href
  } catch {
    return url.trim()
  }
}

function App() {
  const initialRoute = readRoute()

  const [inputUrl, setInputUrl] = createSignal(initialRoute.url ?? '')
  const [definition, setDefinition] = createSignal<string | null>(initialRoute.definition)
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [loaded, setLoaded] = createSignal<LoadedSpec | null>(null)
  const [definitions, setDefinitions] = createSignal<SpecDefinition[]>([])
  const [expandedOp, setExpandedOp] = createSignal<string | null>(initialRoute.op)
  const [scrollToOp, setScrollToOp] = createSignal<string | null>(initialRoute.op)
  const [tryItOutOp, setTryItOutOp] = createSignal<string | null>(initialRoute.op)

  let loadSeq = 0

  const syncRoute = (url: string, op: string | null, nextDefinition: string | null) => {
    writeRoute({ url, op, definition: nextDefinition })
  }

  const definitionForRoute = (name: string | null, defs: SpecDefinition[]) =>
    defs.length > 1 && name ? name : null

  const switchDefinition = async (name: string) => {
    const current = loaded()
    const defs = definitions().length ? definitions() : current?.definitions ?? []
    const target = defs.find((item) => item.name === name)
    if (!current || !target) return
    if (definition() === name && current.specUrl === target.url) return

    const seq = ++loadSeq
    setDefinition(name)
    setLoading(true)
    setError(null)
    setExpandedOp(null)
    setScrollToOp(null)
    setTryItOutOp(null)

    try {
      const spec = await loadSpecDocument(target.url)
      if (seq !== loadSeq) return

      setLoaded({
        ...current,
        spec,
        specUrl: target.url,
        selectedDefinition: name,
        definitions: defs,
      })
      syncRoute(inputUrl(), null, definitionForRoute(name, defs))
    } catch (err) {
      if (seq !== loadSeq) return
      setError(err instanceof Error ? err.message : 'Failed to load definition')
    } finally {
      if (seq === loadSeq) {
        setLoading(false)
      }
    }
  }

  const handleLoad = async (
    url: string,
    op: string | null = null,
    nextDefinition: string | null | undefined = undefined,
  ) => {
    const trimmed = normalizeSourceUrl(url)
    const sameSource = normalizeSourceUrl(loaded()?.sourceUrl ?? '') === trimmed
    const activeDefinition =
      nextDefinition !== undefined
        ? nextDefinition
        : sameSource
          ? definition() ?? loaded()?.selectedDefinition ?? null
          : null

    if (sameSource && activeDefinition && loaded() && definitions().length > 1) {
      await switchDefinition(activeDefinition)
      return
    }

    const seq = ++loadSeq

    setLoading(true)
    setError(null)
    if (!sameSource) {
      setLoaded(null)
      setDefinitions([])
      if (activeDefinition) {
        setDefinition(activeDefinition)
      } else {
        setDefinition(null)
      }
    } else if (activeDefinition) {
      setDefinition(activeDefinition)
    }

    setExpandedOp(op)
    setScrollToOp(op)
    setTryItOutOp(op)
    setInputUrl(trimmed)

    try {
      const result = await loadSpecFromSwaggerUi(trimmed, activeDefinition)
      if (seq !== loadSeq) return

      setLoaded(result)
      setDefinitions(result.definitions)
      setDefinition(result.selectedDefinition)
      syncRoute(trimmed, op, definitionForRoute(result.selectedDefinition, result.definitions))
    } catch (err) {
      if (seq !== loadSeq) return
      setError(err instanceof Error ? err.message : 'Failed to load spec')
      syncRoute(
        trimmed,
        op,
        activeDefinition && definitions().length > 1 ? activeDefinition : null,
      )
    } finally {
      if (seq === loadSeq) {
        setLoading(false)
      }
    }
  }

  const handleDefinitionChange = (name: string) => {
    void switchDefinition(name)
  }

  const handleExpandedOpChange = (op: string | null) => {
    setExpandedOp(op)
    setTryItOutOp(null)
    syncRoute(inputUrl(), op, definitionForRoute(definition(), definitions()))
  }

  onMount(() => {
    const route = readRoute()
    if (route.url) {
      void handleLoad(route.url, route.op, route.definition)
    }

    return subscribeRoute((next) => {
      const definitionChanged = next.definition !== definition()
      const urlChanged = normalizeSourceUrl(next.url ?? '') !== normalizeSourceUrl(inputUrl())

      if (urlChanged) {
        if (next.url) {
          void handleLoad(next.url, next.op, next.definition)
        }
        return
      }

      if (definitionChanged && next.definition) {
        void switchDefinition(next.definition)
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
          specLoaded={!!loaded()}
          definitions={definitions()}
          selectedDefinition={definition()}
          onUrlChange={setInputUrl}
          onLoad={(url) => void handleLoad(url, null, null)}
          onDefinitionChange={handleDefinitionChange}
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
