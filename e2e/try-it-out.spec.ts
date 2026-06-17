import { expect, test } from '@playwright/test'
import {
  executeTryItOut,
  expandOperation,
  loadSpec,
  mockApi,
  openTryItOut,
  operationLocator,
  specUrl,
} from './helpers'

test.describe('try it out', () => {
  test.beforeEach(async ({ page }) => {
    await loadSpec(page, specUrl('params-full.json'))
  })

  test('prefills parameters from examples', async ({ page }) => {
    await expandOperation(page, 'get:/users/{id}')
    await openTryItOut(page, 'get:/users/{id}')
    await expect(operationLocator(page, 'get:/users/{id}').locator('input').first()).toHaveValue(
      '550e8400-e29b-41d4-a716-446655440000',
    )
  })

  test('blocks execute when required param is empty', async ({ page }) => {
    await expandOperation(page, 'get:/users/{id}')
    await openTryItOut(page, 'get:/users/{id}')
    await operationLocator(page, 'get:/users/{id}').locator('input').first().fill('')
    await executeTryItOut(page, 'get:/users/{id}')
    await expect(page.getByText('Fix parameter validation errors')).toBeVisible()
  })

  test('shows validation error for invalid uuid', async ({ page }) => {
    await expandOperation(page, 'get:/users/{id}')
    await openTryItOut(page, 'get:/users/{id}')
    await operationLocator(page, 'get:/users/{id}').locator('input').first().fill('not-uuid')
    await operationLocator(page, 'get:/users/{id}').locator('input').first().blur()
    await expect(page.getByText(/valid UUID/i)).toBeVisible()
  })

  test('executes request with correct URL, headers, and Accept', async ({ page }) => {
    let capturedUrl = ''
    let capturedHeaders: Record<string, string> = {}

    await mockApi(page, async (route) => {
      capturedUrl = route.request().url()
      capturedHeaders = route.request().headers()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    })

    await expandOperation(page, 'get:/users/{id}')
    await openTryItOut(page, 'get:/users/{id}')
    const op = operationLocator(page, 'get:/users/{id}')
    await op.getByPlaceholder('user@example.com').fill('user@example.com')
    await op.getByPlaceholder('req-123').fill('req-abc')
    await executeTryItOut(page, 'get:/users/{id}')

    await expect(op.getByTestId('response-status')).toContainText('200', { timeout: 10_000 })
    expect(capturedUrl).toContain('/fixtures/mock-api/users/')
    expect(capturedUrl).toContain('email=user%40example.com')
    expect(capturedHeaders['x-request-id']).toBe('req-abc')
    expect(capturedHeaders.accept).toContain('application/json')
  })

  test('rejects invalid JSON body before fetch', async ({ page }) => {
    await loadSpec(page, specUrl('request-body.json'))
    await expandOperation(page, 'post:/items')
    await openTryItOut(page, 'post:/items')
    const op = operationLocator(page, 'post:/items')
    await op.locator('textarea').fill('{ invalid')
    await op.locator('textarea').blur()
    await executeTryItOut(page, 'post:/items')
    await expect(op.getByText(/Fix request body validation errors/i)).toBeVisible()
  })

  test('sends JSON body on POST', async ({ page }) => {
    let body = ''
    await mockApi(page, async (route) => {
      body = route.request().postData() ?? ''
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 1 }),
      })
    })

    await loadSpec(page, specUrl('request-body.json'))
    await expandOperation(page, 'post:/items')
    await openTryItOut(page, 'post:/items')
    await executeTryItOut(page, 'post:/items')

    await expect(operationLocator(page, 'post:/items').getByTestId('response-status')).toContainText(
      '201',
      { timeout: 10_000 },
    )
    expect(body).toContain('"name"')
    expect(JSON.parse(body)).toMatchObject({ name: 'Widget' })
  })

  test('cancel resets try it out state', async ({ page }) => {
    await expandOperation(page, 'get:/users/{id}')
    await openTryItOut(page, 'get:/users/{id}')
    await operationLocator(page, 'get:/users/{id}').locator('input').first().fill('')
    await operationLocator(page, 'get:/users/{id}').getByTestId('cancel-try-it-out').click()
    await expect(operationLocator(page, 'get:/users/{id}').getByTestId('try-it-out')).toBeVisible()
  })
})
