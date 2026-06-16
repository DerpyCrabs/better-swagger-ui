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
      return 'bg-emerald-600/20 text-emerald-400 ring-emerald-600/30'
    case 'post':
      return 'bg-sky-600/20 text-sky-400 ring-sky-600/30'
    case 'put':
      return 'bg-amber-600/20 text-amber-400 ring-amber-600/30'
    case 'patch':
      return 'bg-orange-600/20 text-orange-400 ring-orange-600/30'
    case 'delete':
      return 'bg-rose-600/20 text-rose-400 ring-rose-600/30'
    default:
      return 'bg-zinc-600/20 text-zinc-400 ring-zinc-600/30'
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
