import { normalizeSourceUrl } from './spec-query'

export const SCHEMA_LINKS_STORAGE_KEY = 'better-swagger-schema-links'

export interface SchemaLink {
  id: string
  name: string
  url: string
}

export type SchemaLinkItem =
  | {
      type: 'link'
      id: string
      name: string
      url: string
    }
  | {
      type: 'group'
      id: string
      name: string
      links: SchemaLink[]
    }

export interface SchemaLinkCatalog {
  version: 1
  items: SchemaLinkItem[]
}

export interface SchemaLinkMatch {
  item: SchemaLinkItem
  link: SchemaLink
  label: string
}

interface ImportLink {
  id?: unknown
  name?: unknown
  url?: unknown
}

interface ImportItem extends ImportLink {
  type?: unknown
  links?: unknown
}

function slugify(value: string, fallback: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || fallback
}

function uniqueId(base: string, used: Set<string>) {
  let id = base
  let index = 2
  while (used.has(id)) {
    id = `${base}-${index}`
    index += 1
  }
  used.add(id)
  return id
}

function validHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function readName(value: unknown, path: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${path} must have a name`)
  }
  return value.trim()
}

function readUrl(value: unknown, path: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${path} must have a URL`)
  }

  const normalized = normalizeSourceUrl(value)
  if (!validHttpUrl(normalized)) {
    throw new Error(`${path} must be an http(s) URL`)
  }

  return normalized
}

function readOptionalId(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeLink(raw: ImportLink, path: string, usedIds: Set<string>): SchemaLink {
  const name = readName(raw.name, path)
  const url = readUrl(raw.url, path)
  const baseId = readOptionalId(raw.id) ?? slugify(name, 'link')

  return {
    id: uniqueId(baseId, usedIds),
    name,
    url,
  }
}

export function emptySchemaLinkCatalog(): SchemaLinkCatalog {
  return { version: 1, items: [] }
}

export function normalizeSchemaLinkCatalog(input: unknown): SchemaLinkCatalog {
  if (!input || typeof input !== 'object') {
    throw new Error('Catalog must be a JSON object')
  }

  const record = input as { version?: unknown; items?: unknown }
  if (record.version !== 1) {
    throw new Error('Catalog version must be 1')
  }

  if (!Array.isArray(record.items)) {
    throw new Error('Catalog items must be an array')
  }

  const usedIds = new Set<string>()
  const items = record.items.map((rawItem, index): SchemaLinkItem => {
    if (!rawItem || typeof rawItem !== 'object') {
      throw new Error(`Item ${index + 1} must be an object`)
    }

    const item = rawItem as ImportItem
    const path = `Item "${typeof item.name === 'string' ? item.name : index + 1}"`
    const type = item.type === 'group' ? 'group' : item.type === 'link' || item.links === undefined ? 'link' : 'group'

    if (type === 'link') {
      const link = normalizeLink(item, path, usedIds)
      return { type: 'link', ...link }
    }

    const name = readName(item.name, path)
    if (!Array.isArray(item.links) || item.links.length === 0) {
      throw new Error(`${path} must have at least one child link`)
    }

    const groupId = uniqueId(readOptionalId(item.id) ?? slugify(name, 'group'), usedIds)
    const links = item.links.map((rawLink, linkIndex) => {
      if (!rawLink || typeof rawLink !== 'object') {
        throw new Error(`${path} link ${linkIndex + 1} must be an object`)
      }

      return normalizeLink(
        rawLink as ImportLink,
        `${path} link "${typeof (rawLink as ImportLink).name === 'string' ? (rawLink as ImportLink).name : linkIndex + 1}"`,
        usedIds,
      )
    })

    return { type: 'group', id: groupId, name, links }
  })

  return { version: 1, items }
}

export function parseSchemaLinkCatalog(text: string): SchemaLinkCatalog {
  try {
    return normalizeSchemaLinkCatalog(JSON.parse(text))
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Catalog JSON is invalid')
    }
    throw error
  }
}

export function loadSchemaLinkCatalog(): SchemaLinkCatalog {
  try {
    const raw = localStorage.getItem(SCHEMA_LINKS_STORAGE_KEY)
    return raw ? parseSchemaLinkCatalog(raw) : emptySchemaLinkCatalog()
  } catch {
    return emptySchemaLinkCatalog()
  }
}

export function persistSchemaLinkCatalog(catalog: SchemaLinkCatalog) {
  localStorage.setItem(SCHEMA_LINKS_STORAGE_KEY, JSON.stringify(catalog))
}

export function exportSchemaLinkCatalog(catalog: SchemaLinkCatalog) {
  return `${JSON.stringify(catalog, null, 2)}\n`
}

export function findSchemaLinkMatch(
  catalog: SchemaLinkCatalog,
  sourceUrl: string,
): SchemaLinkMatch | null {
  if (!sourceUrl.trim()) return null
  const normalized = normalizeSourceUrl(sourceUrl)

  for (const item of catalog.items) {
    if (item.type === 'link') {
      if (normalizeSourceUrl(item.url) === normalized) {
        return { item, link: item, label: item.name }
      }
      continue
    }

    for (const link of item.links) {
      if (normalizeSourceUrl(link.url) === normalized) {
        return { item, link, label: `${item.name} / ${link.name}` }
      }
    }
  }

  return null
}
