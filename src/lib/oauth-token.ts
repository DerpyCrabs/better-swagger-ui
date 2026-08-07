import { proxyFetch } from './proxy-fetch'

export type ClientCredentialsLocation = 'body' | 'header'

export interface PasswordTokenRequest {
  tokenUrl: string
  username: string
  password: string
  clientId: string
  clientSecret: string
  clientCredentialsLocation: ClientCredentialsLocation
  scope?: string
}

export interface TokenResponse {
  access_token: string
  token_type?: string
  expires_in?: number
  refresh_token?: string
  refresh_expires_in?: number
  scope?: string
}

export interface RefreshTokenRequest {
  tokenUrl: string
  refreshToken: string
  clientId: string
  clientSecret: string
  clientCredentialsLocation: ClientCredentialsLocation
  scope?: string
}

type TokenResponsePayload = TokenResponse & {
  error?: string
  error_description?: string
}

function addClientCredentials(
  body: URLSearchParams,
  headers: Record<string, string>,
  clientId: string,
  clientSecret: string,
  location: ClientCredentialsLocation,
) {
  body.set('client_id', clientId)
  if (location === 'header') {
    headers.Authorization = `Basic ${btoa(`${clientId}:${clientSecret}`)}`
  } else {
    body.set('client_secret', clientSecret)
  }
}

async function requestToken(
  tokenUrl: string,
  body: URLSearchParams,
  headers: Record<string, string>,
): Promise<TokenResponse> {
  const response = await proxyFetch(tokenUrl, {
    method: 'POST',
    headers,
    body: body.toString(),
  })

  const raw = await response.text()
  let parsed: TokenResponsePayload

  try {
    parsed = JSON.parse(raw) as TokenResponsePayload
  } catch {
    throw new Error(`Token endpoint returned invalid JSON (${response.status})`)
  }

  if (!response.ok || !parsed.access_token) {
    throw new Error(
      parsed.error_description ?? parsed.error ?? `Token request failed (${response.status})`,
    )
  }

  return parsed
}

export async function fetchPasswordToken(request: PasswordTokenRequest): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'password',
    username: request.username,
    password: request.password,
  })

  if (request.scope) {
    body.set('scope', request.scope)
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  }

  addClientCredentials(
    body,
    headers,
    request.clientId,
    request.clientSecret,
    request.clientCredentialsLocation,
  )
  return requestToken(request.tokenUrl, body, headers)
}

export async function fetchClientCredentialsToken(
  tokenUrl: string,
  clientId: string,
  clientSecret: string,
  clientCredentialsLocation: ClientCredentialsLocation,
  scope?: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({ grant_type: 'client_credentials' })
  if (scope) body.set('scope', scope)

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  }

  addClientCredentials(body, headers, clientId, clientSecret, clientCredentialsLocation)
  return requestToken(tokenUrl, body, headers)
}

export async function fetchRefreshToken(request: RefreshTokenRequest): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: request.refreshToken,
  })
  if (request.scope) body.set('scope', request.scope)

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  }
  addClientCredentials(
    body,
    headers,
    request.clientId,
    request.clientSecret,
    request.clientCredentialsLocation,
  )
  return requestToken(request.tokenUrl, body, headers)
}
