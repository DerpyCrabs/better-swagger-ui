import { For, Show, createEffect, createSignal } from 'solid-js'
import { ChevronDown, ChevronUp } from '../icons'
import type { LoadedSpec } from '../lib/load-spec'
import {
  collectOperations,
  findOperationTag,
  operationExists,
  tagDescriptions,
  type OperationItem,
} from '../lib/operations'
import {
  scrollToOperationHeader,
  operationHeaderElement,
  scheduleOperationHeaderViewportRestore,
  runPendingOperationHeaderViewportRestore,
} from '../lib/operation-scroll'
import { MarkdownText } from './MarkdownText'
import { OperationBlock } from './OperationBlock'
import { SpecSchemaActions } from './SpecSchemaActions'

interface ApiDocumentProps {
  loaded: LoadedSpec
  expandedOp: string | null
  /** Operation id from the initial ?op= query param; scroll to it once after first render. */
  initialOp: string | null
  onExpandedOpChange: (op: string | null) => void
}

export function ApiDocument(props: ApiDocumentProps) {
  const [openTags, setOpenTags] = createSignal<Set<string>>(new Set())
  let initialOpScrolled = false

  const grouped = () => collectOperations(props.loaded.spec)
  const descriptions = () => tagDescriptions(props.loaded.spec)
  const serverUrl = () => props.loaded.spec.servers?.[0]?.url ?? ''

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

  const toggleTag = (tag: string) => {
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
            <h2 class="text-2xl font-semibold text-zinc-900 dark:text-dm-text" data-testid="api-title">
              {props.loaded.spec.info.title}
            </h2>
            <Show when={props.loaded.spec.info.version}>
              <p class="mt-1 text-sm text-zinc-500 dark:text-dm-muted">v{props.loaded.spec.info.version}</p>
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

      <div>
        <For each={[...grouped().entries()]}>
          {([tag, operations]) => {
            const isOpen = () => openTags().has(tag)
            const description = () => descriptions().get(tag)

            return (
              <section class="border-b border-zinc-200 dark:border-dm-border" data-testid={`tag-section-${tag}`}>
                <button
                  type="button"
                  class="flex w-full items-center gap-3 px-2 py-3 text-left hover:bg-zinc-50 dark:bg-dm-surface dark:hover:bg-dm-surface-hover"
                  onClick={() => toggleTag(tag)}
                >
                  <span class="text-lg font-medium text-zinc-900 dark:text-dm-text">{tag}</span>
                  <Show when={description()}>
                    <span class="flex-1 truncate text-sm text-zinc-500 dark:text-dm-muted">{description()}</span>
                  </Show>
                  <span class="ml-auto shrink-0 text-zinc-400 dark:text-dm-muted">
                    {isOpen() ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </span>
                </button>

                <Show when={isOpen()}>
                  <div class="space-y-0 border-t border-zinc-200 p-2 [overflow-anchor:none] dark:border-t-dm-border">
                    <For each={operations}>
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
      </div>
    </div>
  )
}
