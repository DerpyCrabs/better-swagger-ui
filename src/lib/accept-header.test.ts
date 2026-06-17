import { describe, expect, it } from 'vitest'
import type { OpenAPIV3 } from 'openapi-types'
import {
  buildAcceptHeader,
  collectResponseContentTypes,
  prefersBinaryResponse,
} from './accept-header'

describe('collectResponseContentTypes', () => {
  it('returns empty for operation without responses', () => {
    expect(collectResponseContentTypes({})).toEqual([])
  })

  it('skips $ref responses and dedupes MIME types', () => {
    const operation: OpenAPIV3.OperationObject = {
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
    }

    expect(collectResponseContentTypes(operation)).toEqual([
      'text/plain',
      'application/json',
    ])
  })
})

describe('buildAcceptHeader', () => {
  it('uses default when no content types', () => {
    expect(buildAcceptHeader({})).toBe('application/json, text/plain, */*')
  })

  it('prioritizes JSON over csv and appends */*', () => {
    const operation: OpenAPIV3.OperationObject = {
      responses: {
        '200': {
          content: {
            'text/csv': { schema: { type: 'string' } },
            'application/json': { schema: { type: 'object' } },
          },
        },
      },
    }

    expect(buildAcceptHeader(operation)).toBe('text/csv, application/json, */*')
  })
})

describe('prefersBinaryResponse', () => {
  it('returns false when no content types', () => {
    expect(prefersBinaryResponse({})).toBe(false)
  })

  it('returns true when highest priority is binary/csv', () => {
    const csvOnly: OpenAPIV3.OperationObject = {
      responses: {
        '200': { content: { 'text/csv': { schema: { type: 'string' } } } },
      },
    }
    expect(prefersBinaryResponse(csvOnly)).toBe(true)

    const jsonOnly: OpenAPIV3.OperationObject = {
      responses: {
        '200': { content: { 'application/json': { schema: { type: 'object' } } } },
      },
    }
    expect(prefersBinaryResponse(jsonOnly)).toBe(false)
  })
})
