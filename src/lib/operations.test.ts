import { describe, expect, it } from 'vitest'
import multiTag from '../../tests/fixtures/openapi/multi-tag.json'
import type { OpenAPIV3 } from 'openapi-types'
import {
  collectOperations,
  findOperationTag,
  operationExists,
  tagDescriptions,
} from './operations'

const spec = multiTag as OpenAPIV3.Document

describe('collectOperations', () => {
  it('groups by tag and sorts paths', () => {
    const grouped = collectOperations(spec)
    expect(grouped.has('alpha')).toBe(true)
    expect(grouped.has('beta')).toBe(true)
    expect(grouped.get('alpha')!.map((o) => o.path)).toEqual(['/alpha/a', '/alpha/b'])
  })

  it('uses default tag when missing', () => {
    const minimal: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: { title: 'x', version: '1' },
      paths: {
        '/x': { get: { responses: { '200': { description: 'ok' } } } },
      },
    }
    expect(collectOperations(minimal).has('default')).toBe(true)
  })
})

describe('tagDescriptions', () => {
  it('maps tag descriptions', () => {
    const map = tagDescriptions(spec)
    expect(map.get('alpha')).toBe('Alpha operations')
  })
})

describe('findOperationTag and operationExists', () => {
  it('finds operation by id', () => {
    const grouped = collectOperations(spec)
    expect(findOperationTag(grouped, 'get:/alpha/a')).toBe('alpha')
    expect(operationExists(grouped, 'get:/beta/x')).toBe(true)
    expect(operationExists(grouped, 'get:/missing')).toBe(false)
  })
})
