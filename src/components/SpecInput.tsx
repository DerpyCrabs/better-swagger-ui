import { LoaderCircle, Link2 } from 'lucide-solid'

interface SpecInputProps {
  url: string
  loading: boolean
  onUrlChange: (url: string) => void
  onLoad: (url: string) => void
}

export function SpecInput(props: SpecInputProps) {
  const submit = (event: Event) => {
    event.preventDefault()
    props.onLoad(props.url)
  }

  return (
    <form onSubmit={submit} class="flex flex-col gap-2 sm:flex-row">
      <div class="relative flex-1">
        <Link2
          size={16}
          class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
        />
        <input
          type="url"
          required
          value={props.url}
          onInput={(event) => props.onUrlChange(event.currentTarget.value)}
          placeholder="https://example.com/swagger-ui/index.html"
          class="w-full rounded-lg border border-zinc-300 bg-white py-2.5 pr-3 pl-9 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-sky-500/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:ring-sky-500/40"
        />
      </div>
      <button
        type="submit"
        disabled={props.loading}
        class="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {props.loading ? <LoaderCircle size={16} class="animate-spin" /> : null}
        Load spec
      </button>
    </form>
  )
}
