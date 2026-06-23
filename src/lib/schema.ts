import type { OpenAPIV3 } from 'openapi-types'

type SchemaObject = OpenAPIV3.SchemaObject
type ReferenceObject = OpenAPIV3.ReferenceObject

export interface SchemaProperty {
  name: string
  required: boolean
  type: string
  description?: string
  enum?: unknown[]
  expandableName?: string
  expandableSchema?: SchemaObject | ReferenceObject
}

export interface MediaSchemaInfo {
  contentType: string
  schema: SchemaObject | null
  schemaName: string | null
  example: unknown
  properties: SchemaProperty[]
}

export interface ResponseSchemaInfo {
  status: string
  description?: string
  media: MediaSchemaInfo[]
}

export interface RequestBodySchemaInfo {
  required: boolean
  description?: string
  media: MediaSchemaInfo[]
}

function isReference(value: unknown): value is ReferenceObject {
  return Boolean(value && typeof value === 'object' && '$ref' in value)
}

function refName(ref: string): string {
  const parts = ref.split('/')
  return parts[parts.length - 1] ?? ref
}

export function resolveRef(spec: OpenAPIV3.Document, ref: string): SchemaObject | null {
  if (!ref.startsWith('#/')) return null

  let current: unknown = spec
  for (const part of ref.slice(2).split('/')) {
    if (!current || typeof current !== 'object') return null
    current = (current as Record<string, unknown>)[part]
  }

  return (current as SchemaObject) ?? null
}

export function resolveSchema(
  spec: OpenAPIV3.Document,
  schema: SchemaObject | ReferenceObject | undefined,
  visited = new Set<string>(),
): SchemaObject | null {
  if (!schema) return null

  if (isReference(schema)) {
    if (visited.has(schema.$ref)) return null
    visited.add(schema.$ref)
    const resolved = resolveRef(spec, schema.$ref)
    if (!resolved) return null
    return resolveSchema(spec, resolved, visited)
  }

  if (schema.allOf?.length) {
    const merged: SchemaObject = { type: 'object', properties: {}, required: [] }
    for (const part of schema.allOf) {
      const resolved = resolveSchema(spec, part, new Set(visited))
      if (!resolved) continue
      Object.assign(merged.properties ?? {}, resolved.properties ?? {})
      if (resolved.required) {
        merged.required = [...new Set([...(merged.required ?? []), ...resolved.required])]
      }
      if (resolved.description && !merged.description) merged.description = resolved.description
    }
    return merged
  }

  return schema
}

export function schemaTypeLabel(
  spec: OpenAPIV3.Document,
  schema: SchemaObject | ReferenceObject | undefined,
): string {
  if (!schema) return 'unknown'
  if (isReference(schema)) return refName(schema.$ref)

  const resolved = resolveSchema(spec, schema)
  if (!resolved) return 'unknown'

  if (resolved.type === 'array') {
    const items = resolved.items
    if (!items) return 'array'
    const itemLabel = isReference(items)
      ? refName(items.$ref)
      : schemaTypeLabel(spec, items)
    return `${itemLabel}[]`
  }

  if (resolved.enum?.length) return `enum`

  return resolved.type ?? 'object'
}

function getExpandableInfo(
  spec: OpenAPIV3.Document,
  propertySchema: SchemaObject | ReferenceObject,
): Pick<SchemaProperty, 'expandableName' | 'expandableSchema'> {
  if (isReference(propertySchema)) {
    if (!resolveRef(spec, propertySchema.$ref)) return {}
    return {
      expandableName: refName(propertySchema.$ref),
      expandableSchema: propertySchema,
    }
  }

  const resolved = resolveSchema(spec, propertySchema)
  if (!resolved) return {}

  if (resolved.type === 'array' && resolved.items) {
    return {
      expandableName: isReference(resolved.items)
        ? refName(resolved.items.$ref)
        : schemaTypeLabel(spec, resolved.items),
      expandableSchema: resolved.items,
    }
  }

  if (
    resolved.properties ||
    resolved.allOf?.length ||
    resolved.oneOf?.length ||
    resolved.anyOf?.length
  ) {
    return {
      expandableName: resolved.type === 'object' || resolved.properties ? 'object' : schemaTypeLabel(spec, propertySchema),
      expandableSchema: propertySchema,
    }
  }

  return {}
}

export function schemaProperties(
  spec: OpenAPIV3.Document,
  schema: SchemaObject | ReferenceObject | undefined,
  visited = new Set<string>(),
): SchemaProperty[] {
  const resolved = schema ? resolveSchema(spec, schema, visited) : null
  if (!resolved?.properties) return []

  const required = new Set(resolved.required ?? [])

  return Object.entries(resolved.properties).map(([name, propertySchema]) => {
    const childVisited = new Set(visited)
    const nested = resolveSchema(spec, propertySchema, childVisited)

    const type = isReference(propertySchema)
      ? refName(propertySchema.$ref)
      : schemaTypeLabel(spec, propertySchema)

    return {
      name,
      required: required.has(name),
      type,
      description: !isReference(propertySchema) ? propertySchema.description : nested?.description,
      enum: !isReference(propertySchema) ? propertySchema.enum : nested?.enum,
      ...getExpandableInfo(spec, propertySchema),
    }
  })
}

