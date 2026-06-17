import type { ParamInputKind, ParamInputMeta } from './param-schema'

export type ParamStyle =
  | 'form'
  | 'simple'
  | 'spaceDelimited'
  | 'pipeDelimited'
  | 'deepObject'
  | 'label'
  | 'matrix'

export function defaultParamStyle(location: ParamInputMeta['in']): ParamStyle {
  if (location === 'query') return 'form'
  return 'simple'
}

export function defaultParamExplode(style: ParamStyle, kind: ParamInputKind): boolean {
  if (style === 'form' && (kind === 'array' || kind === 'object')) return true
  return false
}

function resolveStyleExplode(meta: ParamInputMeta): { style: ParamStyle; explode: boolean } {
  const style = (meta.style ?? defaultParamStyle(meta.in)) as ParamStyle
  const explode = meta.explode ?? defaultParamExplode(style, meta.kind)
  return { style, explode }
}

function serializePrimitive(value: unknown): string {
  return String(value)
}

function objectEntries(obj: Record<string, unknown>): [string, unknown][] {
  return Object.entries(obj).filter(([, value]) => value !== undefined && value !== null && value !== '')
}

export function parseParamInputValue(meta: ParamInputMeta, raw: string): unknown | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (meta.kind === 'object') {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed
      }
      return null
    } catch {
      return null
    }
  }

  if (meta.kind === 'array') {
    const { style } = resolveStyleExplode(meta)
    let separator = ','
    if (style === 'pipeDelimited') separator = '|'
    if (style === 'spaceDelimited') separator = ' '
    return trimmed
      .split(separator)
      .map((part) => part.trim())
      .filter(Boolean)
  }

  return trimmed
}

export function appendQueryParam(
  query: URLSearchParams,
  meta: ParamInputMeta,
  raw: string,
): void {
  const value = parseParamInputValue(meta, raw)
  if (value === null) return

  const { style, explode } = resolveStyleExplode(meta)
  const name = meta.name

  if (meta.kind === 'array' && Array.isArray(value)) {
    if (value.length === 0) return

    if (style === 'form') {
      if (explode) {
        for (const item of value) query.append(name, serializePrimitive(item))
      } else {
        query.set(name, value.map(serializePrimitive).join(','))
      }
      return
    }

    if (style === 'spaceDelimited') {
      query.set(name, value.map(serializePrimitive).join(' '))
      return
    }

    if (style === 'pipeDelimited') {
      query.set(name, value.map(serializePrimitive).join('|'))
      return
    }
  }

  if (meta.kind === 'object' && typeof value === 'object') {
    const entries = objectEntries(value as Record<string, unknown>)
    if (entries.length === 0) return

    if (style === 'deepObject') {
      for (const [key, entryValue] of entries) {
        query.append(`${name}[${key}]`, serializePrimitive(entryValue))
      }
      return
    }

    if (style === 'form') {
      if (explode) {
        for (const [key, entryValue] of entries) {
          query.append(key, serializePrimitive(entryValue))
        }
      } else {
        query.set(
          name,
          entries.flatMap(([key, entryValue]) => [key, serializePrimitive(entryValue)]).join(','),
        )
      }
      return
    }
  }

  query.set(name, serializePrimitive(value))
}

export function serializePathParamValue(meta: ParamInputMeta, raw: string): string | null {
  const value = parseParamInputValue(meta, raw)
  if (value === null) return null

  const { explode } = resolveStyleExplode(meta)

  if (meta.kind === 'array' && Array.isArray(value)) {
    return value.map(serializePrimitive).join(',')
  }

  if (meta.kind === 'object' && typeof value === 'object') {
    const entries = objectEntries(value as Record<string, unknown>)
    if (explode) {
      return entries.map(([key, entryValue]) => `${key}=${serializePrimitive(entryValue)}`).join(',')
    }
    return entries.flatMap(([key, entryValue]) => [key, serializePrimitive(entryValue)]).join(',')
  }

  return serializePrimitive(value)
}

export function serializeHeaderParamValue(meta: ParamInputMeta, raw: string): string | null {
  return serializePathParamValue(meta, raw)
}
