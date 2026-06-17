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

const dmHeaderSurface = 'dark:bg-dm-surface dark:hover:bg-dm-surface-hover'

export function methodColor(method: string): string {
  switch (method.toLowerCase()) {
    case 'get':
      return `bg-emerald-600/20 text-emerald-700 ring-emerald-600/40 dark:bg-[rgba(46,204,113,0.15)] dark:text-[#4ade80] dark:ring-[rgba(46,204,113,0.25)]`
    case 'post':
      return `bg-sky-600/20 text-sky-700 ring-sky-600/40 dark:bg-[rgba(52,152,219,0.15)] dark:text-[#60a5fa] dark:ring-[rgba(52,152,219,0.25)]`
    case 'put':
      return `bg-amber-600/20 text-amber-800 ring-amber-600/40 dark:bg-[rgba(245,158,11,0.15)] dark:text-[#fbbf24] dark:ring-[rgba(245,158,11,0.25)]`
    case 'patch':
      return `bg-orange-600/20 text-orange-800 ring-orange-600/40 dark:bg-[rgba(251,146,60,0.15)] dark:text-[#fb923c] dark:ring-[rgba(251,146,60,0.25)]`
    case 'delete':
      return `bg-rose-600/20 text-rose-700 ring-rose-600/40 dark:bg-[rgba(231,76,60,0.15)] dark:text-[#f87171] dark:ring-[rgba(231,76,60,0.25)]`
    default:
      return `bg-zinc-600/20 text-zinc-700 ring-zinc-600/40 dark:bg-[rgba(255,255,255,0.08)] dark:text-dm-muted dark:ring-dm-border`
  }
}

export function methodExpandedBg(method: string): string {
  switch (method.toLowerCase()) {
    case 'get':
      return 'bg-emerald-50 dark:bg-[rgba(46,204,113,0.05)]'
    case 'post':
      return 'bg-sky-50 dark:bg-[rgba(52,152,219,0.05)]'
    case 'put':
      return 'bg-amber-50 dark:bg-[rgba(245,158,11,0.05)]'
    case 'patch':
      return 'bg-orange-50 dark:bg-[rgba(251,146,60,0.05)]'
    case 'delete':
      return 'bg-rose-50 dark:bg-[rgba(231,76,60,0.05)]'
    default:
      return 'bg-zinc-50 dark:bg-dm-base'
  }
}

export function methodHeaderBg(method: string, expanded = false): string {
  switch (method.toLowerCase()) {
    case 'get':
      return expanded
        ? `bg-emerald-100 hover:bg-emerald-100/90 ${dmHeaderSurface}`
        : `bg-emerald-50 hover:bg-emerald-100/80 ${dmHeaderSurface}`
    case 'post':
      return expanded
        ? `bg-sky-100 hover:bg-sky-100/90 ${dmHeaderSurface}`
        : `bg-sky-50 hover:bg-sky-100/80 ${dmHeaderSurface}`
    case 'put':
      return expanded
        ? `bg-amber-100 hover:bg-amber-100/90 ${dmHeaderSurface}`
        : `bg-amber-50 hover:bg-amber-100/80 ${dmHeaderSurface}`
    case 'patch':
      return expanded
        ? `bg-orange-100 hover:bg-orange-100/90 ${dmHeaderSurface}`
        : `bg-orange-50 hover:bg-orange-100/80 ${dmHeaderSurface}`
    case 'delete':
      return expanded
        ? `bg-rose-100 hover:bg-rose-100/90 ${dmHeaderSurface}`
        : `bg-rose-50 hover:bg-rose-100/80 ${dmHeaderSurface}`
    default:
      return expanded
        ? `bg-zinc-100 hover:bg-zinc-100/90 ${dmHeaderSurface}`
        : `bg-zinc-50 hover:bg-zinc-100/80 ${dmHeaderSurface}`
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
