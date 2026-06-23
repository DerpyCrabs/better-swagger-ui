import { describe, expect, it } from 'vitest'
import {
  exportSchemaLinkCatalog,
  findSchemaLinkMatch,
  normalizeSchemaLinkCatalog,
  parseSchemaLinkCatalog,
} from './schema-links'

describe('schema-links', () => {
  it('normalizes flat and grouped catalog items', () => {
    const catalog = normalizeSchemaLinkCatalog({
      version: 1,
      items: [
        {
          type: 'link',
          name: 'Gateway',
          url: 'https://example.test/swagger-ui/index.html#/',
        },
        {
          type: 'group',
          name: 'Product Type',
          links: [
            { name: 'dev', url: 'https://dev.example.test/swagger-ui/index.html' },
            { name: 'stable', url: 'https://stable.example.test/swagger-ui/index.html' },
          ],
        },
      ],
    })

    expect(catalog.items[0]).toMatchObject({
      type: 'link',
      id: 'gateway',
      url: 'https://example.test/swagger-ui/index.html',
    })
    expect(catalog.items[1]).toMatchObject({
      type: 'group',
      id: 'product-type',
    })
  })

  it('finds active URLs in standalone and grouped links', () => {
    const catalog = parseSchemaLinkCatalog(`{
      "version": 1,
      "items": [
        { "type": "link", "name": "Gateway", "url": "https://example.test/swagger-ui/index.html" },
        {
          "type": "group",
          "name": "Product Type",
          "links": [
            { "name": "dev", "url": "https://dev.example.test/swagger-ui/index.html" }
          ]
        }
      ]
    }`)

    expect(findSchemaLinkMatch(catalog, 'https://example.test/swagger-ui/index.html#/')?.label).toBe('Gateway')
    expect(findSchemaLinkMatch(catalog, 'https://dev.example.test/swagger-ui/index.html')?.label).toBe(
      'Product Type / dev',
    )
  })

  it('rejects invalid imports', () => {
    expect(() =>
      normalizeSchemaLinkCatalog({
        version: 1,
        items: [{ type: 'link', name: 'Bad', url: 'ftp://example.test/openapi.json' }],
      }),
    ).toThrow(/http/)
  })

  it('exports stable JSON with a trailing newline', () => {
    const catalog = normalizeSchemaLinkCatalog({
      version: 1,
      items: [{ type: 'link', name: 'Gateway', url: 'https://example.test/swagger-ui/index.html' }],
    })

    expect(exportSchemaLinkCatalog(catalog)).toContain('"version": 1')
    expect(exportSchemaLinkCatalog(catalog).endsWith('\n')).toBe(true)
  })
})
