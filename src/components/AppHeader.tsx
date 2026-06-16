import { Show } from 'solid-js'
import { AuthorizeButton } from './AuthorizeDialog'
import { DefinitionSelector } from './DefinitionSelector'
import { ThemeToggle } from './ThemeToggle'
import type { SpecDefinition } from '../lib/spec-definitions'

interface AppHeaderProps {
  url: string
  specLoaded: boolean
  definitions: SpecDefinition[]
  selectedDefinition: string | null
  onUrlChange: (url: string) => void
  onLoad: (url: string) => void
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
  const submit = (event: Event) => {
    event.preventDefault()
    const trimmed = props.url.trim()
    if (isValidHttpUrl(trimmed)) {
      props.onLoad(trimmed)
    }
  }

  const handlePaste = (event: ClipboardEvent) => {
    const pasted = event.clipboardData?.getData('text').trim() ?? ''
    if (!isValidHttpUrl(pasted)) return

    event.preventDefault()
    props.onUrlChange(pasted)
    props.onLoad(pasted)
  }

  return (
    <header class="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <div class="mx-auto flex max-w-5xl items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">
        <span class="hidden shrink-0 text-sm font-semibold text-zinc-900 dark:text-zinc-50 sm:inline">
          Better Swagger UI
        </span>

        <form onSubmit={submit} class="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
          <div class="relative min-w-0 flex-1">
            <input
              type="url"
              required
              value={props.url}
              onInput={(event) => props.onUrlChange(event.currentTarget.value)}
              onPaste={handlePaste}
              placeholder="Swagger UI URL"
              class="w-full rounded-md border border-zinc-300 bg-white py-1.5 px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-sky-500/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
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
