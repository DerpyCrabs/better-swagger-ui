import { describe, expect, it } from 'vitest'
import type { OpenAPIV3 } from 'openapi-types'
import minimal from '../../tests/fixtures/openapi/minimal.json'
import { validateOpenApiDocument } from './load-spec'

describe('validateOpenApiDocument', () => {
  it('accepts valid OpenAPI 3 document', () => {
    expect(validateOpenApiDocument(minimal)).toEqual(minimal)
  })

  it('accepts Swagger 2 shape with swagger + paths', () => {
    const swagger2 = {
      swagger: '2.0',
      info: { title: 'x', version: '1' },
      paths: { '/x': { get: { responses: { '200': { description: 'ok' } } } } },
    }
    expect(validateOpenApiDocument(swagger2)).toEqual(swagger2)
  })

  it('rejects missing version key', () => {
    expect(() =>
      validateOpenApiDocument({
        info: { title: 'x', version: '1' },
        paths: {},
      } as OpenAPIV3.Document),
    ).toThrow(/not an OpenAPI document/)
  })

  it('rejects missing paths', () => {
    expect(() =>
      validateOpenApiDocument({
        openapi: '3.0.0',
        info: { title: 'x', version: '1' },
      }),
    ).toThrow(/missing paths/)
  })

  it('rejects non-object input', () => {
    expect(() => validateOpenApiDocument(null)).toThrow(/Invalid OpenAPI/)
  })
})
