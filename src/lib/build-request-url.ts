import type { ParamInputMeta } from './param-schema'
import { appendQueryParam } from './param-schema'

export function resolveServerUrl(serverUrl: string, specUrl: string): string {
  if (/^https?:\/\//i.test(serverUrl)) return serverUrl
  return new URL(serverUrl, new URL(specUrl).origin).href
}

export function buildUrl(
  serverUrl: string,
  specUrl: string,
  path: string,
  defs: ParamInputMeta[],
  values: Record<string, string>,
): string {
  let resolvedPath = path
  const query = new URLSearchParams()

  for (const param of defs) {
    const value = values[param.name] ?? ''
    if (param.in === 'path') {
      const trimmed = value.trim()
      if (trimmed) {
        resolvedPath = resolvedPath.replace(`{${param.name}}`, encodeURIComponent(trimmed))
      }
      continue
    }

    if (param.in === 'query') {
      appendQueryParam(query, param, value)
    }
  }

  const base = resolveServerUrl(serverUrl, specUrl).replace(/\/$/, '')
  const url = `${base}${resolvedPath}`
  const queryString = query.toString()
  return queryString ? `${url}?${queryString}` : url
}
