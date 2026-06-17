/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { shouldProxyUrl, toProxyUrl } from './proxy-fetch'

describe('proxy-fetch helpers', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      location: { origin: 'http://localhost:5173', href: 'http://localhost:5173/' },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('encodes proxy URL', () => {
    expect(toProxyUrl('https://api.example.com/pets')).toBe(
      '/__proxy?url=https%3A%2F%2Fapi.example.com%2Fpets',
    )
  })

  it('does not proxy same-origin URLs when proxy mode disabled', () => {
    expect(shouldProxyUrl('http://localhost:5173/openapi.json')).toBe(false)
  })

  it('does not proxy when dev proxy mode is off', () => {
    expect(shouldProxyUrl('https://api.example.com/pets')).toBe(false)
  })
})
