import { expect, test } from '@playwright/test'
import { loadSpec, operationLocator, specUrl, FIXTURE_PATH } from './helpers'

test.describe('URL routing', () => {
  test('deep link expands operation', async ({ page }) => {
    await page.goto('/')
    const spec = `${new URL(page.url()).origin}${specUrl('minimal.json')}`
    await page.goto(`/?url=${encodeURIComponent(spec)}&op=${encodeURIComponent('get:/pets')}`)
    await expect(page.getByTestId('api-title')).toHaveText('Minimal API')
    await expect(operationLocator(page, 'get:/pets').getByTestId('execute')).toBeVisible()
  })

  test('updates op param when expanding operation', async ({ page }) => {
    await loadSpec(page, specUrl('minimal.json'))
    await page.getByTestId('tag-section-pets').getByRole('button').click()
    await operationLocator(page, 'get:/pets').getByRole('button').first().click()
    await expect
      .poll(() => new URL(page.url()).searchParams.get('op'))
      .toBe('get:/pets')
  })

  test('preserves definition param on reload', async ({ page }) => {
    await page.goto('/')
    const source = `${new URL(page.url()).origin}${FIXTURE_PATH}/swagger-ui/config-url/index.html`
    await page.goto(
      `/?url=${encodeURIComponent(source)}&definition=${encodeURIComponent('API B')}`,
    )
    await expect(page.getByTestId('api-title')).toHaveText('Definition B')
    await page.reload()
    await expect(page.getByTestId('api-title')).toHaveText('Definition B')
  })
})
