import { LoaderCircle, Link2 } from '../icons'
import { Show } from 'solid-js'
import { AuthorizeButton } from './AuthorizeDialog'
import { ThemeToggle } from './ThemeToggle'

interface AppHeaderProps {
  url: string
  loading: boolean
  specLoaded: boolean
  onUrlChange: (url: string) => void
  onLoad: (url: string) => void
}

export function AppHeader(props: AppHeaderProps) {
  const submit = (event: Event) => {
    event.preventDefault()
    props.onLoad(props.url)
  }

  return (
    <header class="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <div class="mx-auto flex max-w-5xl items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">
        <span class="hidden shrink-0 text-sm font-semibold text-zinc-900 dark:text-zinc-50 sm:inline">
          Better Swagger UI
        </span>

        <form onSubmit={submit} class="flex min-w-0 flex-1 items-center gap-2">
          <div class="relative min-w-0 flex-1">
            <Link2
              size={14}
              class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
            />
            <input
              type="url"
              required
              value={props.url}
              onInput={(event) => props.onUrlChange(event.currentTarget.value)}
              placeholder="Swagger UI URL"
              class="w-full rounded-md border border-zinc-300 bg-white py-1.5 pr-2 pl-8 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-sky-500/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
          </div>
          <button
            type="submit"
            disabled={props.loading}
            class="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Show when={props.loading}>
              <LoaderCircle size={14} class="animate-spin" />
            </Show>
            Load
          </button>
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
