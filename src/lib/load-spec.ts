import type { OpenAPIV3 } from 'openapi-types'
import type { InitOAuthConfig } from './auth-config'
import { loadInitOAuth } from './auth-config'
import { proxyFetchJson } from './proxy-fetch'
import { resolveSpecUrl } from './resolve-spec-url'

export interface LoadedSpec {
  spec: OpenAPIV3.Document
  specUrl: string
  sourceUrl: string
  oauthInit: InitOAuthConfig | null
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

export async function loadSpecFromSwaggerUi(input: string): Promise<LoadedSpec> {
  const trimmed = input.trim()
  const specUrl = await resolveSpecUrl(trimmed)

  const [raw, oauthInit] = await Promise.all([
    proxyFetchJson(specUrl),
    loadInitOAuth(trimmed),
  ])

  assertOpenApi(raw)

  return {
    spec: raw,
    specUrl,
    sourceUrl: trimmed,
    oauthInit,
  }
}
