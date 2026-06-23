import { expect, test } from '@playwright/test'
import {
  clickJsonFoldOnLineContaining,
  executeOperation,
  expandOperation,
  jsonEditorInnerText,
  loadSpec,
  mockApi,
  operationLocator,
  responseJsonViewer,
  specUrl,
} from './helpers'

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test.describe('response handling', () => {
  test.beforeEach(async ({ page }) => {
    await loadSpec(page, specUrl('responses-mixed.json'))
  })

  test('displays JSON response with status', async ({ page }) => {
    await mockApi(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'hello' }),
      })
    })

    await expandOperation(page, 'get:/json')
    await executeOperation(page, 'get:/json')

    const op = operationLocator(page, 'get:/json')
    await expect(op.getByTestId('response-status')).toContainText('200')
    await expect(op.getByTestId('response-body')).toContainText('hello')
  })

  test('collapses and expands nested JSON in response body', async ({ page }) => {
    await mockApi(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'hello',
          nested: { secret: 'hidden' },
        }),
      })
    })

    await expandOperation(page, 'get:/json')
    await executeOperation(page, 'get:/json')

    const op = operationLocator(page, 'get:/json')
    const responseBody = op.getByTestId('response-body')
    await expect(responseBody.getByTestId('json-viewer')).toBeVisible()
    await expect(responseBody).toContainText('secret')

    await clickJsonFoldOnLineContaining(responseBody.getByTestId('json-viewer'), '"nested"')
    await expect.poll(async () =>
      (await jsonEditorInnerText(responseBody.getByTestId('json-viewer'))).includes('secret'),
    ).toBe(false)

    await clickJsonFoldOnLineContaining(responseBody.getByTestId('json-viewer'), '"nested"')
    await expect(jsonEditorInnerText(responseBody.getByTestId('json-viewer'))).resolves.toContain('secret')
  })

  test('shows file download for CSV', async ({ page }) => {
    await mockApi(page, async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="report.csv"',
        },
        body: 'a,b\n1,2',
      })
    })

    await expandOperation(page, 'get:/csv')
    await executeOperation(page, 'get:/csv')

    const op = operationLocator(page, 'get:/csv')
    await expect(op.getByTestId('download-response')).toBeVisible()
    await expect(op.getByText('report.csv')).toBeVisible()
  })

  test('shows download for octet-stream with disposition filename', async ({ page }) => {
    await mockApi(page, async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': 'attachment; filename="data.bin"',
        },
        body: 'abc',
      })
    })

    await expandOperation(page, 'get:/file')
    await executeOperation(page, 'get:/file')

    const op = operationLocator(page, 'get:/file')
    await expect(op.getByTestId('response-status')).toContainText('200')
    await expect(op.getByTestId('download-response')).toBeVisible()
    await expect(op.getByText('data.bin')).toBeVisible()
  })

  test('renders image preview for png response', async ({ page }) => {
    await mockApi(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: PNG_BYTES,
      })
    })

    await expandOperation(page, 'get:/image')
    await executeOperation(page, 'get:/image')

    const op = operationLocator(page, 'get:/image')
    await expect(op.getByTestId('response-status')).toContainText('200')
    await expect(op.locator('img[alt]')).toBeVisible()
  })

  test('displays error status and body', async ({ page }) => {
    await mockApi(page, async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/problem+json',
        body: JSON.stringify({ title: 'Bad Request' }),
      })
    })

    await expandOperation(page, 'get:/error')
    await executeOperation(page, 'get:/error')

    const op = operationLocator(page, 'get:/error')
    await expect(op.getByTestId('response-status')).toContainText('400')
    await expect(op.getByTestId('response-body')).toContainText('Bad Request')
  })

  test('renders foldable json viewer for error responses', async ({ page }) => {
    await mockApi(page, async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          title: 'Bad Request',
          errors: [{ field: 'name', message: 'required' }],
        }),
      })
    })

    await expandOperation(page, 'get:/error')
    await executeOperation(page, 'get:/error')

    const viewer = responseJsonViewer(page, 'get:/error')
    await expect(viewer).toBeVisible()
    await expect(viewer.getByTestId('json-toggle-all-folds')).toBeVisible()
    await expect(jsonEditorInnerText(viewer)).resolves.toContain('required')

    await clickJsonFoldOnLineContaining(viewer, '"errors"')
    await expect.poll(async () => (await jsonEditorInnerText(viewer)).includes('required')).toBe(false)
  })

  test('shows response copy control for json bodies', async ({ page }) => {
    await mockApi(page, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'hello' }),
      })
    })

    await expandOperation(page, 'get:/json')
    await executeOperation(page, 'get:/json')

    const op = operationLocator(page, 'get:/json')
    await expect(op.getByTestId('response-body').getByTestId('json-viewer')).toBeVisible()
    await expect(op.getByTitle('Copy').first()).toBeVisible()
  })
})
