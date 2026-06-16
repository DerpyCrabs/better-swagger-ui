import { For, Show, createEffect, createSignal } from 'solid-js'
import { ChevronDown, ChevronUp } from 'lucide-solid'
import type { OpenAPIV3 } from 'openapi-types'
import type { LoadedSpec } from '../lib/load-spec'
import {
  collectOperations,
  findOperationTag,
  operationExists,
  tagDescriptions,
  type OperationItem,
} from '../lib/operations'
import { MarkdownText } from './MarkdownText'
import { OperationBlock } from './OperationBlock'

interface ApiDocumentProps {
  loaded: LoadedSpec
  expandedOp: string | null
  scrollToOp: string | null
  onScrollToOpDone: () => void
  onExpandedOpChange: (op: string | null) => void
}

function isOperationSecured(
  spec: OpenAPIV3.Document,
  operation: OpenAPIV3.OperationObject,
): boolean {
  if (operation.security !== undefined) {
    return operation.security.length > 0
  }
  return Boolean(spec.security?.length)
}

function scrollToOperation(opId: string) {
  const el = document.querySelector(`[data-op-id="${CSS.escape(opId)}"]`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export function ApiDocument(props: ApiDocumentProps) {
  const [openTags, setOpenTags] = createSignal<Set<string>>(new Set())

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
    const target = props.scrollToOp
    if (!target) return

    props.loaded.specUrl
    const groups = grouped()

    if (!operationExists(groups, target)) {
      props.onScrollToOpDone()
      return
    }

    if (props.expandedOp !== target) return

    const tag = findOperationTag(groups, target)
    if (!tag || !openTags().has(tag)) return

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToOperation(target)
        props.onScrollToOpDone()
      })
    })
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
      <section class="mb-6 border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h2 class="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          {props.loaded.spec.info.title}
        </h2>
        <Show when={props.loaded.spec.info.version}>
          <p class="mt-1 text-sm text-zinc-500">v{props.loaded.spec.info.version}</p>
        </Show>
        <Show when={props.loaded.spec.info.description}>
          <div class="mt-4 text-sm">
            <MarkdownText content={props.loaded.spec.info.description} />
          </div>
        </Show>
        <Show when={props.loaded.spec.servers?.[0]?.url}>
          <p class="mt-3 font-mono text-sm text-zinc-500">
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
              <section class="border-b border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  class="flex w-full items-center gap-3 px-2 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                  onClick={() => toggleTag(tag)}
                >
                  <span class="text-lg font-medium text-zinc-900 dark:text-zinc-100">{tag}</span>
                  <Show when={description()}>
                    <span class="flex-1 truncate text-sm text-zinc-500">{description()}</span>
                  </Show>
                  <span class="ml-auto shrink-0 text-zinc-400 dark:text-zinc-500">
                    {isOpen() ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </span>
                </button>

                <Show when={isOpen()}>
                  <div class="border-t border-zinc-200 dark:border-zinc-800">
                    <For each={operations}>
                      {(item) => (
                        <OperationBlock
                          item={item}
                          serverUrl={serverUrl()}
                          specUrl={props.loaded.specUrl}
                          secured={isOperationSecured(props.loaded.spec, item.operation)}
                          expanded={props.expandedOp === item.id}
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
