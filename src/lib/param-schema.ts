import type { OpenAPIV3 } from 'openapi-types'
import type { OperationItem } from './operations'
import { resolveSchema, schemaTypeLabel } from './schema'

type SchemaObject = OpenAPIV3.SchemaObject

export type ParamInputKind = 'string' | 'integer' | 'number' | 'boolean' | 'enum' | 'array'

export interface ParamInputMeta {
  name: string
  in: 'path' | 'query' | 'header' | 'cookie'
  required: boolean
  description?: string
  schemaType: string
  kind: ParamInputKind
  enumValues?: string[]
  format?: string
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  arrayItemKind?: ParamInputKind
  arrayItemEnum?: string[]
  defaultValue?: string
  example?: string
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function schemaKind(schema: SchemaObject | null): ParamInputKind {
  if (!schema) return 'string'
  if (schema.enum?.length) return 'enum'
  if (schema.type === 'boolean') return 'boolean'
  if (schema.type === 'integer') return 'integer'
  if (schema.type === 'number') return 'number'
  if (schema.type === 'array') return 'array'
  return 'string'
}

function enumStrings(values: unknown[] | undefined): string[] | undefined {
  if (!values?.length) return undefined
  return values.map(String)
}

function exampleAsString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (Array.isArray(value)) return value.map(String).join(', ')
  return String(value)
}

function arrayItemMeta(
  spec: OpenAPIV3.Document,
  schema: SchemaObject | null,
): Pick<ParamInputMeta, 'arrayItemKind' | 'arrayItemEnum'> {
  if (!schema || schema.type !== 'array' || !schema.items) {
    return { arrayItemKind: 'string' }
  }

  const itemSchema = resolveSchema(spec, schema.items)
  if (!itemSchema) {
    return { arrayItemKind: 'string' }
  }

  return {
    arrayItemKind: schemaKind(itemSchema),
    arrayItemEnum: enumStrings(itemSchema.enum),
  }
}

function buildMeta(
  spec: OpenAPIV3.Document,
  param: OpenAPIV3.ParameterObject,
): ParamInputMeta {
  const resolved = param.schema ? resolveSchema(spec, param.schema) : null
  const kind = schemaKind(resolved)
  const arrayItems = kind === 'array' ? arrayItemMeta(spec, resolved) : {}

  const defaultValue =
    exampleAsString(resolved?.default) ??
    exampleAsString(param.schema && !('$ref' in param.schema) ? param.schema.default : undefined) ??
    exampleAsString(param.example) ??
    exampleAsString(resolved?.example)

  return {
    name: param.name,
    in: param.in as ParamInputMeta['in'],
    required: Boolean(param.required),
    description: param.description ?? resolved?.description,
    schemaType: param.schema ? schemaTypeLabel(spec, param.schema) : 'string',
    kind,
    enumValues: enumStrings(resolved?.enum),
    format: resolved?.format,
    minimum: resolved?.minimum,
    maximum: resolved?.maximum,
    minLength: resolved?.minLength,
    maxLength: resolved?.maxLength,
    pattern: resolved?.pattern,
    defaultValue,
    example: exampleAsString(param.example ?? resolved?.example),
    ...arrayItems,
  }
}

function resolveParameterObject(
  spec: OpenAPIV3.Document,
  param: OpenAPIV3.ParameterObject | OpenAPIV3.ReferenceObject,
): OpenAPIV3.ParameterObject | null {
  if (!('$ref' in param)) return param

  if (!param.$ref.startsWith('#/')) return null

  let current: unknown = spec
  for (const part of param.$ref.slice(2).split('/')) {
    if (!current || typeof current !== 'object') return null
    current = (current as Record<string, unknown>)[part]
  }

  if (!current || typeof current !== 'object' || '$ref' in current) return null
  return current as OpenAPIV3.ParameterObject
}

export function resolveParameterMeta(
  spec: OpenAPIV3.Document,
  item: OperationItem,
): ParamInputMeta[] {
  return (item.operation.parameters ?? [])
    .map((param) => resolveParameterObject(spec, param))
    .filter((param): param is OpenAPIV3.ParameterObject => param !== null)
    .filter((param) => param.in === 'path' || param.in === 'query' || param.in === 'header')
    .map((param) => buildMeta(spec, param))
}

