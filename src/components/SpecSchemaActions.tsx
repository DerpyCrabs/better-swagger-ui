import type { OpenAPIV3 } from 'openapi-types'
import { Download, Link2 } from '../icons'

interface SpecSchemaActionsProps {
  spec: OpenAPIV3.Document
  specUrl: string
}

function specDownloadName(title: string): string {
  const safe =
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'openapi'
  return `${safe}.openapi.json`
}

function resolveSpecUrl(specUrl: string): string {
  try {
    return new URL(specUrl).href
  } catch {
    return new URL(specUrl, window.location.origin).href
  }
}

export function SpecSchemaActions(props: SpecSchemaActionsProps) {
  const openUrl = () => resolveSpecUrl(props.specUrl)

  const downloadSpec = () => {
    const json = JSON.stringify(props.spec, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = specDownloadName(props.spec.info.title ?? 'openapi')
    anchor.click()
    URL.revokeObjectURL(objectUrl)
  }

  return (
    <div class="flex shrink-0 flex-wrap items-center gap-2">
      <button
        type="button"
        data-testid="download-schema"
        title="Download OpenAPI schema"
        aria-label="Download OpenAPI schema"
        onClick={downloadSpec}
        class="inline-flex items-center rounded-md border border-zinc-300 p-1.5 text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
      >
        <Download size={14} />
      </button>
      <a
        href={openUrl()}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="open-schema"
        title="Open schema URL"
        aria-label="Open schema URL"
        class="inline-flex items-center rounded-md border border-zinc-300 p-1.5 text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
      >
        <Link2 size={14} />
      </a>
    </div>
  )
}
