import { describe, expect, it } from 'vitest'
import type { ParamInputMeta } from './param-schema'
import { buildUrl, resolveServerUrl } from './build-request-url'

describe('resolveServerUrl', () => {
  it('returns absolute server URLs unchanged', () => {
    expect(resolveServerUrl('https://api.example.com/v1', 'https://spec.example/openapi.json')).toBe(
      'https://api.example.com/v1',
    )
  })

  it('resolves relative server URLs against spec origin', () => {
    expect(resolveServerUrl('/api', 'https://spec.example/openapi.json')).toBe(
      'https://spec.example/api',
    )
  })
})

describe('buildUrl', () => {
  const pathParam: ParamInputMeta = {
    name: 'id',
    in: 'path',
    required: true,
    schemaType: 'string',
    kind: 'string',
  }

  const queryScalar: ParamInputMeta = {
    name: 'q',
    in: 'query',
    required: false,
    schemaType: 'string',
    kind: 'string',
  }

  const queryArray: ParamInputMeta = {
    name: 'tags',
    in: 'query',
    required: false,
    schemaType: 'array',
    kind: 'array',
    arrayItemKind: 'string',
  }

  const headerParam: ParamInputMeta = {
    name: 'X-Custom',
    in: 'header',
    required: false,
    schemaType: 'string',
    kind: 'string',
  }

  it('substitutes path params with encoding', () => {
    const url = buildUrl(
      'http://localhost:5199/mock-api',
      'http://localhost:5199/openapi/spec.json',
      '/users/{id}',
      [pathParam],
      { id: 'hello world' },
    )
    expect(url).toBe('http://localhost:5199/mock-api/users/hello%20world')
  })

  it('builds query string from scalars and arrays', () => {
    const url = buildUrl(
      'http://localhost:5199/mock-api',
      'http://localhost:5199/openapi/spec.json',
      '/search',
      [queryScalar, queryArray],
      { q: 'test', tags: 'a,b' },
    )
    expect(url).toBe('http://localhost:5199/mock-api/search?q=test&tags=a&tags=b')
  })

  it('excludes header params from URL', () => {
    const url = buildUrl(
      'http://localhost:5199/mock-api',
      'http://localhost:5199/openapi/spec.json',
      '/items',
      [headerParam],
      { 'X-Custom': 'secret' },
    )
    expect(url).toBe('http://localhost:5199/mock-api/items')
  })
})
