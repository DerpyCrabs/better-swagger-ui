import type { ParamInputMeta } from './param-schema'
import {
  appendQueryParam,
  serializeHeaderParamValue,
  serializePathParamValue,
} from './param-serialization'

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
      const serialized = serializePathParamValue(param, value)
      if (serialized) {
        resolvedPath = resolvedPath.replace(`{${param.name}}`, encodeURIComponent(serialized))
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

export function buildRequestHeaders(
  defs: ParamInputMeta[],
  values: Record<string, string>,
  baseHeaders: Record<string, string> = {},
): Record<string, string> {
  const headers = { ...baseHeaders }

  for (const param of defs) {
    const raw = values[param.name] ?? ''
    if (param.in === 'header') {
      const serialized = serializeHeaderParamValue(param, raw)
      if (serialized) headers[param.name] = serialized
    }
  }

  return headers
}
