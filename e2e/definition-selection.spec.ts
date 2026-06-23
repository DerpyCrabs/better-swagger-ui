import { expect, test } from '@playwright/test'
import { FIXTURE_PATH, loadSpec } from './helpers'

const multiDefSource = `${FIXTURE_PATH}/swagger-ui/config-url/index.html`

test.describe('definition selection', () => {
  test('keeps selected definition in dropdown after switch', async ({ page }) => {
    await loadSpec(page, multiDefSource)

    const select = page.getByTestId('definition-select')
    await expect(select).toHaveValue('API A')

    await select.selectOption('API B')
    await expect(page.getByTestId('api-title')).toHaveText('Definition B', { timeout: 15_000 })

    await expect(select).toHaveValue('API B')
  })

  test('writes definition to URL and keeps it after sync', async ({ page }) => {
    await loadSpec(page, multiDefSource)

    await page.getByTestId('definition-select').selectOption('API B')
    await expect(page.getByTestId('api-title')).toHaveText('Definition B', { timeout: 15_000 })

    await expect
      .poll(() => new URL(page.url()).searchParams.get('definition'))
      .toBe('API B')

    await expect(page.getByTestId('definition-select')).toHaveValue('API B')
  })

  test('does not reset definition when submitting the same URL again', async ({ page }) => {
    await loadSpec(page, multiDefSource)

    await page.getByTestId('definition-select').selectOption('API B')
    await expect(page.getByTestId('api-title')).toHaveText('Definition B', { timeout: 15_000 })
    await expect(page.getByTestId('definition-select')).toHaveValue('API B')

    await page.getByTestId('load-form').evaluate((form) => {
      ;(form as HTMLFormElement).requestSubmit()
    })

    await expect(page.getByTestId('api-title')).toHaveText('Definition B', { timeout: 15_000 })
    await expect(page.getByTestId('definition-select')).toHaveValue('API B')
    await expect
      .poll(() => new URL(page.url()).searchParams.get('definition'))
      .toBe('API B')
  })

  test('does not reset definition while refetch is in progress', async ({ page }) => {
    await loadSpec(page, multiDefSource)

    const select = page.getByTestId('definition-select')
    await select.selectOption('API B')

    await expect.poll(async () => select.inputValue()).toBe('API B')
    await expect(page.getByTestId('api-title')).toHaveText('Definition B', { timeout: 15_000 })
    await expect.poll(async () => select.inputValue()).toBe('API B')
  })
})
