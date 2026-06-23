import { describe, expect, it } from 'vitest'
import { sourceFromQueryKey, specQueryKey } from './spec-query'

describe('sourceFromQueryKey', () => {
  it('parses url query keys', () => {
    const key = specQueryKey({ kind: 'url', sourceUrl: 'https://example.com', definition: 'API B' })
    expect(sourceFromQueryKey(key)).toEqual({
      kind: 'url',
      sourceUrl: 'https://example.com',
      definition: 'API B',
    })
  })

  it('parses url query keys with empty definition as null', () => {
    const key = specQueryKey({ kind: 'url', sourceUrl: 'https://example.com', definition: null })
    expect(sourceFromQueryKey(key)).toEqual({
      kind: 'url',
      sourceUrl: 'https://example.com',
      definition: null,
    })
  })

  it('parses text query keys', () => {
    const key = specQueryKey({ kind: 'text', label: 'spec.yaml', text: 'openapi: 3.0.0' })
    expect(sourceFromQueryKey(key)).toEqual({
      kind: 'text',
      label: 'spec.yaml',
      text: 'openapi: 3.0.0',
    })
  })

  it('returns null for idle keys', () => {
    expect(sourceFromQueryKey(['spec', 'idle'])).toBeNull()
  })
})
