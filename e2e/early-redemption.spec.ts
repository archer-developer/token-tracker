/**
 * E2E: early redemption of HELIEUR28 (Hello carsharing, Bynex).
 *
 * The issuer returned the principal (9000 EUR) on 06.11.2026 instead of 25.08.2028.
 * The last coupon (70.32 EUR) came on 10.11.2026; later coupons will never be paid.
 *
 * See docs/adrs/0001-early-redemption-cancelled-payments.md
 */
import { test, expect, type Page } from '@playwright/test'

const INSTRUMENT = {
  id: 12,
  name: 'HELIEUR28',
  platform: 'Bynex',
  currency: 'EUR',
  couponRate: 9.2,
  tokenPrice: 50,
  startDate: '2025-05-24',
  endDate: '2028-08-25',
  paymentFrequency: 'monthly',
  paymentDayFrom: 10,
  paymentDayTo: 10,
  status: 'active',
  createdAt: '2026-05-31T16:13:47.650Z',
  updatedAt: '2026-05-31T16:13:47.650Z',
}

const PAYMENT_RECORDS = [
  {
    id: 1496,
    instrumentId: 12,
    periodIndex: 17,
    type: 'coupon',
    paymentDateFrom: '2026-11-10',
    paymentDateTo: '2026-11-10',
    expectedAmount: 70.32,
    actualAmount: 70.32,
    paidAt: '2026-11-10',
    status: 'paid',
  },
  {
    id: 1497,
    instrumentId: 12,
    periodIndex: 18,
    type: 'coupon',
    paymentDateFrom: '2026-12-10',
    paymentDateTo: '2026-12-10',
    expectedAmount: 68.05,
    status: 'scheduled',
  },
  {
    id: 1498,
    instrumentId: 12,
    periodIndex: 19,
    type: 'coupon',
    paymentDateFrom: '2027-01-10',
    paymentDateTo: '2027-01-10',
    expectedAmount: 70.32,
    status: 'scheduled',
  },
  {
    id: 1519,
    instrumentId: 12,
    periodIndex: 39.5,
    type: 'redemption',
    paymentDateFrom: '2028-08-25',
    paymentDateTo: '2028-08-25',
    expectedAmount: 9000,
    status: 'scheduled',
  },
]

async function seedDB(page: Page) {
  await page.evaluate(
    async ({ instrument, payments }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('TokensTrackerDB')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      const run = (name: string, fn: (s: IDBObjectStore) => IDBRequest) =>
        new Promise<void>((res, rej) => {
          const tx = db.transaction(name, 'readwrite')
          fn(tx.objectStore(name))
          tx.oncomplete = () => res()
          tx.onerror = () => rej(tx.error)
        })
      for (const name of ['instruments', 'purchaseLots', 'paymentRecords', 'ledgerEntries']) {
        await run(name, (s) => s.clear())
      }
      await run('instruments', (s) => s.put(instrument))
      for (const p of payments) await run('paymentRecords', (s) => s.put(p))
      db.close()
    },
    { instrument: INSTRUMENT, payments: PAYMENT_RECORDS },
  )
}

async function readPayments(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('TokensTrackerDB')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const read = (name: string) =>
      new Promise<Record<string, unknown>[]>((res, rej) => {
        const req = db.transaction(name).objectStore(name).getAll()
        req.onsuccess = () => res(req.result)
        req.onerror = () => rej(req.error)
      })
    const result = { payments: await read('paymentRecords'), ledger: await read('ledgerEntries') }
    db.close()
    return result
  })
}

test.beforeEach(async ({ page }) => {
  // Calendar opens on the current month — pin it to December 2026 (first cancelled coupon).
  await page.clock.setFixedTime(new Date('2026-12-01T12:00:00'))
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await seedDB(page)
})

test('calendar shows the December coupon before redemption', async ({ page }) => {
  await page.goto('/calendar')
  await expect(page.locator('body')).toContainText('68,05')
})

test('early redemption cancels future coupons and hides them from the calendar', async ({
  page,
}) => {
  await page.goto('/instruments/12')
  await page.getByRole('button', { name: 'Погашено' }).click()

  const dialog = page.getByRole('dialog')
  const dateInput = dialog.getByLabel('Дата фактического погашения')
  await expect(dateInput).toHaveValue('2026-12-01') // defaults to today
  await dateInput.fill('2026-11-06')

  // Default: coupons are cancelled, not paid
  await expect(dialog.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  await expect(dialog).toContainText('отмечены как отменённые')
  await dialog.getByRole('button', { name: 'Подтвердить' }).click()

  await expect(page.getByText('Погашен', { exact: true })).toBeVisible()
  await expect(page.locator('body')).toContainText('06.11.2026')

  await page.getByRole('button', { name: 'История' }).click()
  await expect(page.getByText('Отменено').first()).toBeVisible()

  const { payments, ledger } = await readPayments(page)
  const status = Object.fromEntries(payments.map((p) => [p.id as number, p.status]))
  expect(status).toEqual({ 1496: 'paid', 1497: 'cancelled', 1498: 'cancelled', 1519: 'paid' })
  expect(payments.find((p) => p.id === 1519)).toMatchObject({ paidAt: '2026-11-06' })
  expect(ledger).toHaveLength(1)
  expect(ledger[0]).toMatchObject({ type: 'redemption', date: '2026-11-06', amount: 9000 })

  await page.goto('/calendar')
  await page.waitForLoadState('networkidle')
  await expect(page.locator('body')).not.toContainText('68,05')
})

test('toggle on marks remaining coupons as paid on their scheduled dates', async ({ page }) => {
  await page.goto('/instruments/12')
  await page.getByRole('button', { name: 'Погашено' }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Дата фактического погашения').fill('2028-08-25')
  await dialog.getByRole('switch').click()
  await expect(dialog).toContainText('отмечены как выплаченные')
  await dialog.getByRole('button', { name: 'Подтвердить' }).click()
  await expect(page.getByText('Погашен', { exact: true })).toBeVisible()

  const { payments, ledger } = await readPayments(page)
  expect(payments.every((p) => p.status === 'paid')).toBe(true)
  expect(payments.find((p) => p.id === 1497)).toMatchObject({ paidAt: '2026-12-10' })
  expect(ledger).toHaveLength(3)
})
