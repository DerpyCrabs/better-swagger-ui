import { createSignal, Show } from 'solid-js'
import { Check, Copy } from '../icons'

interface CopyButtonProps {
  text: () => string
  label?: string
  class?: string
}

export function CopyButton(props: CopyButtonProps) {
  const [copied, setCopied] = createSignal(false)
  let resetTimer: ReturnType<typeof setTimeout> | undefined

  const copy = async () => {
    const value = props.text()
    if (!value) return

    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      if (resetTimer) clearTimeout(resetTimer)
      resetTimer = setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore clipboard errors
    }
  }

  return (
    <button
      type="button"
      title={props.label ?? 'Copy'}
      disabled={!props.text()}
      onClick={(event) => {
        event.stopPropagation()
        void copy()
      }}
      class={`inline-flex items-center gap-1 rounded border border-zinc-400 px-2 py-0.5 text-xs font-medium text-zinc-700 hover:bg-white disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800 ${props.class ?? ''}`}
    >
      <Show when={copied()} fallback={<Copy size={12} />}>
        <Check size={12} class="text-emerald-600 dark:text-emerald-400" />
      </Show>
      {copied() ? 'Copied' : (props.label ?? 'Copy')}
    </button>
  )
}
