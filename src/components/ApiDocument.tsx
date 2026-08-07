import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import { ChevronDown, ChevronUp, Search, X } from '../icons'
import type { LoadedSpec } from '../lib/load-spec'
import {
  collectOperations,
  findOperationTag,
  operationExists,
  tagDescriptions,
  type OperationItem,
} from '../lib/operations'
import {
  buildOperationSearchIndex,
  filterOperationGroups,
  isActiveOperationSearch,
} from '../lib/operation-search'
import {
  scrollToOperationHeader,
  operationHeaderElement,
  scheduleOperationHeaderViewportRestore,
  runPendingOperationHeaderViewportRestore,
} from '../lib/operation-scroll'
import { MarkdownText } from './MarkdownText'
import { OperationBlock } from './OperationBlock'
import { SpecSchemaActions } from './SpecSchemaActions'

const SEARCH_DEBOUNCE_MS = 250

interface ApiDocumentProps {
  loaded: LoadedSpec
  expandedOp: string | null
  /** Operation id from the initial ?op= query param; scroll to it once after first render. */
  initialOp: string | null
  onExpandedOpChange: (op: string | null) => void
}

export function ApiDocument(props: ApiDocumentProps) {
  const [openTags, setOpenTags] = createSignal<Set<string>>(new Set())
  const [searchInput, setSearchInput] = createSignal('')
  const [debouncedQuery, setDebouncedQuery] = createSignal('')
  let initialOpScrolled = false

  const grouped = createMemo(() => collectOperations(props.loaded.spec))
  const descriptions = createMemo(() => tagDescriptions(props.loaded.spec))
  const searchIndex = createMemo(() => buildOperationSearchIndex(grouped(), descriptions()))
  const serverUrl = () => props.loaded.spec.servers?.[0]?.url ?? ''

  createEffect(() => {
    const value = searchInput()
    // Short / empty input clears filtering immediately; longer queries debounce.
    if (!isActiveOperationSearch(value)) {
      setDebouncedQuery(value)
      return
    }
    const timer = window.setTimeout(() => setDebouncedQuery(value), SEARCH_DEBOUNCE_MS)
    onCleanup(() => window.clearTimeout(timer))
  })

  const isSearching = () => isActiveOperationSearch(debouncedQuery())

  const filteredGroups = createMemo(() => filterOperationGroups(searchIndex(), debouncedQuery()))

  createEffect(() => {
    const op = props.expandedOp
    if (!op) return

    const tag = findOperationTag(grouped(), op)
    if (tag) {
      setOpenTags((current) => new Set([...current, tag]))
    }
  })

  createEffect(() => {
    const op = props.initialOp
    if (!op || initialOpScrolled || props.expandedOp !== op) return

    props.loaded.specUrl
    const groups = grouped()

    if (!operationExists(groups, op)) {
      initialOpScrolled = true
      return
    }

    const tag = findOperationTag(groups, op)
    if (!tag || !openTags().has(tag)) return

    initialOpScrolled = true
    requestAnimationFrame(() => scrollToOperationHeader(op))
  })

  createEffect(() => {
    props.expandedOp
    props.loaded.specUrl
    openTags()

    runPendingOperationHeaderViewportRestore()
  })

  const clearSearch = () => {
    setSearchInput('')
    setDebouncedQuery('')
  }

  const toggleTag = (tag: string) => {
    if (isSearching()) return
    setOpenTags((current) => {
      const next = new Set(current)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  const toggleOperation = (item: OperationItem) => {
    const next = props.expandedOp === item.id ? null : item.id
    const anchorOpId = next ?? item.id
    const anchorTop = operationHeaderElement(anchorOpId)?.getBoundingClientRect().top ?? null

    if (anchorTop !== null) {
      scheduleOperationHeaderViewportRestore(anchorOpId, anchorTop)
    }

    props.onExpandedOpChange(next)

    if (next) {
      const tag = findOperationTag(grouped(), next)
      if (tag) {
        setOpenTags((current) => new Set([...current, tag]))
      }
    }
  }

  return (
    <div>
      <section class="mb-6 border-b border-zinc-200 pb-6 dark:border-dm-border">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <h2
              class="text-2xl font-semibold text-zinc-900 dark:text-dm-text"
              data-testid="api-title"
            >
              {props.loaded.spec.info.title}
            </h2>
            <Show when={props.loaded.spec.info.version}>
              <p class="mt-1 text-sm text-zinc-500 dark:text-dm-muted">
                v{props.loaded.spec.info.version}
              </p>
            </Show>
          </div>
          <SpecSchemaActions spec={props.loaded.spec} specUrl={props.loaded.specUrl} />
        </div>
        <Show when={props.loaded.spec.info.description}>
          <div class="mt-4 text-sm">
            <MarkdownText content={props.loaded.spec.info.description} />
          </div>
        </Show>
        <Show when={props.loaded.spec.servers?.[0]?.url}>
          <p class="mt-3 font-mono text-sm text-zinc-500 dark:text-dm-muted">
            {props.loaded.spec.servers![0].url}
          </p>
        </Show>
      </section>

      <div class="mb-3" data-testid="operations-search-bar">
        <div class="flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-dm-border dark:bg-dm-input">
          <Search size={16} class="shrink-0 text-zinc-400 dark:text-dm-muted" />
          <input
            type="search"
            data-testid="operations-search-input"
            class="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-dm-text dark:placeholder:text-dm-muted"
            placeholder="Search groups and requests (e.g. get /users)"
            aria-label="Search groups and requests"
            value={searchInput()}
            onInput={(event) => setSearchInput(event.currentTarget.value)}
          />
          <Show when={searchInput().length > 0}>
            <button
              type="button"
              data-testid="operations-search-clear"
              class="shrink-0 rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-dm-surface-hover dark:hover:text-dm-text"
              aria-label="Clear search"
              onClick={clearSearch}
            >
              <X size={14} />
            </button>
          </Show>
        </div>
      </div>

      <div>
        <Show
          when={!isSearching() || filteredGroups().length > 0}
          fallback={
            <p
              class="px-2 py-6 text-center text-sm text-zinc-500 dark:text-dm-muted"
              data-testid="operations-search-empty"
            >
              No groups or requests match “{debouncedQuery().trim()}”.
            </p>
          }
        >
          <For each={filteredGroups()}>
            {(group) => {
              const isOpen = () => isSearching() || openTags().has(group.tag)

              return (
                <section
                  class="border-b border-zinc-200 dark:border-dm-border"
                  data-testid={`tag-section-${group.tag}`}
                >
                  <button
                    type="button"
                    class="flex w-full items-center gap-3 px-2 py-3 text-left hover:bg-zinc-50 dark:bg-dm-surface dark:hover:bg-dm-surface-hover"
                    onClick={() => toggleTag(group.tag)}
                  >
                    <span class="text-lg font-medium text-zinc-900 dark:text-dm-text">
                      {group.tag}
                    </span>
                    <Show when={group.description}>
                      <span class="flex-1 truncate text-sm text-zinc-500 dark:text-dm-muted">
                        {group.description}
                      </span>
                    </Show>
                    <Show when={isSearching()}>
                      <span class="shrink-0 text-xs text-zinc-400 dark:text-dm-muted">
                        {group.operations.length}
                      </span>
                    </Show>
                    <span class="ml-auto shrink-0 text-zinc-400 dark:text-dm-muted">
                      {isOpen() ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </span>
                  </button>

                  <Show when={isOpen()}>
                    <div class="space-y-0 border-t border-zinc-200 p-2 [overflow-anchor:none] dark:border-t-dm-border">
                      <For each={group.operations}>
                        {(item) => (
                          <OperationBlock
                            item={item}
                            spec={props.loaded.spec}
                            serverUrl={serverUrl()}
                            specUrl={props.loaded.specUrl}
                            expanded={props.expandedOp === item.id}
                            onAuthorizeFromLock={() => props.onExpandedOpChange(item.id)}
                            onToggle={() => toggleOperation(item)}
                          />
                        )}
                      </For>
                    </div>
                  </Show>
                </section>
              )
            }}
          </For>
        </Show>
      </div>
    </div>
  )
}
