import { describe, expect, it } from 'vitest'
import type { OpenAPIV3 } from 'openapi-types'
import paramsFull from '../../tests/fixtures/openapi/params-full.json'
import {
  appendQueryParam,
  emptyParamValues,
  resolveParameterMeta,
  validateAllParams,
  validateParamValue,
  type ParamInputMeta,
} from './param-schema'
import { collectOperations } from './operations'

const spec = paramsFull as OpenAPIV3.Document

function getUserOp() {
  const grouped = collectOperations(spec)
  return [...grouped.values()].flat()[0]!
}

describe('resolveParameterMeta', () => {
  it('includes path, query, and header parameters', () => {
    const item = getUserOp()
    const defs = resolveParameterMeta(spec, item)
    const names = defs.map((d) => d.name)
    expect(names).toContain('id')
    expect(names).toContain('X-Request-Id')
    expect(names).toContain('status')
    expect(names).not.toContain('session')
  })

  it('resolves $ref parameters', () => {
    const item = getUserOp()
    const status = resolveParameterMeta(spec, item).find((d) => d.name === 'status')
    expect(status?.kind).toBe('enum')
    expect(status?.enumValues).toEqual(['active', 'inactive'])
  })
})

describe('emptyParamValues', () => {
  it('uses defaults and examples', () => {
    const defs = resolveParameterMeta(spec, getUserOp())
    const values = emptyParamValues(defs)
    expect(values.id).toBe('550e8400-e29b-41d4-a716-446655440000')
    expect(values.limit).toBe('10')
  })
})

describe('validateParamValue', () => {
  const uuidMeta: ParamInputMeta = {
    name: 'id',
    in: 'path',
    required: true,
    schemaType: 'string',
    kind: 'string',
    format: 'uuid',
  }

  it('requires non-empty values', () => {
    expect(validateParamValue(uuidMeta, '')).toBe('Required')
  })

  it('validates uuid and email', () => {
    expect(validateParamValue(uuidMeta, 'not-a-uuid')).toMatch(/UUID/)
    expect(
      validateParamValue(
        { ...uuidMeta, format: 'email', name: 'email' },
        'bad',
      ),
    ).toMatch(/email/)
  })

  it('validates enum and integer bounds', () => {
    expect(
      validateParamValue(
        {
          name: 'status',
          in: 'query',
          required: false,
          schemaType: 'enum',
          kind: 'enum',
          enumValues: ['active', 'inactive'],
        },
        'unknown',
      ),
    ).toMatch(/Must be one of/)

    expect(
      validateParamValue(
        {
          name: 'limit',
          in: 'query',
          required: false,
          schemaType: 'integer',
          kind: 'integer',
          minimum: 1,
          maximum: 100,
        },
        '200',
      ),
    ).toMatch(/Maximum/)
  })

  it('validates array items from CSV', () => {
    const item = getUserOp()
    const include = resolveParameterMeta(spec, item).find((d) => d.name === 'include')!
    expect(validateParamValue(include, 'profile,invalid')).toMatch(/Invalid array item/)
    expect(validateParamValue(include, 'profile,settings')).toBeNull()
  })

  it('ignores invalid regex patterns', () => {
    expect(
      validateParamValue(
        {
          name: 'code',
          in: 'query',
          required: false,
          schemaType: 'string',
          kind: 'string',
          pattern: '[invalid',
        },
        'anything',
      ),
    ).toBeNull()
  })
})

describe('validateAllParams', () => {
  it('aggregates errors', () => {
    const defs = resolveParameterMeta(spec, getUserOp())
    const errors = validateAllParams(defs, {})
    expect(errors.id).toBe('Required')
  })
})

describe('appendQueryParam', () => {
  it('sets scalar and repeats array keys', () => {
    const query = new URLSearchParams()
    appendQueryParam(
      query,
      {
        name: 'q',
        in: 'query',
        required: false,
        schemaType: 'string',
        kind: 'string',
      },
      'hello',
    )
    expect(query.get('q')).toBe('hello')

    const arrayQuery = new URLSearchParams()
    appendQueryParam(
      arrayQuery,
      {
        name: 'tags',
        in: 'query',
        required: false,
        schemaType: 'array',
        kind: 'array',
        arrayItemKind: 'string',
      },
      'a, b',
    )
    expect(arrayQuery.getAll('tags')).toEqual(['a', 'b'])
  })

  it('skips empty values', () => {
    const query = new URLSearchParams()
    appendQueryParam(
      query,
      {
        name: 'q',
        in: 'query',
        required: false,
        schemaType: 'string',
        kind: 'string',
      },
      '   ',
    )
    expect(query.has('q')).toBe(false)
  })
})
