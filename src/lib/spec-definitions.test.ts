import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from './query-client'
import {
  discoverSpecDefinitions,
  isPlaceholderSpecUrl,
  parseInitializerConfigUrl,
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

  it('parses quoted configUrl key in initializer', () => {
    const text = `"configUrl" : "/nested-app/v3/api-docs/swagger-config",`
    expect(parseInitializerConfigUrl(text, base)).toBe(
      'http://localhost:5199/nested-app/v3/api-docs/swagger-config',
    )
  })
})

describe('discoverSpecDefinitions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()
  })

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

  it('loads from initializer configUrl under nested context path', async () => {
    mockedFetchText.mockResolvedValueOnce(`
      window.ui = SwaggerUIBundle({
        url: "",
        "configUrl": "/nested-app/v3/api-docs/swagger-config",
      })
    `)
    mockedFetchJson.mockResolvedValueOnce({
      urls: [
        { url: '/openapi/a.json', name: 'API A' },
        { url: '/openapi/b.json', name: 'API B' },
      ],
    })

    const defs = await discoverSpecDefinitions(
      'http://localhost:5199/nested-app/swagger-ui/index.html',
    )

    expect(defs).toHaveLength(2)
    expect(mockedFetchJson).toHaveBeenCalledWith(
      'http://localhost:5199/nested-app/v3/api-docs/swagger-config',
    )
    expect(mockedFetchJson).not.toHaveBeenCalledWith('http://localhost:5199/swagger-config')
  })

  it('does not probe root swagger-config when swagger-ui has a context path', async () => {
    mockedFetchText.mockRejectedValue(new Error('404'))
    mockedFetchJson.mockImplementation(async (url: string) => {
      if (url === 'http://localhost:5199/nested-app/v3/api-docs/swagger-config') {
        return {
          urls: [
            { url: '/openapi/a.json', name: 'API A' },
            { url: '/openapi/b.json', name: 'API B' },
          ],
        }
      }
      throw new Error(`unexpected config url: ${url}`)
    })

    const defs = await discoverSpecDefinitions(
      'http://localhost:5199/nested-app/swagger-ui/index.html',
    )

    expect(defs).toHaveLength(2)
    expect(mockedFetchJson).not.toHaveBeenCalledWith('http://localhost:5199/swagger-config')
    expect(mockedFetchJson).not.toHaveBeenCalledWith(
      'http://localhost:5199/v3/api-docs/swagger-config',
    )
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