export function emptyParamValues(defs: ParamInputMeta[]): Record<string, string> {
  return Object.fromEntries(
    defs.map((param) => [param.name, param.defaultValue ?? '']),
  )
}

function validateStringValue(meta: ParamInputMeta, value: string): string | null {
  if (meta.minLength !== undefined && value.length < meta.minLength) {
    return `Minimum length is ${meta.minLength}`
  }

  if (meta.maxLength !== undefined && value.length > meta.maxLength) {
    return `Maximum length is ${meta.maxLength}`
  }

  if (meta.pattern) {
    try {
      if (!new RegExp(meta.pattern).test(value)) {
        return 'Value does not match required pattern'
      }
    } catch {
      // ignore invalid patterns from spec
    }
  }

  if (meta.format === 'uuid' && !UUID_RE.test(value)) {
    return 'Must be a valid UUID'
  }

  if (meta.format === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return 'Must be a valid email'
  }

  if (meta.format === 'date' && Number.isNaN(Date.parse(value))) {
    return 'Must be a valid date'
  }

  if (meta.format === 'date-time' && Number.isNaN(Date.parse(value))) {
    return 'Must be a valid date-time'
  }

  return null
}

function validateScalar(meta: ParamInputMeta, value: string): string | null {
  switch (meta.kind) {
    case 'boolean':
      if (value !== 'true' && value !== 'false') {
        return 'Must be true or false'
      }
      return null

    case 'integer': {
      if (!/^-?\d+$/.test(value)) return 'Must be an integer'
      const parsed = Number(value)
      if (meta.minimum !== undefined && parsed < meta.minimum) {
        return `Minimum value is ${meta.minimum}`
      }
      if (meta.maximum !== undefined && parsed > meta.maximum) {
        return `Maximum value is ${meta.maximum}`
      }
      return null
    }

    case 'number': {
      if (!/^-?\d+(\.\d+)?$/.test(value)) return 'Must be a number'
      const parsed = Number(value)
      if (Number.isNaN(parsed)) return 'Must be a number'
      if (meta.minimum !== undefined && parsed < meta.minimum) {
        return `Minimum value is ${meta.minimum}`
      }
      if (meta.maximum !== undefined && parsed > meta.maximum) {
        return `Maximum value is ${meta.maximum}`
      }
      return null
    }

    case 'enum':
      if (meta.enumValues && !meta.enumValues.includes(value)) {
        return `Must be one of: ${meta.enumValues.join(', ')}`
      }
      return null

    case 'string':
      return validateStringValue(meta, value)

    default:
      return null
  }
}

export function validateParamValue(meta: ParamInputMeta, value: string): string | null {
  const trimmed = value.trim()

  if (meta.required && !trimmed) {
    return 'Required'
  }

  if (!trimmed) return null

  if (meta.kind === 'array') {
    const items = trimmed.split(',').map((part) => part.trim()).filter(Boolean)
    if (items.length === 0) {
      return meta.required ? 'Required' : null
    }

    const itemMeta: ParamInputMeta = {
      ...meta,
      kind: meta.arrayItemEnum?.length
        ? 'enum'
        : (meta.arrayItemKind ?? 'string'),
      enumValues: meta.arrayItemEnum,
      required: true,
    }

    for (const item of items) {
      const error = validateScalar(itemMeta, item)
      if (error) return `Invalid array item "${item}": ${error}`
    }

    return null
  }

  return validateScalar(meta, trimmed)
}

export function validateAllParams(
  defs: ParamInputMeta[],
  values: Record<string, string>,
): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const param of defs) {
    const error = validateParamValue(param, values[param.name] ?? '')
    if (error) errors[param.name] = error
  }
  return errors
}

export function appendQueryParam(
  query: URLSearchParams,
  meta: ParamInputMeta,
  value: string,
) {
  const trimmed = value.trim()
  if (!trimmed) return

  if (meta.kind === 'array') {
    for (const part of trimmed.split(',').map((item) => item.trim()).filter(Boolean)) {
      query.append(meta.name, part)
    }
    return
  }

  query.set(meta.name, trimmed)
}
