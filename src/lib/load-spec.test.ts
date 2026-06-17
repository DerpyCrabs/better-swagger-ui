import { describe, expect, it } from 'vitest'
import minimalJson from '../../tests/fixtures/openapi/minimal.json'
import { loadSpecFromText, validateOpenApiDocument } from './load-spec'
import { looksLikeSpecText, parseSpecText } from './parse-spec'

const minimalYaml = `
openapi: 3.0.3
info:
  title: Minimal API
  version: 1.0.0
paths:
  /pets:
    get:
      responses:
        '200':
          description: OK
`

describe('parseSpecText', () => {
  it('parses JSON spec text', () => {
    const parsed = parseSpecText(JSON.stringify(minimalJson))
    expect(parsed).toEqual(minimalJson)
  })

  it('parses YAML spec text', () => {
    const parsed = parseSpecText(minimalYaml) as { info?: { title?: string } }
    expect(parsed.info?.title).toBe('Minimal API')
  })

  it('rejects invalid YAML', () => {
    expect(() => parseSpecText('openapi: [invalid yaml')).toThrow(/Invalid YAML/)
  })

  it('rejects invalid JSON', () => {
    expect(() => parseSpecText('{not json')).toThrow(/Invalid JSON/)
  })
})

describe('looksLikeSpecText', () => {
  it('detects YAML and JSON OpenAPI content', () => {
    expect(looksLikeSpecText(minimalYaml)).toBe(true)
    expect(looksLikeSpecText(JSON.stringify(minimalJson))).toBe(true)
    expect(looksLikeSpecText('https://example.com/swagger-ui/')).toBe(false)
  })
})

describe('loadSpecFromText', () => {
  it('loads YAML content into LoadedSpec', () => {
    const loaded = loadSpecFromText('minimal.yaml', minimalYaml)
    expect(loaded.spec.info.title).toBe('Minimal API')
    expect(loaded.sourceUrl).toBe('minimal.yaml')
    expect(loaded.definitions).toEqual([{ name: 'default', url: 'minimal.yaml' }])
  })
})

describe('validateOpenApiDocument', () => {
  it('accepts valid OpenAPI 3 document', () => {
    expect(validateOpenApiDocument(minimalJson)).toEqual(minimalJson)
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
      }),
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
