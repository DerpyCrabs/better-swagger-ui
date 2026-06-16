import type { OpenAPIV3 } from 'openapi-types'
import { proxyFetchJson } from './proxy-fetch'
import { resolveSpecUrl } from './resolve-spec-url'

export interface LoadedSpec {
  spec: OpenAPIV3.Document
  specUrl: string
  sourceUrl: string
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
  const specUrl = await resolveSpecUrl(input)
  const raw = await proxyFetchJson(specUrl)
  assertOpenApi(raw)

  return {
    spec: raw,
    specUrl,
    sourceUrl: input.trim(),
  }
}
