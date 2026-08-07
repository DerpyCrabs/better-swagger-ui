import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { fetchClientCredentialsToken, fetchPasswordToken, fetchRefreshToken } from './oauth-token'

vi.mock('./proxy-fetch', () => ({
  proxyFetch: vi.fn(),
}))

import { proxyFetch } from './proxy-fetch'

const mockedFetch = vi.mocked(proxyFetch)

describe('oauth-token', () => {
  beforeEach(() => {
    mockedFetch.mockReset()
  })

  it('fetches password token with Basic client credentials in header', async () => {
    mockedFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 }),
    )

    const result = await fetchPasswordToken({
      tokenUrl: 'https://auth.example/token',
      username: 'user',
      password: 'pass',
      clientId: 'cid',
      clientSecret: 'csec',
      clientCredentialsLocation: 'header',
    })

    expect(result.access_token).toBe('tok')
    const [, init] = mockedFetch.mock.calls[0]!
    const headers = init?.headers as Record<string, string>
    expect(headers.Authorization).toMatch(/^Basic /)
    expect(init?.body).toContain('grant_type=password')
    expect(init?.body).toContain('username=user')
  })

  it('fetches password token with client secret in body', async () => {
    mockedFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'tok2' }), { status: 200 }),
    )

    await fetchPasswordToken({
      tokenUrl: 'https://auth.example/token',
      username: 'user',
      password: 'pass',
      clientId: 'cid',
      clientSecret: 'csec',
      clientCredentialsLocation: 'body',
    })

    const [, init] = mockedFetch.mock.calls[0]!
    expect(init?.body).toContain('client_secret=csec')
  })

  it('throws on failed token response', async () => {
    mockedFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }),
    )

    await expect(
      fetchPasswordToken({
        tokenUrl: 'https://auth.example/token',
        username: 'user',
        password: 'pass',
        clientId: 'cid',
        clientSecret: 'csec',
        clientCredentialsLocation: 'body',
      }),
    ).rejects.toThrow(/invalid_grant|Token request failed/)
  })

  it('fetches client credentials token', async () => {
    mockedFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'cc-token' }), { status: 200 }),
    )

    const result = await fetchClientCredentialsToken(
      'https://auth.example/token',
      'cid',
      'csec',
      'header',
      'write',
    )

    expect(result.access_token).toBe('cc-token')
    const [, init] = mockedFetch.mock.calls[0]!
    expect(init?.body).toContain('grant_type=client_credentials')
    expect(init?.body).toContain('scope=write')
  })

  it('refreshes an access token with Basic client credentials', async () => {
    mockedFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'refreshed-access',
          refresh_token: 'rotated-refresh',
          expires_in: 300,
        }),
        { status: 200 },
      ),
    )

    const result = await fetchRefreshToken({
      tokenUrl: 'https://auth.example/token',
      refreshToken: 'current-refresh',
      clientId: 'cid',
      clientSecret: 'csec',
      clientCredentialsLocation: 'header',
    })

    expect(result.access_token).toBe('refreshed-access')
    expect(result.refresh_token).toBe('rotated-refresh')
    const [, init] = mockedFetch.mock.calls[0]!
    const headers = init?.headers as Record<string, string>
    expect(headers.Authorization).toMatch(/^Basic /)
    expect(init?.body).toContain('grant_type=refresh_token')
    expect(init?.body).toContain('refresh_token=current-refresh')
  })
})
