import { Index, Show, createSignal } from 'solid-js'
import { Portal } from 'solid-js/web'
import { Download, Plus, Trash2, Upload, X } from '../icons'
import {
  exportSchemaLinkCatalog,
  parseSchemaLinkCatalog,
  type SchemaLinkCatalog,
  type SchemaLinkItem,
} from '../lib/schema-links'

interface SchemaLinkSettingsDialogProps {
  catalog: SchemaLinkCatalog
  open: boolean
  onChange: (catalog: SchemaLinkCatalog) => void
  onClose: () => void
}

const fieldClass =
  'w-full min-w-0 rounded-sm bg-transparent px-1.5 py-1 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 hover:bg-zinc-100/70 focus:bg-white focus:ring-1 focus:ring-sky-500/35 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:hover:bg-zinc-800/60 dark:focus:bg-zinc-900'
const rowClass = 'group/row grid items-center gap-2'
const linkRowGrid = `${rowClass} [grid-template-columns:minmax(5rem,7rem)_minmax(0,1fr)_1.75rem]`
const groupRowGrid = `${rowClass} [grid-template-columns:minmax(0,1fr)_1.75rem]`
const ghostActionClass =
  'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
const iconActionClass =
  'inline-flex items-center justify-center rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
const deleteClass =
  'inline-flex shrink-0 items-center justify-center rounded-md p-1 text-zinc-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400'

function nextId(prefix: string) {
  return `${prefix}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`
}

function newLink(): SchemaLinkItem {
  return {
    type: 'link',
    id: nextId('link'),
    name: 'New link',
    url: 'https://example.com/swagger-ui/index.html',
  }
}

function newEnvironmentLink() {
  return {
    id: nextId('env-link'),
    name: 'dev',
    url: 'https://example.com/swagger-ui/index.html',
  }
}

function newGroup(): SchemaLinkItem {
  return {
    type: 'group',
    id: nextId('group'),
    name: 'New group',
    links: [newEnvironmentLink()],
  }
}

function DeleteButton(props: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      class={deleteClass}
      title={props.label}
      aria-label={props.label}
      onClick={props.onClick}
    >
      <Trash2 size={14} />
    </button>
  )
}

function HeaderActions(props: { onImport: () => void; onExport: () => void }) {
  return (
    <div class="flex items-center gap-0.5">
      <button
        type="button"
        class={iconActionClass}
        data-testid="schema-links-import-button"
        title="Import"
        aria-label="Import"
        onClick={props.onImport}
      >
        <Upload size={14} />
      </button>
      <button
        type="button"
        class={iconActionClass}
        data-testid="schema-links-export"
        title="Export"
        aria-label="Export"
        onClick={props.onExport}
      >
        <Download size={14} />
      </button>
    </div>
  )
}

const groupAddLinkClass =
  'inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950/30'
const footerActionClass =
  'inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800'

