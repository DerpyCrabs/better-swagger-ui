import { expect, test } from '@playwright/test'
import {
  clearAuthStorage,
  executeTryItOut,
  expandOperation,
  loadSpec,
  mockApi,
  openTryItOut,
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
    await page.getByPlaceholder('X-API-Key').fill('secret-key')
    await page.getByTestId('ApiKeyAuth-authorize').click()

    await expandOperation(page, 'get:/secure')
    await openTryItOut(page, 'get:/secure')
    await executeTryItOut(page, 'get:/secure')

    await expect(operationLocator(page, 'get:/secure').getByTestId('response-status')).toContainText(
      '200',
      { timeout: 10_000 },
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
    await openTryItOut(page, 'get:/secure')
    await executeTryItOut(page, 'get:/secure')

    await expect(operationLocator(page, 'get:/secure').getByTestId('response-status')).toContainText(
      '200',
      { timeout: 10_000 },
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
    await expect(page.getByTestId('authorize-button')).toContainText('Authorized', {
      timeout: 10_000,
    })

    await expandOperation(page, 'get:/secure')
    await openTryItOut(page, 'get:/secure')
    await executeTryItOut(page, 'get:/secure')

    await expect(operationLocator(page, 'get:/secure').getByTestId('response-status')).toContainText(
      '200',
      { timeout: 15_000 },
    )
    expect(headers.authorization).toBe('Bearer oauth-access')
  })

  test('logout clears authorization', async ({ page }) => {
    await page.getByTestId('authorize-button').click()
    await page.getByPlaceholder('Bearer token').fill('token')
    await page.getByTestId('BearerAuth-authorize').click()
    await expect(page.getByTestId('authorize-button')).toContainText('Authorized', {
      timeout: 5_000,
    })

    await page.getByTestId('authorize-button').click()
    await expect(page.getByTestId('authorize-dialog')).toBeVisible()
    await page.getByRole('button', { name: 'Logout' }).first().click()
    await page.getByTestId('authorize-dialog').getByText('Close', { exact: true }).click()
    await expect(page.getByTestId('authorize-button')).toContainText('Authorize')
  })
})
