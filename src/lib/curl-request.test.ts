import { describe, expect, it } from 'vite-plus/test'
import { buildCurlCommand } from './curl-request'

describe('buildCurlCommand', () => {
  it('formats method, URL, and headers like Swagger UI', () => {
    expect(
      buildCurlCommand({
        method: 'get',
        url: 'https://api.example.com/users?q=hello%20world',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer token',
        },
      }),
    ).toBe(
      "curl -X 'GET' \\\n  'https://api.example.com/users?q=hello%20world' \\\n  -H 'Accept: application/json' \\\n  -H 'Authorization: Bearer token'",
    )
  })

  it('includes a string request body and escapes apostrophes', () => {
    const command = buildCurlCommand({
      method: 'post',
      url: 'https://api.example.com/items',
      headers: { 'Content-Type': 'application/json' },
      body: `{"name":"O'Reilly"}`,
    })

    expect(command).toContain("--data-raw '{\"name\":\"O'\\''Reilly\"}'")
  })

  it('omits body flags when request has no body', () => {
    const command = buildCurlCommand({
      method: 'head',
      url: 'https://api.example.com/health',
      headers: {},
    })

    expect(command).not.toContain('--data')
    expect(command).not.toContain('-F')
  })
})