export function schemaToExample(
  spec: OpenAPIV3.Document,
  schema: SchemaObject | ReferenceObject | undefined,
  visited = new Set<string>(),
): unknown {
  if (!schema) return null

  if (isReference(schema)) {
    if (visited.has(schema.$ref)) return {}
    visited.add(schema.$ref)
    const resolved = resolveRef(spec, schema.$ref)
    return resolved ? schemaToExample(spec, resolved, visited) : {}
  }

  if (schema.example !== undefined) return schema.example
  if (schema.default !== undefined) return schema.default

  const resolved = resolveSchema(spec, schema, visited)
  if (!resolved) return null

  if (resolved.enum?.length) return resolved.enum[0]

  switch (resolved.type) {
    case 'string':
      return resolved.format === 'date-time' ? new Date().toISOString() : ''
    case 'integer':
    case 'number':
      return 0
    case 'boolean':
      return false
    case 'array': {
      const item = resolved.items
      return item ? [schemaToExample(spec, item, new Set(visited))] : []
    }
    case 'object':
    default: {
      if (!resolved.properties) return {}
      const result: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(resolved.properties)) {
        result[key] = schemaToExample(spec, value, new Set(visited))
      }
      return result
    }
  }
}

function buildMediaSchemaInfo(
  spec: OpenAPIV3.Document,
  contentType: string,
  media: OpenAPIV3.MediaTypeObject,
): MediaSchemaInfo {
  const schema = media.schema ? resolveSchema(spec, media.schema) : null
  const schemaName =
    media.schema && isReference(media.schema) ? refName(media.schema.$ref) : null

  return {
    contentType,
    schema,
    schemaName,
    example: media.example ?? (media.schema ? schemaToExample(spec, media.schema) : null),
    properties: media.schema ? schemaProperties(spec, media.schema) : [],
  }
}

export function getRequestBodySchema(
  spec: OpenAPIV3.Document,
  requestBody: OpenAPIV3.RequestBodyObject | ReferenceObject | undefined,
): RequestBodySchemaInfo | null {
  if (!requestBody || isReference(requestBody)) return null

  const media = Object.entries(requestBody.content).map(([contentType, value]) =>
    buildMediaSchemaInfo(spec, contentType, value),
  )

  if (media.length === 0) return null

  return {
    required: Boolean(requestBody.required),
    description: requestBody.description,
    media,
  }
}

export function getResponseSchemas(
  spec: OpenAPIV3.Document,
  responses: OpenAPIV3.ResponsesObject | undefined,
): ResponseSchemaInfo[] {
  if (!responses) return []

  return Object.entries(responses)
    .sort(([a], [b]) => {
      const na = a === 'default' ? 9999 : Number(a)
      const nb = b === 'default' ? 9999 : Number(b)
      return na - nb
    })
    .map(([status, response]) => {
      if (isReference(response)) {
        return { status, description: undefined, media: [] }
      }

      const media = Object.entries(response.content ?? {}).map(([contentType, value]) =>
        buildMediaSchemaInfo(spec, contentType, value),
      )

      return {
        status,
        description: response.description,
        media,
      }
    })
}

export function primaryJsonMedia(info: { media: MediaSchemaInfo[] }): MediaSchemaInfo | null {
  return info.media.find((item) => item.contentType.includes('json')) ?? info.media[0] ?? null
}

export function formatRequestBodySchemaForCopy(info: RequestBodySchemaInfo): string {
  const primary = primaryJsonMedia(info)
  if (primary?.schema) return JSON.stringify(primary.schema, null, 2)

  const schemas = info.media
    .map((media) => media.schema)
    .filter((schema): schema is OpenAPIV3.SchemaObject => schema !== null)

  if (schemas.length === 0) return ''
  return JSON.stringify(schemas.length === 1 ? schemas[0] : schemas, null, 2)
}

export function formatResponseSchemaForCopy(response: ResponseSchemaInfo): string {
  const primary = primaryJsonMedia(response)
  if (primary?.schema) return JSON.stringify(primary.schema, null, 2)

  const schemas = response.media
    .map((media) => media.schema)
    .filter((schema): schema is OpenAPIV3.SchemaObject => schema !== null)

  if (schemas.length === 0) return ''
  return JSON.stringify(schemas.length === 1 ? schemas[0] : schemas, null, 2)
}

export function hasCopyableSchema(info: { media: MediaSchemaInfo[] }): boolean {
  return info.media.some((media) => media.schema !== null)
}
