import { Show } from 'solid-js'
import { LoaderCircle, Upload } from '../icons'
import { looksLikeSpecText } from '../lib/parse-spec'
import type { SpecDefinition } from '../lib/spec-definitions'
import { AuthorizeButton } from './AuthorizeDialog'
import { DefinitionSelector } from './DefinitionSelector'
import { ThemeToggle } from './ThemeToggle'

interface AppHeaderProps {
  url: string
  loading?: boolean
  specLoaded: boolean
  definitions: SpecDefinition[]
  selectedDefinition: string | null
  onUrlChange: (url: string) => void
  onLoad: (url: string) => void
  onLoadContent?: (sourceLabel: string, text: string) => void
  onDefinitionChange?: (name: string) => void
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function AppHeader(props: AppHeaderProps) {
  let fileInput: HTMLInputElement | undefined

  const submit = (event: Event) => {
    event.preventDefault()
    const trimmed = props.url.trim()
    if (isValidHttpUrl(trimmed)) {
      props.onLoad(trimmed)
    }
  }

  const handlePaste = (event: ClipboardEvent) => {
    const pasted = event.clipboardData?.getData('text').trim() ?? ''
    if (!pasted) return

    if (isValidHttpUrl(pasted)) {
      event.preventDefault()
      props.onUrlChange(pasted)
      props.onLoad(pasted)
      return
    }

    if (props.onLoadContent && looksLikeSpecText(pasted)) {
      event.preventDefault()
      const label = pasted.startsWith('{') ? 'pasted-spec.json' : 'pasted-spec.yaml'
      props.onUrlChange(label)
      props.onLoadContent(label, pasted)
    }
  }

  const handleFileChange = (event: Event) => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0]
    if (!file || !props.onLoadContent) return

    void file.text().then((text) => {
      props.onLoadContent?.(file.name, text)
      props.onUrlChange(file.name)
    })

    ;(event.currentTarget as HTMLInputElement).value = ''
  }

  return (
    <header class="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-dm-border dark:bg-dm-base/95">
      <div class="mx-auto flex max-w-5xl items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">
        <span class="hidden shrink-0 text-sm font-semibold text-zinc-900 dark:text-dm-text sm:inline">
          Better Swagger UI
        </span>

        <form onSubmit={submit} class="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3" data-testid="load-form">
          <div class="relative min-w-0 flex-1">
            <input
              type="text"
              data-testid="url-input"
              value={props.url}
              onInput={(event) => props.onUrlChange(event.currentTarget.value)}
              onPaste={handlePaste}
              placeholder="Swagger UI URL or paste YAML/JSON"
              class="w-full rounded-md border border-zinc-300 bg-white py-1.5 pl-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-sky-500/40 dark:border-dm-border dark:bg-dm-input dark:text-dm-text dark:placeholder:text-dm-muted dark:focus:border-sky-500 dark:focus:ring-sky-500/40"
              classList={{
                'pr-16': props.loading || !!props.onLoadContent,
                'pr-3': !props.loading && !props.onLoadContent,
              }}
            />

            <Show when={props.loading}>
              <span
                class="pointer-events-none absolute inset-y-0 right-9 inline-flex items-center px-2 text-zinc-400 dark:text-dm-muted"
                data-testid="spec-loading"
                aria-label="Loading spec"
              >
                <LoaderCircle size={16} class="animate-spin" />
              </span>
            </Show>

            <Show when={props.onLoadContent}>
              <>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".yaml,.yml,.json,application/json,application/yaml,text/yaml"
                  class="hidden"
                  data-testid="spec-file-input"
                  onChange={handleFileChange}
                />
                <button
                  type="button"
                  data-testid="spec-upload-button"
                  title="Upload OpenAPI YAML or JSON"
                  aria-label="Upload OpenAPI YAML or JSON"
                  onClick={() => fileInput?.click()}
                  class="absolute inset-y-0 right-0 inline-flex items-center justify-center rounded-r-md px-2.5 text-zinc-500 hover:text-zinc-700 dark:text-dm-muted dark:hover:text-dm-text"
                >
                  <Upload size={16} />
                </button>
              </>
            </Show>
          </div>

          <Show when={props.definitions.length > 1}>
            <DefinitionSelector
              definitions={props.definitions}
              selected={props.selectedDefinition ?? props.definitions[0]?.name ?? ''}
              onChange={(name) => props.onDefinitionChange?.(name)}
            />
          </Show>
        </form>

        <div class="flex shrink-0 items-center gap-1.5">
          <Show when={props.specLoaded}>
            <AuthorizeButton compact />
          </Show>
          <ThemeToggle compact />
        </div>
      </div>
    </header>
  )
}
