import { describe, expect, it, vi } from 'vitest'
import {
  discoverSpecDefinitions,
  isPlaceholderSpecUrl,
  parseInitializerUrls,
  pickDefinition,
  type SpecDefinition,
} from './spec-definitions'

vi.mock('./fetch-utils', () => ({
  fetchText: vi.fn(),
  fetchJson: vi.fn(),
  fetchSpec: vi.fn(),
}))

import { fetchJson, fetchSpec, fetchText } from './fetch-utils'

const mockedFetchText = vi.mocked(fetchText)
const mockedFetchJson = vi.mocked(fetchJson)
const mockedFetchSpec = vi.mocked(fetchSpec)

describe('pickDefinition', () => {
  const defs: SpecDefinition[] = [
    { name: 'API A', url: 'http://localhost/a.json' },
    { name: 'API B', url: 'http://localhost/b.json' },
  ]

  it('returns matching definition by name', () => {
    expect(pickDefinition(defs, 'API B').url).toBe('http://localhost/b.json')
  })

  it('falls back to first definition', () => {
    expect(pickDefinition(defs, 'missing').url).toBe('http://localhost/a.json')
    expect(pickDefinition(defs, null).url).toBe('http://localhost/a.json')
  })
})

describe('isPlaceholderSpecUrl', () => {
  it('detects petstore placeholder hosts', () => {
    expect(isPlaceholderSpecUrl('https://petstore.swagger.io/v2/swagger.json')).toBe(true)
    expect(isPlaceholderSpecUrl('https://api.example.com/openapi.json')).toBe(false)
  })
})

describe('parseInitializerUrls', () => {
  const base = new URL('http://localhost:5199/swagger-ui/')

  it('parses single url', () => {
    const text = `window.ui = SwaggerUIBundle({ url: "/openapi/minimal.json", dom_id: "#swagger-ui" });`
    expect(parseInitializerUrls(text, base)).toEqual([
      { name: 'default', url: 'http://localhost:5199/openapi/minimal.json' },
    ])
  })

  it('parses urls array entries', () => {
    const text = `
      urls: [
        { url: "/openapi/a.json", name: "API A" },
        { url: "/openapi/b.json", name: "API B" },
      ],
      dom_id: "#swagger-ui",
    `
    const result = parseInitializerUrls(text, base)
    expect(result).toEqual([
      { name: 'API A', url: 'http://localhost:5199/openapi/a.json' },
      { name: 'API B', url: 'http://localhost:5199/openapi/b.json' },
    ])
  })

  it('filters petstore placeholder single url', () => {
    const text = `url: "https://petstore.swagger.io/v2/swagger.json"`
    expect(parseInitializerUrls(text, base)).toBeNull()
  })
})

describe('discoverSpecDefinitions', () => {
  it('loads direct OpenAPI URL', async () => {
    mockedFetchSpec.mockResolvedValueOnce({
      openapi: '3.0.0',
      info: { title: 'Direct', version: '1' },
      paths: {},
    })

    const defs = await discoverSpecDefinitions('http://localhost:5199/openapi/minimal.json')
    expect(defs).toHaveLength(1)
    expect(defs[0].url).toBe('http://localhost:5199/openapi/minimal.json')
  })

  it('loads from ?url= query param on swagger UI page', async () => {
    const defs = await discoverSpecDefinitions(
      'http://localhost:5199/swagger-ui/query-url.html?url=/openapi/minimal.json',
    )
    expect(defs[0].url).toBe('http://localhost:5199/openapi/minimal.json')
  })

  it('loads from swagger-config', async () => {
    mockedFetchJson.mockResolvedValueOnce({
      urls: [
        { url: '/openapi/multi-definition-a.json', name: 'API A' },
        { url: '/openapi/multi-definition-b.json', name: 'API B' },
      ],
    })

    const defs = await discoverSpecDefinitions(
      'http://localhost:5199/swagger-ui/swagger-config/',
    )
    expect(defs).toHaveLength(2)
    expect(defs[0].name).toBe('API A')
  })

  it('loads from initializer single url', async () => {
    mockedFetchText.mockResolvedValueOnce(
      `window.ui = SwaggerUIBundle({ url: "/openapi/minimal.json", dom_id: "#swagger-ui" });`,
    )

    const defs = await discoverSpecDefinitions('http://localhost:5199/swagger-ui/single/index.html')
    expect(defs[0].url).toBe('http://localhost:5199/openapi/minimal.json')
  })

  it('throws when nothing found', async () => {
    mockedFetchText.mockRejectedValue(new Error('404'))
    mockedFetchJson.mockRejectedValue(new Error('404'))
    mockedFetchSpec.mockRejectedValue(new Error('404'))

    await expect(
      discoverSpecDefinitions('http://localhost:5199/swagger-ui/missing/index.html'),
    ).rejects.toThrow(/Could not find OpenAPI spec/)
  })
})
