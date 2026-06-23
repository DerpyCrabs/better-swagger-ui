import { describe, expect, it } from 'vitest'
import type { OpenAPIV3 } from 'openapi-types'
import schemasComposition from '../../tests/fixtures/openapi/schemas-composition.json'
import refsLimits from '../../tests/fixtures/openapi/refs-limits.json'
import requestBody from '../../tests/fixtures/openapi/request-body.json'
import {
  formatRequestBodySchemaForCopy,
  formatResponseSchemaForCopy,
  getRequestBodySchema,
  getResponseSchemas,
  primaryJsonMedia,
  resolveRef,
  resolveSchema,
  schemaProperties,
  schemaToExample,
  schemaTypeLabel,
} from './schema'

const compositionSpec = schemasComposition as OpenAPIV3.Document
const refsSpec = refsLimits as OpenAPIV3.Document
const bodySpec = requestBody as OpenAPIV3.Document

describe('resolveRef', () => {
  it('resolves internal refs', () => {
    const pet = resolveRef(compositionSpec, '#/components/schemas/Pet')
    expect(pet?.properties?.name).toBeDefined()
  })

  it('returns null for broken or external refs', () => {
    expect(resolveRef(compositionSpec, '#/components/schemas/Missing')).toBeNull()
    expect(resolveRef(compositionSpec, 'https://example.com/schema.json')).toBeNull()
  })
})

describe('resolveSchema', () => {
  it('merges allOf properties', () => {
    const schema = resolveRef(compositionSpec, '#/components/schemas/NamedPet')
    const resolved = resolveSchema(compositionSpec, schema ?? undefined)
    expect(resolved?.properties?.name).toBeDefined()
    expect(resolved?.properties?.createdAt).toBeDefined()
    expect(resolved?.properties?.species).toBeDefined()
  })

  it('detects circular refs', () => {
    const cyclic: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: { title: 'x', version: '1' },
      paths: {},
      components: {
        schemas: {
          A: { $ref: '#/components/schemas/B' },
          B: { $ref: '#/components/schemas/A' },
        },
      },
    }
    const a = resolveRef(cyclic, '#/components/schemas/A')
    expect(resolveSchema(cyclic, a ?? undefined)).toBeNull()
  })
})

describe('schemaTypeLabel', () => {
  it('labels arrays, refs, and enums', () => {
    const pet = resolveRef(compositionSpec, '#/components/schemas/Pet')!
    expect(schemaTypeLabel(compositionSpec, pet)).toBe('object')
    expect(
      schemaTypeLabel(compositionSpec, {
        type: 'array',
        items: { $ref: '#/components/schemas/Owner' },
      }),
    ).toBe('Owner[]')
    expect(
      schemaTypeLabel(compositionSpec, {
        type: 'array',
        items: { type: 'string' },
      }),
    ).toBe('string[]')
    expect(
      schemaTypeLabel(compositionSpec, {
        type: 'string',
        enum: ['a', 'b'],
      }),
    ).toBe('enum')
  })
})

describe('schemaProperties', () => {
  it('marks required fields and expandable refs', () => {
    const pet = resolveRef(compositionSpec, '#/components/schemas/Pet')!
    const props = schemaProperties(compositionSpec, pet)
    const name = props.find((p) => p.name === 'name')
    const owner = props.find((p) => p.name === 'owner')
    expect(name?.required).toBe(true)
    expect(owner?.expandableName).toBe('Owner')
  })
})

describe('schemaToExample', () => {
  it('prefers example over default over enum', () => {
    expect(schemaToExample(compositionSpec, { example: 1, default: 2, enum: [3] })).toBe(1)
    expect(schemaToExample(compositionSpec, { default: 2, enum: [3] })).toBe(2)
    expect(schemaToExample(compositionSpec, { enum: ['x', 'y'] })).toBe('x')
  })

  it('returns empty object for circular ref', () => {
    const cyclic: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: { title: 'x', version: '1' },
      paths: {},
      components: {
        schemas: {
          Node: { type: 'object', properties: { child: { $ref: '#/components/schemas/Node' } } },
        },
      },
    }
    const node = resolveRef(cyclic, '#/components/schemas/Node')!
    const example = schemaToExample(cyclic, node) as Record<string, unknown>
    expect(example).toEqual({ child: { child: {} } })
  })
})

describe('getRequestBodySchema', () => {
  it('returns inline request body media', () => {
    const op = bodySpec.paths['/items']!.post!
    const info = getRequestBodySchema(bodySpec, op.requestBody)
    expect(info?.required).toBe(true)
    expect(info?.media.length).toBeGreaterThan(1)
  })

  it('returns null for $ref request body', () => {
    const op = refsSpec.paths['/items']!.post!
    expect(getRequestBodySchema(refsSpec, op.requestBody)).toBeNull()
  })
})

describe('getResponseSchemas', () => {
  it('sorts status codes with default last', () => {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: { title: 'x', version: '1' },
      paths: {
        '/x': {
          get: {
            responses: {
              default: { description: 'd' },
              '400': { description: 'bad' },
              '200': {
                description: 'ok',
                content: { 'application/json': { schema: { type: 'object' } } },
              },
            },
          },
        },
      },
    }
    const statuses = getResponseSchemas(spec, spec.paths['/x']!.get!.responses).map((r) => r.status)
    expect(statuses).toEqual(['200', '400', 'default'])
  })

  it('returns empty media for $ref responses', () => {
    const op = refsSpec.paths['/items']!.post!
    const responses = getResponseSchemas(refsSpec, op.responses)
    expect(responses[0]?.media).toEqual([])
  })
})

describe('primaryJsonMedia', () => {
  it('prefers json content types', () => {
    const op = bodySpec.paths['/items']!.post!
    const info = getRequestBodySchema(bodySpec, op.requestBody)!
    const primary = primaryJsonMedia(info)
    expect(primary?.contentType).toBe('application/json')
  })
})

describe('schema copy helpers', () => {
  it('copies only the request body schema', () => {
    const op = bodySpec.paths['/items']!.post!
    const info = getRequestBodySchema(bodySpec, op.requestBody)!
    const copied = JSON.parse(formatRequestBodySchemaForCopy(info))

    expect(copied.type).toBe('object')
    expect(copied.properties.name).toEqual({ type: 'string' })
    expect(copied).not.toHaveProperty('contentType')
    expect(copied).not.toHaveProperty('example')
  })

  it('copies only the response schema', () => {
    const op = compositionSpec.paths['/pets/{id}']!.get!
    const response = getResponseSchemas(compositionSpec, op.responses)[0]!
    const copied = JSON.parse(formatResponseSchemaForCopy(response))

    expect(copied.properties.name).toEqual({ type: 'string' })
    expect(copied).not.toHaveProperty('status')
    expect(copied).not.toHaveProperty('schemaName')
    expect(copied).not.toHaveProperty('example')
  })
})
