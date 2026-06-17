import { createEffect, createMemo } from 'solid-js'
import { createVirtualizer } from '@tanstack/solid-virtual'
import hljs from 'highlight.js/lib/core'
import jsonLang from 'highlight.js/lib/languages/json'

hljs.registerLanguage('json', jsonLang)

const HIGHLIGHT_MAX_BYTES = 3 * 1024 * 1024

interface VirtualJsonViewerProps {
  data: unknown
  maxHeight?: string
  class?: string
  /** When false, skip syntax highlighting (also skipped automatically above 3 MB). */
  highlight?: boolean
}

function textByteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function toPrettyJson(data: unknown): { text: string; language: 'json' | 'plaintext' } {
  if (typeof data === 'string') {
    try {
      return {
        text: JSON.stringify(JSON.parse(data), null, 2),
        language: 'json',
      }
    } catch {
      return { text: data, language: 'plaintext' }
    }
  }

  try {
    return {
      text: JSON.stringify(data, null, 2),
      language: 'json',
    }
  } catch {
    return { text: String(data), language: 'plaintext' }
  }
}

export function VirtualJsonViewer(props: VirtualJsonViewerProps) {
  let scrollRef: HTMLDivElement | undefined

  const lines = createMemo(() => {
    const { text, language } = toPrettyJson(props.data)
    const shouldHighlight =
      props.highlight !== false &&
      language === 'json' &&
      textByteLength(text) <= HIGHLIGHT_MAX_BYTES
    if (shouldHighlight) {
      return hljs.highlight(text, { language: 'json' }).value.split('\n')
    }
    return text.split('\n').map((line) => escapeHtml(line))
  })

  createEffect(() => {
    props.data
    if (scrollRef) scrollRef.scrollTop = 0
  })

  const virtualizer = createVirtualizer({
    get count() {
      return lines().length
    },
    getScrollElement: () => scrollRef ?? null,
    estimateSize: () => 20,
    overscan: 15,
  })

  return (
    <div
      ref={scrollRef}
      class={`overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 font-mono text-[13px] dark:border-zinc-800 dark:bg-zinc-900/80 ${props.class ?? ''}`}
      style={{ 'max-height': props.maxHeight ?? '24rem' }}
    >
      <div
        class="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((item) => (
          <div
            class="absolute top-0 left-0 flex w-full px-3 leading-5 whitespace-pre"
            style={{
              height: `${item.size}px`,
              transform: `translateY(${item.start}px)`,
            }}
          >
            <span class="mr-3 w-8 shrink-0 text-right text-zinc-400 select-none dark:text-zinc-600">
              {item.index + 1}
            </span>
            <span innerHTML={lines()[item.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}
