import { expect, test } from '@playwright/test'
import {
  clearAuthStorage,
  executeOperation,
  expandOperation,
  loadSpec,
  mockApi,
  operationLocator,
  specUrl,
} from './helpers'

test.describe('authorization', () => {
  test.beforeEach(async ({ page }) => {
    await clearAuthStorage(page)
    await loadSpec(page, specUrl('security-schemes.json'))
  })

  test('sends API key header after authorize', async ({ page }) => {
    let headers: Record<string, string> = {}

    await mockApi(page, async (route) => {
      headers = route.request().headers()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    })

    await page.getByTestId('authorize-button').click()
    await expect(page.getByTestId('authorize-dialog')).toBeVisible()
    await page.getByPlaceholder('X-API-Key').first().fill('secret-key')
    await page.getByTestId('ApiKeyAuth-authorize').click()

    await expandOperation(page, 'get:/secure')
    await executeOperation(page, 'get:/secure')

    await expect(operationLocator(page, 'get:/secure').getByTestId('response-status')).toContainText(
      '200',
    )
    expect(headers['x-api-key']).toBe('secret-key')
  })

  test('sends Bearer token after authorize', async ({ page }) => {
    let headers: Record<string, string> = {}

    await mockApi(page, async (route) => {
      headers = route.request().headers()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    })

    await page.getByTestId('authorize-button').click()
    await page.getByPlaceholder('Bearer token').fill('my-bearer-token')
    await page.getByTestId('BearerAuth-authorize').click()

    await expandOperation(page, 'get:/secure')
    await executeOperation(page, 'get:/secure')

    await expect(operationLocator(page, 'get:/secure').getByTestId('response-status')).toContainText(
      '200',
    )
    expect(headers.authorization).toBe('Bearer my-bearer-token')
  })

  test('OAuth password flow stores token for execute', async ({ page }) => {
    await page.route('**/fixtures/mock-api/oauth/token', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ access_token: 'oauth-access', expires_in: 3600 }),
      })
    })

    let headers: Record<string, string> = {}
    await page.route('**/fixtures/mock-api/secure', async (route) => {
      headers = route.request().headers()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    })

    await page.getByTestId('authorize-button').click()
    await page.locator('input[name="username"]').fill('user')
    await page.locator('input[name="password"]').fill('pass')
    await page.locator('input[name="client_id"]').fill('test-client')
    await page.getByTestId('OAuthPassword-authorize').click()
    await expect(page.getByTestId('authorize-button')).toContainText('Authorized')

    await expandOperation(page, 'get:/secure')
    await executeOperation(page, 'get:/secure')

    await expect(operationLocator(page, 'get:/secure').getByTestId('response-status')).toContainText(
      '200',
    )
    expect(headers.authorization).toBe('Bearer oauth-access')
  })

  test('sends HTTP Basic credentials after authorize', async ({ page }) => {
    let headers: Record<string, string> = {}

    await mockApi(page, async (route) => {
      headers = route.request().headers()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    })

    await page.getByTestId('authorize-button').click()
    await page.locator('input[name="basic_username"]').fill('alice')
    await page.locator('input[name="basic_password"]').fill('secret')
    await page.getByTestId('BasicAuth-authorize').click()

    await expandOperation(page, 'get:/secure')
    await executeOperation(page, 'get:/secure')

    await expect(operationLocator(page, 'get:/secure').getByTestId('response-status')).toContainText(
      '200',
    )
    expect(headers.authorization).toBe(`Basic ${Buffer.from('alice:secret').toString('base64')}`)
  })

  test('sends query and cookie api keys after authorize', async ({ page }) => {
    let requestUrl = ''
    let headers: Record<string, string> = {}

    await mockApi(page, async (route) => {
      requestUrl = route.request().url()
      headers = route.request().headers()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    })

    await page.getByTestId('authorize-button').click()
    await page.getByPlaceholder('api_key').fill('query-secret')
    await page.getByTestId('QueryApiKey-authorize').click()
    await page.getByTestId('authorize-button').click()
    await page.getByPlaceholder('session').fill('cookie-secret')
    await page.getByTestId('CookieApiKey-authorize').click()

    await expandOperation(page, 'get:/public')
    await executeOperation(page, 'get:/public')

    await expect(operationLocator(page, 'get:/public').getByTestId('response-status')).toContainText(
      '200',
    )
    expect(requestUrl).toContain('api_key=query-secret')
    expect(headers.cookie).toContain('session=cookie-secret')
  })

  test('shows authorize button next to execute on 401', async ({ page }) => {
    let callCount = 0

    await mockApi(page, async (route) => {
      callCount += 1
      const status = callCount === 1 ? 401 : 200
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(status === 401 ? { error: 'Unauthorized' } : { ok: true }),
      })
    })

    await expandOperation(page, 'get:/secure')
    await executeOperation(page, 'get:/secure')

    const op = operationLocator(page, 'get:/secure')
    await expect(op.getByTestId('response-status')).toContainText('401')
    await expect(op.getByTestId('execute-authorize')).toBeVisible()

    await op.getByTestId('execute-authorize').click()
    await expect(page.getByTestId('authorize-dialog')).toBeVisible()
    await page.getByPlaceholder('Bearer token').fill('my-token')
    await page.getByTestId('BearerAuth-authorize').click()

    await expect(op.getByTestId('response-status')).toContainText('200')
    await expect(op.getByTestId('execute-authorize')).not.toBeVisible()
    expect(callCount).toBe(2)
  })

  test('logout clears authorization', async ({ page }) => {
    await page.getByTestId('authorize-button').click()
    await page.getByPlaceholder('Bearer token').fill('token')
    await page.getByTestId('BearerAuth-authorize').click()
    await expect(page.getByTestId('authorize-button')).toContainText('Authorized')

    await page.getByTestId('authorize-button').click()
    await expect(page.getByTestId('authorize-dialog')).toBeVisible()
    await page.getByRole('button', { name: 'Logout' }).first().click()
    await page.getByTestId('authorize-dialog').getByText('Close', { exact: true }).click()
    await expect(page.getByTestId('authorize-button')).toContainText('Authorize')
  })
})
