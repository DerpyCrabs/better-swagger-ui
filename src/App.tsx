import { createEffect, createMemo, createSignal, onMount, Show } from 'solid-js'
import { AlertCircle, LoaderCircle } from './icons'
import { ApiDocument } from './components/ApiDocument'
import { AppHeader } from './components/AppHeader'
import { AuthProvider } from './lib/auth-context'
import { readRoute, subscribeRoute, writeRoute } from './lib/router'
import type { SpecDefinition } from './lib/spec-definitions'
import { normalizeSourceUrl, type SpecQuerySource } from './lib/spec-query'
import { useSpecQuery } from './lib/use-spec-query'

function domainFromUrl(url: string): string | null {
  try {
    return new URL(url.trim()).hostname
  } catch {
    return null
  }
}

function definitionForRoute(name: string | null, defs: SpecDefinition[]) {
  return defs.length > 1 && name ? name : null
}

function App() {
  const initialRoute = readRoute()
  const [routeRevision, bumpRoute] = createSignal(0)
  const route = createMemo(() => {
    routeRevision()
    return readRoute()
  })

  const [sourceUrl, setSourceUrl] = createSignal<string | null>(
    initialRoute.url ? normalizeSourceUrl(initialRoute.url) : null,
  )
  const [textSource, setTextSource] = createSignal<{ label: string; text: string } | null>(null)
  const [expandedOp, setExpandedOp] = createSignal<string | null>(initialRoute.op)
  const [scrollToOp, setScrollToOp] = createSignal<string | null>(initialRoute.op)
  const [tryItOutOp, setTryItOutOp] = createSignal<string | null>(initialRoute.op)

  const definition = () => route().definition
  const headerUrl = () => sourceUrl() ?? textSource()?.label ?? ''
  const routeUrl = () => sourceUrl() ?? ''

  const specSource = createMemo<SpecQuerySource | null>(() => {
    const text = textSource()
    if (text) return { kind: 'text', label: text.label, text: text.text }

    const url = sourceUrl()
    if (url) return { kind: 'url', sourceUrl: url, definition: definition() }

    return null
  })

  const specQuery = useSpecQuery(specSource)

  const definitions = () => specQuery.data?.definitions ?? []

  const selectedDefinition = () =>
    definition() ?? specQuery.data?.selectedDefinition ?? definitions()[0]?.name ?? ''

  const loaded = createMemo(() => {
    if (!specSource()) return null
    return specQuery.data ?? null
  })

  createEffect(() => {
    document.title = domainFromUrl(headerUrl()) ?? 'Better Swagger UI'
  })

  const syncRoute = (url: string, op: string | null, nextDefinition: string | null) => {
    if (writeRoute({ url, op, definition: nextDefinition })) {
      bumpRoute((value) => value + 1)
    }
  }

  createEffect(() => {
    const data = specQuery.data
    if (!data || textSource() || definition() || specQuery.isFetching) return
    const url = sourceUrl()
    if (!url) return
    syncRoute(url, expandedOp(), definitionForRoute(data.selectedDefinition, data.definitions))
  })

  const handleLoad = (url: string) => {
    const trimmed = normalizeSourceUrl(url)
    const sameSource = trimmed === sourceUrl()
    setTextSource(null)
    setSourceUrl(trimmed)
    setExpandedOp(null)
    setScrollToOp(null)
    setTryItOutOp(null)
    syncRoute(
      trimmed,
      null,
      sameSource ? definitionForRoute(definition(), definitions()) : null,
    )
  }

  const handleLoadContent = (sourceLabel: string, text: string) => {
    setSourceUrl(null)
    setTextSource({ label: sourceLabel, text })
    setExpandedOp(null)
    setScrollToOp(null)
    setTryItOutOp(null)
    syncRoute('', null, null)
  }

  const handleDefinitionChange = (name: string) => {
    setExpandedOp(null)
    setScrollToOp(null)
    setTryItOutOp(null)
    syncRoute(routeUrl(), null, definitionForRoute(name, definitions()))
  }

  const handleExpandedOpChange = (op: string | null) => {
    setExpandedOp(op)
    setTryItOutOp(null)
    syncRoute(routeUrl(), op, definitionForRoute(definition(), definitions()))
  }

  const handleExpandAndTryItOut = (op: string) => {
    setExpandedOp(op)
    setScrollToOp(op)
    setTryItOutOp(op)
    syncRoute(routeUrl(), op, definitionForRoute(definition(), definitions()))
  }

  createEffect(() => {
    const data = specQuery.data
    if (!data || textSource()) return
    const url = sourceUrl()
    if (!url) return
    const nextOp = expandedOp()
    const nextDefinition = definitionForRoute(definition(), data.definitions)
    const current = readRoute()
    const currentUrl = current.url ? normalizeSourceUrl(current.url) : ''
    if (currentUrl === url && current.op === nextOp && current.definition === nextDefinition) return
    syncRoute(url, nextOp, nextDefinition)
  })

  onMount(() => {
    return subscribeRoute((next) => {
      bumpRoute((value) => value + 1)
      const nextUrl = next.url ? normalizeSourceUrl(next.url) : null

      if (nextUrl !== sourceUrl()) {
        if (next.url) {
          const trimmed = normalizeSourceUrl(next.url)
          setTextSource(null)
          setSourceUrl(trimmed)
          setExpandedOp(next.op)
          setScrollToOp(next.op)
          setTryItOutOp(next.op)
        }
        return
      }

      if (next.definition !== definition()) {
        setExpandedOp(null)
        setScrollToOp(null)
        setTryItOutOp(null)
        return
      }

      setExpandedOp(next.op)
      setScrollToOp(next.op)
      setTryItOutOp(next.op)
    })
  })

  const specError = () => {
    const err = specQuery.error
    if (!err) return null
    return err instanceof Error ? err.message : 'Failed to load spec'
  }

  return (
    <AuthProvider loaded={loaded}>
      <div class="min-h-screen">
        <AppHeader
          url={headerUrl()}
          loading={specQuery.isFetching}
          specLoaded={!!specQuery.data}
          definitions={definitions()}
          definition={selectedDefinition()}
          onLoad={handleLoad}
          onLoadContent={handleLoadContent}
          onDefinitionChange={handleDefinitionChange}
        />

        <Show when={specError()}>
          <div class="mx-auto flex max-w-5xl items-start gap-2 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
            <AlertCircle size={16} class="mt-0.5 shrink-0" />
            <p>{specError()}</p>
          </div>
        </Show>

        <Show when={specQuery.data}>
          {(data) => (
            <main class="mx-auto max-w-5xl px-4 py-4">
              <ApiDocument
                loaded={data()}
                expandedOp={expandedOp()}
                scrollToOp={scrollToOp()}
                tryItOutOp={tryItOutOp()}
                onTryItOutDismiss={() => setTryItOutOp(null)}
                onScrollToOpDone={() => setScrollToOp(null)}
                onExpandedOpChange={handleExpandedOpChange}
                onExpandAndTryItOut={handleExpandAndTryItOut}
              />
            </main>
          )}
        </Show>

        <Show when={specQuery.isLoading}>
          <div
            class="flex items-center justify-center gap-2 px-4 py-10 text-sm text-zinc-500 dark:text-dm-muted"
            data-testid="spec-loading-message"
          >
            <LoaderCircle size={16} class="animate-spin shrink-0" />
            <span>Loading spec from URL…</span>
          </div>
        </Show>

        <Show when={!specSource() && !specQuery.isFetching && !specQuery.error}>
          <p class="px-4 py-10 text-center text-sm text-zinc-500">
            Paste a Swagger UI URL, upload an OpenAPI file, or paste YAML/JSON spec content above.
          </p>
        </Show>
      </div>
    </AuthProvider>
  )
}

export default App
