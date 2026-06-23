import type { OpenAPIV3 } from 'openapi-types'
import type { MediaSchemaInfo, RequestBodySchemaInfo } from './schema'
import { resolveSchema } from './schema'

export type RequestBodyMode = 'json' | 'text' | 'file' | 'multipart' | 'urlencoded'

export interface FormField {
  name: string
  required: boolean
  kind: 'text' | 'file'
  description?: string
}

export interface RequestBodyBuildInput {
  mode: RequestBodyMode
  contentType: string
  required: boolean
  body: string
  file: File | null
  formFields: FormField[]
  formTexts: Record<string, string>
  formFiles: Record<string, File | null>
}

export interface RequestBodyBuildResult {
  body?: BodyInit
  contentType?: string
  error?: string
}

function isBinarySchema(schema: OpenAPIV3.SchemaObject | null): boolean {
  return schema?.type === 'string' && schema.format === 'binary'
}

export function primaryRequestBodyMedia(info: { media: MediaSchemaInfo[] }): MediaSchemaInfo | null {
  const json = info.media.find((item) => item.contentType.includes('json'))
  if (json) return json

  const plain = info.media.find((item) => item.contentType === 'text/plain')
  if (plain) return plain

  const multipart = info.media.find((item) => item.contentType === 'multipart/form-data')
  if (multipart) return multipart

  const urlencoded = info.media.find(
    (item) => item.contentType === 'application/x-www-form-urlencoded',
  )
  if (urlencoded) return urlencoded

  const octet = info.media.find((item) => item.contentType === 'application/octet-stream')
  if (octet) return octet

  return info.media[0] ?? null
}

export function getRequestBodyMode(media: MediaSchemaInfo | null): RequestBodyMode | null {
  if (!media) return null

  const contentType = media.contentType.toLowerCase()
  if (contentType.includes('json')) return 'json'
  if (contentType === 'text/plain') return 'text'
  if (contentType === 'application/octet-stream' && isBinarySchema(media.schema)) return 'file'
  if (contentType === 'multipart/form-data') return 'multipart'
  if (contentType === 'application/x-www-form-urlencoded') return 'urlencoded'

  if (isBinarySchema(media.schema)) return 'file'
  return 'text'
}

export function defaultRequestBodyText(
  media: MediaSchemaInfo | null,
  mode: RequestBodyMode | null,
): string {
  if (!media || !mode) return '{}'
  if (mode === 'json') {
    if (media.example === undefined || media.example === null) return '{}'
    return JSON.stringify(media.example, null, 2)
  }
  if (mode === 'text') {
    if (media.example === undefined || media.example === null) return ''
    return typeof media.example === 'string' ? media.example : String(media.example)
  }
  return ''
}

export function resolveObjectFormFields(
  spec: OpenAPIV3.Document,
  media: MediaSchemaInfo,
  options: { allowFiles: boolean },
): FormField[] {
  const schema = media.schema
  if (!schema || schema.type !== 'object' || !schema.properties) return []

  const required = new Set(schema.required ?? [])

  return Object.entries(schema.properties).map(([name, propertySchema]) => {
    const resolved = resolveSchema(spec, propertySchema)
    const isFile = options.allowFiles && isBinarySchema(resolved)

    return {
      name,
      required: required.has(name),
      kind: isFile ? 'file' : 'text',
      description: !('$ref' in propertySchema) ? propertySchema.description : resolved?.description,
    }
  })
}

export function resolveMultipartFields(
  spec: OpenAPIV3.Document,
  media: MediaSchemaInfo,
): FormField[] {
  return resolveObjectFormFields(spec, media, { allowFiles: true })
}

export function resolveUrlEncodedFields(
  spec: OpenAPIV3.Document,
  media: MediaSchemaInfo,
): FormField[] {
  return resolveObjectFormFields(spec, media, { allowFiles: false })
}

export function emptyFormTexts(fields: FormField[]): Record<string, string> {
  return Object.fromEntries(fields.filter((field) => field.kind === 'text').map((field) => [field.name, '']))
}

export function emptyMultipartTexts(fields: FormField[]): Record<string, string> {
  return emptyFormTexts(fields)
}

function validateFormFields(
  fields: FormField[],
  texts: Record<string, string>,
  files: Record<string, File | null>,
): string | null {
  for (const field of fields) {
    if (!field.required) continue
    if (field.kind === 'file') {
      if (!files[field.name]) return `${field.name} is required`
    } else if (!texts[field.name]?.trim()) {
      return `${field.name} is required`
    }
  }
  return null
}

export function validateRequestBody(input: RequestBodyBuildInput): string | null {
  switch (input.mode) {
    case 'json':
      try {
        JSON.parse(input.body)
      } catch {
        return 'Request body must be valid JSON'
      }
      return null

    case 'text':
      if (input.required && !input.body.trim()) return 'Request body is required'
      return null

    case 'file':
      if (input.required && !input.file) return 'File is required'
      return null

    case 'multipart':
    case 'urlencoded':
      return validateFormFields(input.formFields, input.formTexts, input.formFiles)

    default:
      return null
  }
}

function appendFormField(
  target: FormData | URLSearchParams,
  field: FormField,
  texts: Record<string, string>,
  files: Record<string, File | null>,
) {
  if (field.kind === 'file') {
    const file = files[field.name]
    if (!file) return
    if (target instanceof FormData) {
      target.append(field.name, file, file.name)
    }
    return
  }

  const value = texts[field.name]?.trim()
  if (value) target.append(field.name, value)
}

export function buildRequestBody(input: RequestBodyBuildInput): RequestBodyBuildResult {
  const validationError = validateRequestBody(input)
  if (validationError) return { error: validationError }

  switch (input.mode) {
    case 'json':
      return {
        body: input.body,
        contentType: 'application/json',
      }

    case 'text':
      return {
        body: input.body,
        contentType: 'text/plain',
      }

    case 'file':
      if (!input.file) {
        return input.required ? { error: 'File is required' } : {}
      }
      return {
        body: input.file,
        contentType: input.file.type || input.contentType || 'application/octet-stream',
      }

    case 'multipart': {
      const formData = new FormData()
      for (const field of input.formFields) {
        appendFormField(formData, field, input.formTexts, input.formFiles)
      }
      return { body: formData }
    }

    case 'urlencoded': {
      const params = new URLSearchParams()
      for (const field of input.formFields) {
        appendFormField(params, field, input.formTexts, input.formFiles)
      }
      return {
        body: params.toString(),
        contentType: 'application/x-www-form-urlencoded',
      }
    }

    default:
      return {}
  }
}

export function exampleBodyData(media: MediaSchemaInfo | null, mode: RequestBodyMode | null): unknown {
  if (!media || mode === 'file' || mode === 'multipart' || mode === 'urlencoded') {
    return media?.example ?? null
  }
  if (mode === 'text') {
    return defaultRequestBodyText(media, mode)
  }
  try {
    return JSON.parse(defaultRequestBodyText(media, mode))
  } catch {
    return defaultRequestBodyText(media, mode)
  }
}

export function hasEditableRequestBody(info: RequestBodySchemaInfo | null): boolean {
  if (!info) return false
  return getRequestBodyMode(primaryRequestBodyMedia(info)) !== null
}
