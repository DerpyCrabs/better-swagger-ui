import { expect, test } from '@playwright/test'
import { expandOperation, loadSpec, specUrl } from './helpers'

test.describe('browse API documentation', () => {
  test.beforeEach(async ({ page }) => {
    await loadSpec(page, specUrl('multi-tag.json'))
  })

  test('renders API metadata and markdown description', async ({ page }) => {
    await expect(page.getByTestId('api-title')).toHaveText('Multi Tag API')
    await expect(page.getByText('v2.0.0')).toBeVisible()
    await expect(page.getByText('multiple')).toBeVisible()
    await expect(page.getByText('/fixtures/mock-api')).toBeVisible()
  })

  test('collapses and expands tag sections', async ({ page }) => {
    const tagToggle = page.getByTestId('tag-section-alpha').locator(':scope > button').first()
    await tagToggle.click()
    await expect(page.getByTestId('operation-get:/alpha/a')).toBeVisible()
    await tagToggle.click()
    await expect(page.getByTestId('operation-get:/alpha/a')).not.toBeVisible()
    await tagToggle.click()
    await expect(page.getByTestId('operation-get:/alpha/a')).toBeVisible()
  })

  test('shows operation method, path, summary, and lock icon', async ({ page }) => {
    await page.getByTestId('tag-section-alpha').getByRole('button').click()
    const header = page.getByTestId('operation-get:/alpha/a').getByRole('button').first()
    await expect(header).toContainText('get')
    await expect(header).toContainText('/alpha/a')
    await expect(header).toContainText('Alpha A')
    await expect(header.locator('svg')).not.toHaveCount(0)
  })

  test('public operation has no lock icon', async ({ page }) => {
    await page.getByTestId('tag-section-beta').getByRole('button').click()
    const headerHtml = await page
      .getByTestId('operation-get:/beta/x')
      .getByRole('button')
      .first()
      .innerHTML()
    expect(headerHtml).not.toContain('lucide-lock')
  })

  test('expands schema composition with refs and allOf', async ({ page }) => {
    await loadSpec(page, specUrl('schemas-composition.json'))
    await expandOperation(page, 'get:/pets/{id}')
    await expect(page.getByText('Responses', { exact: true })).toBeVisible()
    await expect(page.getByText('200', { exact: true })).toBeVisible()
  })

  test('shows no request body schema section for $ref requestBody (regression)', async ({ page }) => {
    await loadSpec(page, specUrl('refs-limits.json'))
    await expandOperation(page, 'post:/items')
    await expect(page.getByText('Create with ref body')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Request body' })).not.toBeVisible()
  })
})
