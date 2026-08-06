import { describe, expect, it } from 'vitest'
import type { OpenAPIV3 } from 'openapi-types'
import multiTag from '../../tests/fixtures/openapi/multi-tag.json'
import { collectOperations, tagDescriptions, type OperationItem } from './operations'
import {
  MIN_OPERATION_SEARCH_LENGTH,
  buildOperationSearchIndex,
  filterOperationGroups,
  isActiveOperationSearch,
} from './operation-search'

const spec = multiTag as OpenAPIV3.Document

function ops(specDoc: OpenAPIV3.Document, query: string) {
  const index = buildOperationSearchIndex(collectOperations(specDoc), tagDescriptions(specDoc))
  return filterOperationGroups(index, query)
}

function opIds(groups: ReturnType<typeof ops>): string[] {
  return groups.flatMap((group) => group.operations.map((item) => item.id))
}

describe('isActiveOperationSearch', () => {
  it('requires at least 3 characters', () => {
    expect(MIN_OPERATION_SEARCH_LENGTH).toBe(3)
    expect(isActiveOperationSearch('')).toBe(false)
    expect(isActiveOperationSearch('g')).toBe(false)
    expect(isActiveOperationSearch('ge')).toBe(false)
    expect(isActiveOperationSearch('get')).toBe(true)
    expect(isActiveOperationSearch('  ab  ')).toBe(false)
    expect(isActiveOperationSearch('  abc  ')).toBe(true)
  })
})

describe('filterOperationGroups', () => {
  it('returns all groups unchanged for empty or short queries', () => {
    for (const query of ['', '  ', 'a', 'al']) {
      const groups = ops(spec, query)
      expect(groups.map((g) => g.tag)).toEqual(['alpha', 'beta', 'gamma'])
      expect(opIds(groups)).toEqual([
        'get:/alpha/a',
        'post:/alpha/b',
        'get:/beta/x',
        'put:/gamma/y',
      ])
    }
  })

  it('matches tag name and includes whole group', () => {
    const groups = ops(spec, 'alpha')
    expect(groups).toHaveLength(1)
    expect(groups[0]!.tag).toBe('alpha')
    expect(opIds(groups)).toEqual(['get:/alpha/a', 'post:/alpha/b'])
  })

  it('matches tag description', () => {
    const groups = ops(spec, 'beta operations')
    expect(groups.map((g) => g.tag)).toEqual(['beta'])
  })

  it('matches path / url with higher priority than summary', () => {
    const custom: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: { title: 'x', version: '1' },
      tags: [{ name: 'pets', description: 'Pet stuff' }],
      paths: {
        '/animals': {
          get: {
            tags: ['pets'],
            summary: 'List pets by name',
            description: 'Returns pets',
            responses: { '200': { description: 'ok' } },
          },
        },
        '/pets': {
          get: {
            tags: ['pets'],
            summary: 'Something else',
            description: 'unrelated',
            responses: { '200': { description: 'ok' } },
          },
        },
        '/other': {
          get: {
            tags: ['pets'],
            summary: 'x',
            description: 'mentions pets in description only',
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    }

    const groups = ops(custom, 'pets')
    const ids = groups[0]!.operations.map((item: OperationItem) => item.id)
    expect(ids[0]).toBe('get:/pets')
    expect(ids.indexOf('get:/animals')).toBeLessThan(ids.indexOf('get:/other'))
  })

  it('supports leading method filter with path', () => {
    const groups = ops(spec, 'get /alpha')
    expect(opIds(groups)).toEqual(['get:/alpha/a'])
  })

  it('method-only query returns ops of that method', () => {
    const groups = ops(spec, 'POST')
    expect(opIds(groups)).toEqual(['post:/alpha/b'])
  })

  it('matches path segments without leading slash', () => {
    const groups = ops(spec, 'gamma/y')
    expect(opIds(groups)).toEqual(['put:/gamma/y'])
  })

  it('matches operation summary without loose single-token path hits', () => {
    const groups = ops(spec, 'Alpha B')
    expect(opIds(groups)).toEqual(['post:/alpha/b'])
  })

  it('ranks groups by best score', () => {
    const custom: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: { title: 'x', version: '1' },
      tags: [
        { name: 'users', description: 'User admin' },
        { name: 'misc', description: 'users mentioned here' },
      ],
      paths: {
        '/users': {
          get: {
            tags: ['users'],
            summary: 'List',
            responses: { '200': { description: 'ok' } },
          },
        },
        '/misc/x': {
          get: {
            tags: ['misc'],
            summary: 'Misc',
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    }

    const groups = ops(custom, 'users')
    expect(groups[0]!.tag).toBe('users')
    expect(groups.map((g) => g.tag)).toContain('misc')
  })

  it('returns empty when nothing matches', () => {
    expect(ops(spec, 'zzz-no-match')).toEqual([])
  })
})
