import { describe, expect, it } from 'vite-plus/test'
import type { OpenAPIV3 } from 'openapi-types'
import {
  buildAcceptHeader,
  collectResponseContentTypes,
  prefersBinaryResponse,
} from './accept-header'

describe('collectResponseContentTypes', () => {
  it('returns empty for operation without responses', () => {
    expect(collectResponseContentTypes({} as OpenAPIV3.OperationObject)).toEqual([])
  })

  it('skips $ref responses and dedupes MIME types', () => {
    const operation = {
      responses: {
        '200': {
          content: {
            'application/json': { schema: { type: 'object' } },
            'text/plain': { schema: { type: 'string' } },
          },
        },
        '400': {
          content: {
            'application/json': { schema: { type: 'object' } },
          },
        },
        '500': { $ref: '#/components/responses/Error' },
      },
    } as unknown as OpenAPIV3.OperationObject

    expect(collectResponseContentTypes(operation)).toEqual(['text/plain', 'application/json'])
  })
})

describe('buildAcceptHeader', () => {
  it('uses default when no content types', () => {
    expect(buildAcceptHeader({} as OpenAPIV3.OperationObject)).toBe(
      'application/json, text/plain, */*',
    )
  })

  it('prioritizes JSON over csv and appends */*', () => {
    const operation = {
      responses: {
        '200': {
          content: {
            'text/csv': { schema: { type: 'string' } },
            'application/json': { schema: { type: 'object' } },
          },
        },
      },
    } as unknown as OpenAPIV3.OperationObject

    expect(buildAcceptHeader(operation)).toBe('text/csv, application/json, */*')
  })
})

describe('prefersBinaryResponse', () => {
  it('returns false when no content types', () => {
    expect(prefersBinaryResponse({} as OpenAPIV3.OperationObject)).toBe(false)
  })

  it('returns true when highest priority is binary/csv', () => {
    const csvOnly = {
      responses: {
        '200': { content: { 'text/csv': { schema: { type: 'string' } } } },
      },
    } as unknown as OpenAPIV3.OperationObject
    expect(prefersBinaryResponse(csvOnly)).toBe(true)

    const jsonOnly = {
      responses: {
        '200': { content: { 'application/json': { schema: { type: 'object' } } } },
      },
    } as unknown as OpenAPIV3.OperationObject
    expect(prefersBinaryResponse(jsonOnly)).toBe(false)
  })
})
