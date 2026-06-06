import { test, expect, type Page } from '@playwright/test'

const TAKE_SCREENSHOTS = process.env.SCREENSHOTS === '1'

// Nav links appear in both the sidebar and the bottom tab bar — .first() picks the sidebar link.
function navLink(page: Page, href: string) {
  return page.locator(`a[href="${href}"]`).first()
}

test.describe('Application Screenshots', () => {
  test.beforeEach(async ({ page }) => {
    // Enable presentation mode: the toggle loads demo data into DemoDB, waits 500 ms,
    // then calls window.location.reload(). Each test gets a fresh browser context so
    // presentation mode is always off at start.
    await page.goto('/settings', { waitUntil: 'networkidle' })
    const toggle = page.locator('label').filter({ hasText: 'Режим презентации' }).locator('button')
    await expect(toggle).toBeVisible()
    await toggle.click()
    // loadDemoData (async) + 500 ms delay + window.location.reload()
    await page.waitForTimeout(1000)
    await page.waitForLoadState('networkidle')
    await page.goto('/', { waitUntil: 'networkidle' })
  })

  test('01 - Portfolio Dashboard', async ({ page }) => {
    await expect(navLink(page, '/instruments')).toBeVisible()
    if (TAKE_SCREENSHOTS) {
      await page.screenshot({ path: 'docs/screenshots/01-portfolio.png', fullPage: false })
    }
  })

  test('02 - Instruments List', async ({ page }) => {
    const nav = navLink(page, '/instruments')
    await expect(nav).toBeVisible()
    await nav.click()
    await page.waitForLoadState('networkidle')
    await expect(page.locator('table')).toBeVisible()
    if (TAKE_SCREENSHOTS) {
      await page.screenshot({ path: 'docs/screenshots/02-instruments.png', fullPage: false })
    }
  })

  test('03 - Instrument Detail', async ({ page }) => {
    const nav = navLink(page, '/instruments')
    await expect(nav).toBeVisible()
    await nav.click()
    await page.waitForLoadState('networkidle')
    const firstRow = page.locator('table tbody tr:first-child')
    await expect(firstRow).toBeVisible()
    await firstRow.click()
    await page.waitForLoadState('networkidle')
    await expect(page.locator('h1')).toBeVisible()
    if (TAKE_SCREENSHOTS) {
      await page.screenshot({ path: 'docs/screenshots/03-instrument-detail.png', fullPage: false })
    }
  })

  test('04 - Payments Section', async ({ page }) => {
    const nav = navLink(page, '/instruments')
    await expect(nav).toBeVisible()
    await nav.click()
    await page.waitForLoadState('networkidle')
    const firstRow = page.locator('table tbody tr:first-child')
    await expect(firstRow).toBeVisible()
    await firstRow.click()
    await page.waitForLoadState('networkidle')
    const paymentsHeading = page.locator('text=Выплаты').first()
    await expect(paymentsHeading).toBeVisible()
    await paymentsHeading.scrollIntoViewIfNeeded()
    if (TAKE_SCREENSHOTS) {
      await page.screenshot({ path: 'docs/screenshots/04-payments.png', fullPage: false })
    }
  })

  test('05 - Calendar', async ({ page }) => {
    const nav = navLink(page, '/calendar')
    await expect(nav).toBeVisible()
    await nav.click()
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/calendar/)
    if (TAKE_SCREENSHOTS) {
      await page.screenshot({ path: 'docs/screenshots/05-calendar.png', fullPage: false })
    }
  })

  test('06 - Ledger', async ({ page }) => {
    const nav = navLink(page, '/ledger')
    await expect(nav).toBeVisible()
    await nav.click()
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/ledger/)
    if (TAKE_SCREENSHOTS) {
      await page.screenshot({ path: 'docs/screenshots/06-ledger.png', fullPage: false })
    }
  })

  test('07 - Settings', async ({ page }) => {
    const nav = navLink(page, '/settings')
    await expect(nav).toBeVisible()
    await nav.click()
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/settings/)
    if (TAKE_SCREENSHOTS) {
      await page.screenshot({ path: 'docs/screenshots/07-settings.png', fullPage: false })
    }
  })
})
