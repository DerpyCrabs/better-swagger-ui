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
  scope?: string
}

export async function fetchPasswordToken(
  request: PasswordTokenRequest,
): Promise<TokenResponse> {
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

  if (request.clientCredentialsLocation === 'header') {
    const credentials = btoa(`${request.clientId}:${request.clientSecret}`)
    headers.Authorization = `Basic ${credentials}`
    body.set('client_id', request.clientId)
  } else {
    body.set('client_id', request.clientId)
    body.set('client_secret', request.clientSecret)
  }

  const proxyUrl = `/api/proxy?url=${encodeURIComponent(request.tokenUrl)}`
  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers,
    body: body.toString(),
  })

  const raw = await response.text()
  let parsed: TokenResponse & { error?: string; error_description?: string }

  try {
    parsed = JSON.parse(raw) as TokenResponse & { error?: string; error_description?: string }
  } catch {
    throw new Error(`Token endpoint returned invalid JSON (${response.status})`)
  }

  if (!response.ok || !parsed.access_token) {
    throw new Error(parsed.error_description ?? parsed.error ?? `Token request failed (${response.status})`)
  }

  return parsed
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

  if (clientCredentialsLocation === 'header') {
    headers.Authorization = `Basic ${btoa(`${clientId}:${clientSecret}`)}`
    body.set('client_id', clientId)
  } else {
    body.set('client_id', clientId)
    body.set('client_secret', clientSecret)
  }

  const proxyUrl = `/api/proxy?url=${encodeURIComponent(tokenUrl)}`
  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers,
    body: body.toString(),
  })

  const raw = await response.text()
  const parsed = JSON.parse(raw) as TokenResponse & { error?: string; error_description?: string }

  if (!response.ok || !parsed.access_token) {
    throw new Error(parsed.error_description ?? parsed.error ?? `Token request failed (${response.status})`)
  }

  return parsed
}
