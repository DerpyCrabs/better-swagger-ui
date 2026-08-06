import type { OpenAPIV3 } from 'openapi-types'

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const

export type HttpMethod = (typeof HTTP_METHODS)[number]

export interface OperationItem {
  id: string
  method: HttpMethod
  path: string
  operation: OpenAPIV3.OperationObject
}

export function collectOperations(spec: OpenAPIV3.Document): Map<string, OperationItem[]> {
  const byTag = new Map<string, OperationItem[]>()

  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    if (!pathItem) continue

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method]
      if (!operation) continue

      const item: OperationItem = {
        id: `${method}:${path}`,
        method,
        path,
        operation,
      }

      const tags = operation.tags?.length ? operation.tags : ['default']
      for (const tag of tags) {
        const list = byTag.get(tag) ?? []
        list.push(item)
        byTag.set(tag, list)
      }
    }
  }

  for (const list of byTag.values()) {
    list.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))
  }

  return new Map([...byTag.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

export function methodColor(method: string): string {
  switch (method.toLowerCase()) {
    case 'get':
      return `bg-emerald-600/25 text-emerald-800 ring-emerald-600/50 dark:bg-[rgba(46,204,113,0.22)] dark:text-[#4ade80] dark:ring-[rgba(46,204,113,0.35)]`
    case 'post':
      return `bg-sky-600/25 text-sky-800 ring-sky-600/50 dark:bg-[rgba(52,152,219,0.22)] dark:text-[#60a5fa] dark:ring-[rgba(52,152,219,0.35)]`
    case 'put':
      return `bg-amber-600/25 text-amber-900 ring-amber-600/50 dark:bg-[rgba(245,158,11,0.22)] dark:text-[#fbbf24] dark:ring-[rgba(245,158,11,0.35)]`
    case 'patch':
      return `bg-orange-600/25 text-orange-900 ring-orange-600/50 dark:bg-[rgba(251,146,60,0.22)] dark:text-[#fb923c] dark:ring-[rgba(251,146,60,0.35)]`
    case 'delete':
      return `bg-rose-600/25 text-rose-800 ring-rose-600/50 dark:bg-[rgba(231,76,60,0.22)] dark:text-[#f87171] dark:ring-[rgba(231,76,60,0.35)]`
    default:
      return `bg-zinc-600/25 text-zinc-800 ring-zinc-600/50 dark:bg-[rgba(255,255,255,0.12)] dark:text-dm-muted dark:ring-dm-border`
  }
}

export function methodExpandedBg(method: string): string {
  switch (method.toLowerCase()) {
    case 'get':
      return 'bg-emerald-100/70 dark:bg-[rgba(46,204,113,0.10)]'
    case 'post':
      return 'bg-sky-100/70 dark:bg-[rgba(52,152,219,0.10)]'
    case 'put':
      return 'bg-amber-100/70 dark:bg-[rgba(245,158,11,0.10)]'
    case 'patch':
      return 'bg-orange-100/70 dark:bg-[rgba(251,146,60,0.10)]'
    case 'delete':
      return 'bg-rose-100/70 dark:bg-[rgba(231,76,60,0.10)]'
    default:
      return 'bg-zinc-100/70 dark:bg-dm-base'
  }
}

export function methodHeaderBg(method: string, expanded = false): string {
  switch (method.toLowerCase()) {
    case 'get':
      return expanded
        ? 'bg-emerald-200/80 hover:bg-emerald-200 dark:bg-[rgba(46,204,113,0.16)] dark:hover:bg-[rgba(46,204,113,0.22)]'
        : 'bg-emerald-100 hover:bg-emerald-200/70 dark:bg-[rgba(46,204,113,0.10)] dark:hover:bg-[rgba(46,204,113,0.16)]'
    case 'post':
      return expanded
        ? 'bg-sky-200/80 hover:bg-sky-200 dark:bg-[rgba(52,152,219,0.16)] dark:hover:bg-[rgba(52,152,219,0.22)]'
        : 'bg-sky-100 hover:bg-sky-200/70 dark:bg-[rgba(52,152,219,0.10)] dark:hover:bg-[rgba(52,152,219,0.16)]'
    case 'put':
      return expanded
        ? 'bg-amber-200/80 hover:bg-amber-200 dark:bg-[rgba(245,158,11,0.16)] dark:hover:bg-[rgba(245,158,11,0.22)]'
        : 'bg-amber-100 hover:bg-amber-200/70 dark:bg-[rgba(245,158,11,0.10)] dark:hover:bg-[rgba(245,158,11,0.16)]'
    case 'patch':
      return expanded
        ? 'bg-orange-200/80 hover:bg-orange-200 dark:bg-[rgba(251,146,60,0.16)] dark:hover:bg-[rgba(251,146,60,0.22)]'
        : 'bg-orange-100 hover:bg-orange-200/70 dark:bg-[rgba(251,146,60,0.10)] dark:hover:bg-[rgba(251,146,60,0.16)]'
    case 'delete':
      return expanded
        ? 'bg-rose-200/80 hover:bg-rose-200 dark:bg-[rgba(231,76,60,0.16)] dark:hover:bg-[rgba(231,76,60,0.22)]'
        : 'bg-rose-100 hover:bg-rose-200/70 dark:bg-[rgba(231,76,60,0.10)] dark:hover:bg-[rgba(231,76,60,0.16)]'
    default:
      return expanded
        ? 'bg-zinc-200/80 hover:bg-zinc-200 dark:bg-dm-surface dark:hover:bg-dm-surface-hover'
        : 'bg-zinc-100 hover:bg-zinc-200/70 dark:bg-dm-surface dark:hover:bg-dm-surface-hover'
  }
}

export function tagDescriptions(spec: OpenAPIV3.Document): Map<string, string> {
  const map = new Map<string, string>()
  for (const tag of spec.tags ?? []) {
    if (tag.description) map.set(tag.name, tag.description)
  }
  return map
}

export function findOperationTag(
  grouped: Map<string, OperationItem[]>,
  operationId: string,
): string | null {
  for (const [tag, items] of grouped) {
    if (items.some((item) => item.id === operationId)) return tag
  }
  return null
}

export function operationExists(
  grouped: Map<string, OperationItem[]>,
  operationId: string,
): boolean {
  return findOperationTag(grouped, operationId) !== null
}
