import { describe, expect, it } from 'vitest'
import type { OpenAPIV3 } from 'openapi-types'
import requestBodyMedia from '../../tests/fixtures/openapi/request-body-media.json'
import {
  buildRequestBody,
  defaultRequestBodyText,
  getRequestBodyMode,
  primaryRequestBodyMedia,
  resolveMultipartFields,
  resolveUrlEncodedFields,
  validateRequestBody,
} from './request-body'
import { getRequestBodySchema } from './schema'

const spec = requestBodyMedia as OpenAPIV3.Document

function postOp(path: string) {
  return spec.paths[path]!.post!
}

describe('primaryRequestBodyMedia', () => {
  it('prefers json over text/plain', () => {
    const info = getRequestBodySchema(spec, postOp('/mixed')!.requestBody)!
    expect(primaryRequestBodyMedia(info)?.contentType).toBe('application/json')
  })

  it('selects text/plain when json is absent', () => {
    const info = getRequestBodySchema(spec, postOp('/notes')!.requestBody)!
    expect(primaryRequestBodyMedia(info)?.contentType).toBe('text/plain')
  })

  it('selects multipart/form-data', () => {
    const info = getRequestBodySchema(spec, postOp('/upload')!.requestBody)!
    expect(primaryRequestBodyMedia(info)?.contentType).toBe('multipart/form-data')
  })
})

describe('getRequestBodyMode', () => {
  it('detects json, text, file, multipart, and urlencoded modes', () => {
    const mixed = primaryRequestBodyMedia(getRequestBodySchema(spec, postOp('/mixed')!.requestBody)!)
    const notes = primaryRequestBodyMedia(getRequestBodySchema(spec, postOp('/notes')!.requestBody)!)
    const binary = primaryRequestBodyMedia(getRequestBodySchema(spec, postOp('/binary')!.requestBody)!)
    const upload = primaryRequestBodyMedia(getRequestBodySchema(spec, postOp('/upload')!.requestBody)!)
    const form = primaryRequestBodyMedia(getRequestBodySchema(spec, postOp('/form')!.requestBody)!)

    expect(getRequestBodyMode(mixed)).toBe('json')
    expect(getRequestBodyMode(notes)).toBe('text')
    expect(getRequestBodyMode(binary)).toBe('file')
    expect(getRequestBodyMode(upload)).toBe('multipart')
    expect(getRequestBodyMode(form)).toBe('urlencoded')
  })
})

describe('defaultRequestBodyText', () => {
  it('uses string example for text/plain', () => {
    const media = primaryRequestBodyMedia(getRequestBodySchema(spec, postOp('/notes')!.requestBody)!)
    expect(defaultRequestBodyText(media, 'text')).toBe('Hello world')
  })
})

describe('resolveMultipartFields', () => {
  it('marks binary properties as file fields', () => {
    const media = primaryRequestBodyMedia(getRequestBodySchema(spec, postOp('/upload')!.requestBody)!)
    const fields = resolveMultipartFields(spec, media!)
    expect(fields).toEqual([
      expect.objectContaining({ name: 'file', kind: 'file', required: true }),
      expect.objectContaining({ name: 'description', kind: 'text', required: false }),
    ])
  })
})

describe('validateRequestBody', () => {
  it('accepts plain text without json parsing', () => {
    const error = validateRequestBody({
      mode: 'text',
      contentType: 'text/plain',
      required: true,
      body: 'not json',
      file: null,
      formFields: [],
      formTexts: {},
      formFiles: {},
    })
    expect(error).toBeNull()
  })

  it('requires a file for binary uploads', () => {
    const error = validateRequestBody({
      mode: 'file',
      contentType: 'application/octet-stream',
      required: true,
      body: '',
      file: null,
      formFields: [],
      formTexts: {},
      formFiles: {},
    })
    expect(error).toBe('File is required')
  })
})

describe('buildRequestBody', () => {
  it('builds multipart form data', () => {
    const media = primaryRequestBodyMedia(getRequestBodySchema(spec, postOp('/upload')!.requestBody)!)
    const fields = resolveMultipartFields(spec, media!)
    const file = new File(['payload'], 'test.txt', { type: 'text/plain' })

    const result = buildRequestBody({
      mode: 'multipart',
      contentType: 'multipart/form-data',
      required: true,
      body: '',
      file: null,
      formFields: fields,
      formTexts: { description: 'notes' },
      formFiles: { file },
    })

    expect(result.error).toBeUndefined()
    expect(result.contentType).toBeUndefined()
    expect(result.body).toBeInstanceOf(FormData)
    const form = result.body as FormData
    expect(form.get('description')).toBe('notes')
    expect(form.get('file')).toBeInstanceOf(File)
  })

  it('builds urlencoded form body', () => {
    const media = primaryRequestBodyMedia(getRequestBodySchema(spec, postOp('/form')!.requestBody)!)
    const fields = resolveUrlEncodedFields(spec, media!)

    const result = buildRequestBody({
      mode: 'urlencoded',
      contentType: 'application/x-www-form-urlencoded',
      required: true,
      body: '',
      file: null,
      formFields: fields,
      formTexts: { username: 'demo', password: 'secret' },
      formFiles: {},
    })

    expect(result.contentType).toBe('application/x-www-form-urlencoded')
    expect(result.body).toBe('username=demo&password=secret')
  })
})
