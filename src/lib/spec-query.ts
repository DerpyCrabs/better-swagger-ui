import type { Query } from '@tanstack/query-core'
import { loadSpecFromSwaggerUi, loadSpecFromText, type LoadedSpec } from './load-spec'

export function normalizeSourceUrl(url: string): string {
  try {
    const parsed = new URL(url.trim())
    parsed.hash = ''
    return parsed.href
  } catch {
    return url.trim()
  }
}

export type SpecQuerySource =
  | { kind: 'url'; sourceUrl: string; definition: string | null }
  | { kind: 'text'; label: string; text: string }

export const specQueryKeys = {
  all: ['spec'] as const,
  url: (sourceUrl: string, definition: string | null) =>
    [...specQueryKeys.all, 'url', sourceUrl, definition ?? ''] as const,
  text: (label: string, text: string) =>
    [...specQueryKeys.all, 'text', label, text] as const,
}

export function specQueryKey(source: SpecQuerySource) {
  return source.kind === 'text'
    ? specQueryKeys.text(source.label, source.text)
    : specQueryKeys.url(source.sourceUrl, source.definition)
}

export function sourceFromQueryKey(key: readonly unknown[]): SpecQuerySource | null {
  if (key[0] !== 'spec') return null

  if (key[1] === 'text' && typeof key[2] === 'string' && typeof key[3] === 'string') {
    return { kind: 'text', label: key[2], text: key[3] }
  }

  if (key[1] === 'url' && typeof key[2] === 'string') {
    const definition = typeof key[3] === 'string' && key[3] ? key[3] : null
    return { kind: 'url', sourceUrl: key[2], definition }
  }

  return null
}

export async function fetchSpecSource(source: SpecQuerySource): Promise<LoadedSpec> {
  if (source.kind === 'text') {
    return loadSpecFromText(source.label, source.text)
  }

  return loadSpecFromSwaggerUi(source.sourceUrl, source.definition)
}

export function specPlaceholderData(
  current: SpecQuerySource | null,
  previousData: LoadedSpec | undefined,
  previousQuery: Query | undefined,
): LoadedSpec | undefined {
  if (!current || !previousData || !previousQuery) return undefined

  const previous = sourceFromQueryKey(previousQuery.queryKey)
  if (!previous) return undefined

  if (current.kind === 'text' && previous.kind === 'text') {
    return current.label === previous.label ? previousData : undefined
  }

  if (current.kind === 'url' && previous.kind === 'url') {
    return current.sourceUrl === previous.sourceUrl ? previousData : undefined
  }

  return undefined
}
