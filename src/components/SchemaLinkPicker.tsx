import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import { ChevronDown, Link2, Search } from '../icons'
import {
  findSchemaLinkMatch,
  type SchemaLink,
  type SchemaLinkCatalog,
  type SchemaLinkItem,
} from '../lib/schema-links'

interface SchemaLinkPickerProps {
  catalog: SchemaLinkCatalog
  url: string
  matched?: boolean
  onSelect: (url: string) => void
  onOpenSettings: () => void
}

function filterTree(items: SchemaLinkItem[], query: string): SchemaLinkItem[] {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return items

  const filtered: SchemaLinkItem[] = []

  for (const item of items) {
    if (item.type === 'link') {
      if (item.name.toLowerCase().includes(trimmed) || item.url.toLowerCase().includes(trimmed)) {
        filtered.push(item)
      }
      continue
    }

    const groupMatches = item.name.toLowerCase().includes(trimmed)
    const matchingLinks = item.links.filter(
      (link) =>
        link.name.toLowerCase().includes(trimmed) || link.url.toLowerCase().includes(trimmed),
    )

    if (groupMatches || matchingLinks.length) {
      filtered.push({
        ...item,
        links: groupMatches ? item.links : matchingLinks,
      })
    }
  }

  return filtered
}

function optionClass(active: boolean) {
  return active
    ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
    : 'text-zinc-800 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900/50'
}

export function SchemaLinkPicker(props: SchemaLinkPickerProps) {
  let root: HTMLDivElement | undefined
  let list: HTMLDivElement | undefined
  const [open, setOpen] = createSignal(false)
  const [filter, setFilter] = createSignal('')

  const match = createMemo(() => findSchemaLinkMatch(props.catalog, props.url))
  const filteredTree = createMemo(() => filterTree(props.catalog.items, filter()))

  const buttonLabel = () => match()?.label ?? 'Links'

  const openPicker = () => {
    setFilter('')
    setOpen(true)
  }

  const selectLink = (link: SchemaLink) => {
    props.onSelect(link.url)
    setOpen(false)
  }

  createEffect(() => {
    if (!open()) return
    match()?.link.id
    queueMicrotask(() => {
      list?.querySelector<HTMLElement>('[data-schema-link-active="true"]')?.scrollIntoView({
        block: 'nearest',
      })
    })
  })

  createEffect(() => {
    if (!open()) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!root?.contains(event.target as Node)) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    onCleanup(() => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    })
  })

  const rowClass =
    'mx-1.5 flex w-[calc(100%-0.75rem)] min-w-0 items-center rounded-md px-2.5 py-2 text-left text-sm transition-colors'

  return (
    <div
      ref={root}
      class="relative shrink-0"
      classList={{
        'max-w-[12rem]': !props.matched,
        'max-w-[15rem] sm:max-w-[17rem]': props.matched,
      }}
    >
      <button
        type="button"
        class="inline-flex w-full min-w-0 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        data-testid="schema-links-picker-button"
        aria-haspopup="listbox"
        aria-expanded={open()}
        title={buttonLabel()}
        onClick={() => (open() ? setOpen(false) : openPicker())}
      >
        <Link2 size={15} class="shrink-0" />
        <span class="truncate">{buttonLabel()}</span>
        <ChevronDown size={14} class="shrink-0 text-zinc-500" />
      </button>

      <Show when={open()}>
        <div
          class="absolute top-full left-0 z-50 mt-1 w-[min(16rem,calc(100vw-1rem))] overflow-hidden rounded-md border border-zinc-200 bg-white py-1 shadow-md dark:border-zinc-700 dark:bg-zinc-950"
          data-testid="schema-links-picker-popover"
          role="listbox"
        >
          <Show when={props.catalog.items.length}>
            <div class="px-2 pb-1">
              <div class="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900/50">
                <Search size={14} class="shrink-0 text-zinc-400" />
                <input
                  class="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
                  data-testid="schema-links-filter"
                  value={filter()}
                  placeholder="Search"
                  aria-label="Filter"
                  onInput={(event) => setFilter(event.currentTarget.value)}
                />
              </div>
            </div>

            <div ref={list} class="max-h-64 overflow-y-auto px-1 pb-1">
              <For each={filteredTree()}>
                {(item, index) => (
                  <Show
                    when={item.type === 'group'}
                    fallback={
                      <button
                        type="button"
                        role="option"
                        class={rowClass}
                        classList={{
                          [optionClass(match()?.link.id === item.id)]: true,
                        }}
                        data-testid="schema-links-top-item"
                        data-schema-link-active={match()?.link.id === item.id ? 'true' : undefined}
                        onClick={() => item.type === 'link' && selectLink(item)}
                      >
                        <span class="truncate font-medium">{item.name}</span>
                      </button>
                    }
                  >
                    <div class={index() > 0 ? 'mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-800' : ''}>
                      <p
                        class="px-3 pb-0.5 text-sm font-medium text-zinc-600 dark:text-zinc-400"
                        data-testid="schema-links-top-item"
                      >
                        {item.name}
                      </p>
                      <For each={item.type === 'group' ? item.links : []}>
                        {(link) => {
                          const active = () => match()?.link.id === link.id
                          return (
                            <button
                              type="button"
                              role="option"
                              class={`${rowClass} pl-4`}
                              classList={{
                                [optionClass(active())]: true,
                              }}
                              data-testid="schema-links-child-link"
                              data-schema-link-active={active() ? 'true' : undefined}
                              onClick={() => selectLink(link)}
                            >
                              <span class="truncate">{link.name}</span>
                            </button>
                          )
                        }}
                      </For>
                    </div>
                  </Show>
                )}
              </For>
            </div>
          </Show>

          <div class="border-t border-zinc-100 px-3 py-1.5 dark:border-zinc-800">
            <button
              type="button"
              class="text-xs text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              data-testid="schema-links-open-settings"
              onClick={() => {
                setOpen(false)
                props.onOpenSettings()
              }}
            >
              Edit links…
            </button>
          </div>
        </div>
      </Show>
    </div>
  )
}
