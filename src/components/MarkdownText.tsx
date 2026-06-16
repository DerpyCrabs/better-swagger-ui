import { createMemo } from 'solid-js'
import DOMPurify from 'dompurify'
import { marked } from 'marked'

interface MarkdownTextProps {
  content?: string
  class?: string
}

export function MarkdownText(props: MarkdownTextProps) {
  const html = createMemo(() => {
    if (!props.content) return ''
    const rendered = marked.parse(props.content, { async: false }) as string
    return DOMPurify.sanitize(rendered)
  })

  return (
    <div
      class={`prose prose-sm max-w-none prose-p:my-2 prose-headings:my-2 dark:prose-invert ${props.class ?? ''}`}
      innerHTML={html()}
    />
  )
}