export function SchemaLinkSettingsDialog(props: SchemaLinkSettingsDialogProps) {
  let importFileInput: HTMLInputElement | undefined
  const [error, setError] = createSignal<string | null>(null)
  const [pendingImport, setPendingImport] = createSignal<SchemaLinkCatalog | null>(null)

  const updateItems = (items: SchemaLinkItem[]) => {
    props.onChange({ version: 1, items })
  }

  const updateItemAt = (index: number, next: SchemaLinkItem) => {
    updateItems(props.catalog.items.map((item, idx) => (idx === index ? next : item)))
  }

  const removeItem = (itemId: string) => {
    updateItems(props.catalog.items.filter((item) => item.id !== itemId))
  }

  const applyImport = (imported: SchemaLinkCatalog, mode: 'replace' | 'merge') => {
    props.onChange(
      mode === 'merge'
        ? { version: 1, items: [...props.catalog.items, ...imported.items] }
        : imported,
    )
    setPendingImport(null)
    setError(null)
  }

  const importCatalogText = (text: string) => {
    try {
      const imported = parseSchemaLinkCatalog(text)
      if (props.catalog.items.length) {
        setPendingImport(imported)
        setError(null)
        return
      }
      applyImport(imported, 'replace')
      setError(null)
    } catch (err) {
      setPendingImport(null)
      setError(err instanceof Error ? err.message : 'Could not import catalog')
    }
  }

  const handleImportFile = (event: Event) => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0]
    if (!file) return
    void file.text().then(importCatalogText)
    ;(event.currentTarget as HTMLInputElement).value = ''
  }

  const exportCatalog = () => {
    const blob = new Blob([exportSchemaLinkCatalog(props.catalog)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'schema-links.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  const addLink = () => updateItems([...props.catalog.items, newLink()])
  const addGroup = () => updateItems([...props.catalog.items, newGroup()])

  return (
    <Show when={props.open}>
      <Portal>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="schema-links-title"
            class="flex max-h-[80vh] min-h-0 w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-zinc-950/5 dark:bg-zinc-950 dark:ring-white/10"
            data-testid="schema-links-settings-dialog"
          >
            <header class="flex shrink-0 items-center gap-2 border-b border-zinc-200/80 px-3 py-2.5 dark:border-zinc-800">
              <h2 id="schema-links-title" class="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Schema links
              </h2>
              <HeaderActions
                onImport={() => importFileInput?.click()}
                onExport={exportCatalog}
              />
              <button
                type="button"
                class={iconActionClass}
                title="Close"
                aria-label="Close schema link settings"
                onClick={props.onClose}
              >
                <X size={16} />
              </button>
            </header>

            <div class="min-h-0 flex-1 overflow-y-auto">
              <input
                ref={importFileInput}
                type="file"
                accept=".json,application/json"
                class="hidden"
                data-testid="schema-links-import-file"
                onChange={handleImportFile}
              />

              <Show when={error()}>
                <p class="border-b border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                  {error()}
                </p>
              </Show>

              <Show when={pendingImport()}>
                {(imported) => (
                  <div
                    class="flex gap-1.5 border-b border-sky-200 bg-sky-50 px-3 py-1.5 dark:border-sky-900 dark:bg-sky-950/30"
                    data-testid="schema-links-import-choice"
                  >
                    <button
                      type="button"
                      class={ghostActionClass}
                      data-testid="schema-links-import-replace"
                      onClick={() => applyImport(imported(), 'replace')}
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      class={ghostActionClass}
                      data-testid="schema-links-import-merge"
                      onClick={() => applyImport(imported(), 'merge')}
                    >
                      Merge
                    </button>
                    <button
                      type="button"
                      class="rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-white/60 dark:hover:bg-zinc-900"
                      onClick={() => setPendingImport(null)}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </Show>

              <Show when={props.catalog.items.length}>
                <div class="divide-y divide-zinc-100 dark:divide-zinc-800">
                  <Index each={props.catalog.items}>
                    {(_, i) => {
                      const item = () => props.catalog.items[i]
                      const linkFields = () => {
                        const current = props.catalog.items[i]
                        return current.type === 'link' ? current : null
                      }
                      const childLinks = () => {
                        const current = item()
                        return current.type === 'group' ? current.links : []
                      }

                      return (
                        <Show
                          when={item().type === 'group'}
                          fallback={
                            <div class={`${linkRowGrid} px-3 py-1`}>
                              <input
                                class={fieldClass}
                                value={linkFields()?.name ?? ''}
                                aria-label="Link name"
                                data-testid="schema-links-item-name"
                                onInput={(event) => {
                                  const current = props.catalog.items[i]
                                  if (current.type !== 'link') return
                                  updateItemAt(i, {
                                    ...current,
                                    name: event.currentTarget.value,
                                  })
                                }}
                              />
                              <input
                                class={fieldClass}
                                value={linkFields()?.url ?? ''}
                                aria-label="Link URL"
                                data-testid="schema-links-link-url"
                                onInput={(event) => {
                                  const current = props.catalog.items[i]
                                  if (current.type !== 'link') return
                                  updateItemAt(i, {
                                    ...current,
                                    url: event.currentTarget.value,
                                  })
                                }}
                              />
                              <DeleteButton
                                label="Delete link"
                                onClick={() => removeItem(item().id)}
                              />
                            </div>
                          }
                        >
                          <div>
                            <div class={`${groupRowGrid} bg-zinc-50/60 px-3 py-1 dark:bg-zinc-900/30`}>
                              <input
                                class={`${fieldClass} font-medium`}
                                value={item().type === 'group' ? item().name : ''}
                                aria-label="Group name"
                                data-testid="schema-links-item-name"
                                onInput={(event) => {
                                  const current = props.catalog.items[i]
                                  if (current.type !== 'group') return
                                  updateItemAt(i, {
                                    ...current,
                                    name: event.currentTarget.value,
                                  })
                                }}
                              />
                              <DeleteButton
                                label="Delete group"
                                onClick={() => removeItem(item().id)}
                              />
                            </div>

                            <Index each={childLinks()}>
                              {(_, j) => (
                                <div class={`${linkRowGrid} px-3 py-1 pl-8`}>
                                  <input
                                    class={fieldClass}
                                    value={childLinks()[j]?.name ?? ''}
                                    aria-label="Environment name"
                                    data-testid="schema-links-child-name"
                                    onInput={(event) => {
                                      const current = props.catalog.items[i]
                                      if (current.type !== 'group') return
                                      updateItemAt(i, {
                                        ...current,
                                        links: current.links.map((candidate, index) =>
                                          index === j
                                            ? { ...candidate, name: event.currentTarget.value }
                                            : candidate,
                                        ),
                                      })
                                    }}
                                  />
                                  <input
                                    class={fieldClass}
                                    value={childLinks()[j]?.url ?? ''}
                                    aria-label="Environment URL"
                                    data-testid="schema-links-child-url"
                                    onInput={(event) => {
                                      const current = props.catalog.items[i]
                                      if (current.type !== 'group') return
                                      updateItemAt(i, {
                                        ...current,
                                        links: current.links.map((candidate, index) =>
                                          index === j
                                            ? { ...candidate, url: event.currentTarget.value }
                                            : candidate,
                                        ),
                                      })
                                    }}
                                  />
                                  <DeleteButton
                                    label={`Delete ${childLinks()[j]?.name ?? 'link'}`}
                                    onClick={() => {
                                      const current = props.catalog.items[i]
                                      if (current.type !== 'group') return
                                      updateItemAt(i, {
                                        ...current,
                                        links: current.links.filter((_, index) => index !== j),
                                      })
                                    }}
                                  />
                                </div>
                              )}
                            </Index>

                            <div class="px-3 py-1 pl-8">
                              <button
                                type="button"
                                class={groupAddLinkClass}
                                onClick={() => {
                                  const current = props.catalog.items[i]
                                  if (current.type !== 'group') return
                                  updateItemAt(i, {
                                    ...current,
                                    links: [...current.links, newEnvironmentLink()],
                                  })
                                }}
                              >
                                <Plus size={13} />
                                Link
                              </button>
                            </div>
                          </div>
                        </Show>
                      )
                    }}
                  </Index>
                </div>
              </Show>
            </div>

            <div class="flex shrink-0 items-center gap-2 border-t border-zinc-100 px-3 py-2.5 dark:border-zinc-800">
              <button type="button" class={footerActionClass} data-testid="schema-links-add-link" onClick={addLink}>
                <Plus size={14} />
                Link
              </button>
              <button type="button" class={footerActionClass} data-testid="schema-links-add-group" onClick={addGroup}>
                <Plus size={14} />
                Group
              </button>
            </div>
          </section>
        </div>
      </Portal>
    </Show>
  )
}
