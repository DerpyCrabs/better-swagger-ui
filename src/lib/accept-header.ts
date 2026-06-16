import type { OpenAPIV3 } from 'openapi-types'

function isReference(value: unknown): value is OpenAPIV3.ReferenceObject {
  return Boolean(value && typeof value === 'object' && '$ref' in value)
}

function contentTypePriority(contentType: string): number {
  const mime = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  if (mime.includes('octet-stream')) return 0
  if (mime.includes('csv')) return 1
  if (mime.includes('pdf') || mime.includes('zip') || mime.includes('excel')) return 1
  if (mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/')) return 1
  if (mime.includes('json')) return 3
  if (mime.startsWith('text/')) return 2
  return 2
}

export function collectResponseContentTypes(operation: OpenAPIV3.OperationObject): string[] {
  const types = new Set<string>()

  for (const response of Object.values(operation.responses ?? {})) {
    if (isReference(response) || !response.content) continue
    for (const contentType of Object.keys(response.content)) {
      types.add(contentType)
    }
  }

  return [...types].sort(
    (a, b) => contentTypePriority(a) - contentTypePriority(b) || a.localeCompare(b),
  )
}

export function buildAcceptHeader(operation: OpenAPIV3.OperationObject): string {
  const types = collectResponseContentTypes(operation)
  if (types.length === 0) return 'application/json, text/plain, */*'
  return [...types, '*/*'].join(', ')
}

export function prefersBinaryResponse(operation: OpenAPIV3.OperationObject): boolean {
  const types = collectResponseContentTypes(operation)
  if (types.length === 0) return false
  return contentTypePriority(types[0]) <= 1
}
