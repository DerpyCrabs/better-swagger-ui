import { describe, expect, it } from 'vitest'
import {
  defaultDownloadName,
  fileNameFromDisposition,
  inferFileNameFromUrl,
  parseResponseBody,
  resolveDownloadName,
} from './response-body'

describe('fileNameFromDisposition', () => {
  it('parses filename* UTF-8', () => {
    expect(fileNameFromDisposition("attachment; filename*=UTF-8''report%20Q1.csv")).toBe(
      'report Q1.csv',
    )
  })

  it('parses quoted and unquoted filename', () => {
    expect(fileNameFromDisposition('attachment; filename="data.json"')).toBe('data.json')
    expect(fileNameFromDisposition("attachment; filename='export.csv'")).toBe('export.csv')
    expect(fileNameFromDisposition('attachment; filename=plain.txt')).toBe('plain.txt')
  })

  it('returns null for missing header', () => {
    expect(fileNameFromDisposition(null)).toBeNull()
    expect(fileNameFromDisposition('')).toBeNull()
  })
})

describe('inferFileNameFromUrl', () => {
  it('derives name from path segments', () => {
    expect(inferFileNameFromUrl('http://x/v1/provider/csv', 'text/csv')).toBe('provider.csv')
    expect(inferFileNameFromUrl('http://x/files/report.pdf', 'application/pdf')).toBe('report.pdf')
  })

  it('returns null for invalid URL', () => {
    expect(inferFileNameFromUrl('not-a-url', null)).toBeNull()
  })
})

describe('defaultDownloadName', () => {
  it('maps MIME to extension', () => {
    expect(defaultDownloadName('application/json')).toBe('download.json')
    expect(defaultDownloadName('text/csv')).toBe('download.csv')
    expect(defaultDownloadName('image/png')).toBe('download.png')
    expect(defaultDownloadName('application/octet-stream')).toBe('download.bin')
  })
})

describe('resolveDownloadName', () => {
  it('follows fallback chain', () => {
    expect(resolveDownloadName('a.json', null, 'application/json')).toBe('a.json')
    expect(resolveDownloadName(null, 'attachment; filename=b.csv', null)).toBe('b.csv')
    expect(
      resolveDownloadName(null, null, 'text/csv', 'http://localhost/v1/provider/csv'),
    ).toBe('provider.csv')
    expect(resolveDownloadName(null, null, 'application/pdf')).toBe('download.pdf')
  })
})

describe('parseResponseBody', () => {
  it('parses JSON response', async () => {
    const response = new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
    const parsed = await parseResponseBody(response)
    expect(parsed.isFile).toBe(false)
    expect(parsed.body).toEqual({ ok: true })
    expect(parsed.copyText).toContain('"ok"')
  })

  it('treats attachment as file', async () => {
    const response = new Response('a,b\n1,2', {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="data.csv"',
      },
    })
    const parsed = await parseResponseBody(response)
    expect(parsed.isFile).toBe(true)
    expect(parsed.fileName).toBe('data.csv')
  })

  it('handles octet-stream as file', async () => {
    const response = new Response(new Uint8Array([1, 2, 3]), {
      headers: { 'Content-Type': 'application/octet-stream' },
    })
    const parsed = await parseResponseBody(response)
    expect(parsed.isFile).toBe(true)
    expect(parsed.blob).toBeDefined()
  })

  it('handles empty body', async () => {
    const response = new Response('', { headers: { 'Content-Type': 'text/plain' } })
    const parsed = await parseResponseBody(response)
    expect(parsed.body).toBe('')
    expect(parsed.isFile).toBe(false)
  })

  it('detects CSV when JSON parse fails', async () => {
    const csv = '"a";"b"\n"1";"2"'
    const response = new Response(csv, {
      headers: { 'Content-Type': 'application/json' },
    })
    const parsed = await parseResponseBody(response)
    expect(parsed.isFile).toBe(true)
    expect(parsed.contentType).toBe('text/csv')
  })
})
