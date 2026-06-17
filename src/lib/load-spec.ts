import type { OpenAPIV3 } from 'openapi-types'
import type { InitOAuthConfig } from './auth-config'
import { loadInitOAuth } from './auth-config'
import { fetchJson } from './fetch-utils'
import {
  discoverSpecDefinitions,
  pickDefinition,
  type SpecDefinition,
} from './spec-definitions'

export type { SpecDefinition }

export interface LoadedSpec {
  spec: OpenAPIV3.Document
  specUrl: string
  sourceUrl: string
  oauthInit: InitOAuthConfig | null
  definitions: SpecDefinition[]
  selectedDefinition: string
}

function assertOpenApi(doc: unknown): asserts doc is OpenAPIV3.Document {
  if (!doc || typeof doc !== 'object') {
    throw new Error('Invalid OpenAPI document')
  }

  const record = doc as Record<string, unknown>
  if (typeof record.openapi !== 'string' && typeof record.swagger !== 'string') {
    throw new Error('Response is not an OpenAPI document')
  }

  if (!record.paths || typeof record.paths !== 'object') {
    throw new Error('OpenAPI document is missing paths')
  }
}

export function validateOpenApiDocument(doc: unknown): OpenAPIV3.Document {
  assertOpenApi(doc)
  return doc
}

export async function loadSpecDocument(specUrl: string): Promise<OpenAPIV3.Document> {
  const raw = await fetchJson(specUrl)
  assertOpenApi(raw)
  return raw
}

export async function loadSpecFromSwaggerUi(
  input: string,
  definitionName?: string | null,
): Promise<LoadedSpec> {
  const trimmed = input.trim()
  let sourceUrl = trimmed
  try {
    const parsed = new URL(trimmed)
    parsed.hash = ''
    sourceUrl = parsed.href
  } catch {
    // keep trimmed input
  }

  const definitions = await discoverSpecDefinitions(trimmed)
  const selected = pickDefinition(definitions, definitionName)

  const [raw, oauthInit] = await Promise.all([
    fetchJson(selected.url),
    loadInitOAuth(trimmed),
  ])

  assertOpenApi(raw)

  return {
    spec: raw,
    specUrl: selected.url,
    sourceUrl,
    oauthInit,
    definitions,
    selectedDefinition: selected.name,
  }
}
