import { describe, expect, it } from 'vitest'
import type { ParamInputMeta } from './param-schema'
import {
  appendQueryParam,
  serializeHeaderParamValue,
  serializePathParamValue,
} from './param-serialization'

function meta(partial: Partial<ParamInputMeta> & Pick<ParamInputMeta, 'name' | 'in' | 'kind'>): ParamInputMeta {
  return {
    required: false,
    schemaType: partial.kind,
    ...partial,
  }
}

describe('appendQueryParam', () => {
  it('serializes form arrays with explode true as repeated keys', () => {
    const query = new URLSearchParams()
    appendQueryParam(
      query,
      meta({ name: 'id', in: 'query', kind: 'array', style: 'form', explode: true }),
      '3,4,5',
    )
    expect(query.getAll('id')).toEqual(['3', '4', '5'])
  })

  it('serializes form arrays with explode false as comma-separated value', () => {
    const query = new URLSearchParams()
    appendQueryParam(
      query,
      meta({ name: 'id', in: 'query', kind: 'array', style: 'form', explode: false }),
      '3,4,5',
    )
    expect(query.get('id')).toBe('3,4,5')
  })

  it('serializes pipe-delimited arrays', () => {
    const query = new URLSearchParams()
    appendQueryParam(
      query,
      meta({ name: 'id', in: 'query', kind: 'array', style: 'pipeDelimited', explode: false }),
      '3|4|5',
    )
    expect(query.get('id')).toBe('3|4|5')
  })

  it('serializes deepObject query params', () => {
    const query = new URLSearchParams()
    appendQueryParam(
      query,
      meta({
        name: 'id',
        in: 'query',
        kind: 'object',
        style: 'deepObject',
        explode: true,
      }),
      '{"role":"admin","firstName":"Alex"}',
    )
    expect(query.get('id[role]')).toBe('admin')
    expect(query.get('id[firstName]')).toBe('Alex')
  })

  it('serializes form objects with explode true as separate keys', () => {
    const query = new URLSearchParams()
    appendQueryParam(
      query,
      meta({ name: 'user', in: 'query', kind: 'object', style: 'form', explode: true }),
      '{"role":"admin","firstName":"Alex"}',
    )
    expect(query.get('role')).toBe('admin')
    expect(query.get('firstName')).toBe('Alex')
  })
})

describe('serializePathParamValue', () => {
  it('joins path arrays with commas', () => {
    expect(
      serializePathParamValue(
        meta({ name: 'id', in: 'path', kind: 'array', style: 'simple', explode: false }),
        '3,4,5',
      ),
    ).toBe('3,4,5')
  })

  it('serializes path objects with simple style', () => {
    expect(
      serializePathParamValue(
        meta({ name: 'meta', in: 'path', kind: 'object', style: 'simple', explode: false }),
        '{"username":"demo"}',
      ),
    ).toBe('username,demo')
  })
})

describe('serializeHeaderParamValue', () => {
  it('serializes header objects with explode true', () => {
    expect(
      serializeHeaderParamValue(
        meta({ name: 'X-Meta', in: 'header', kind: 'object', style: 'simple', explode: true }),
        '{"role":"admin","firstName":"Alex"}',
      ),
    ).toBe('role=admin,firstName=Alex')
  })
})
