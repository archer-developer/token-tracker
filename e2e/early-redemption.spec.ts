/**
 * E2E: early redemption of HELIEUR28 (Hello carsharing, Bynex) — real data.
 *
 * Fixture: all HELIEUR28 records (instrument, lots, payment schedule, ledger) from the user's
 * backup of 2026-11-11, before the instrument was marked as matured.
 *
 * Portal transaction history (HEL1EUR28, 10.08–10.11.2026):
 *   10.08.2026  coupon       70.32 EUR
 *   10.09.2026  coupon       70.32 EUR
 *   10.10.2026  coupon       68.05 EUR
 *   06.11.2026  redemption 9000.00 EUR   ← early, scheduled for 25.08.2028
 *   10.11.2026  coupon       70.32 EUR   ← last coupon (October period)
 *
 * See docs/adrs/0001-early-redemption-cancelled-payments.md
 */
import { readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'

interface Row {
  id: number
  [key: string]: unknown
}

const FIXTURE = JSON.parse(
  readFileSync(new URL('./fixtures/helieur28.json', import.meta.url), 'utf8'),
) as {
  instrument: Row
  purchaseLots: Row[]
  paymentRecords: Row[]
  ledgerEntries: Row[]
}
const ID = FIXTURE.instrument.id

const PORTAL = [
  { date: '2026-08-10', type: 'coupon', amount: 70.32 },
  { date: '2026-09-10', type: 'coupon', amount: 70.32 },
  { date: '2026-10-10', type: 'coupon', amount: 68.05 },
  { date: '2026-11-06', type: 'redemption', amount: 9000 },
  { date: '2026-11-10', type: 'coupon', amount: 70.32 },
]

async function seedDB(page: Page) {
  await page.evaluate(async (fixture) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('TokensTrackerDB')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const run = (name: string, fn: (s: IDBObjectStore) => void) =>
      new Promise<void>((res, rej) => {
        const tx = db.transaction(name, 'readwrite')
        fn(tx.objectStore(name))
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      })
    for (const name of ['instruments', 'purchaseLots', 'paymentRecords', 'ledgerEntries']) {
      await run(name, (s) => s.clear())
    }
    await run('instruments', (s) => s.put(fixture.instrument))
    await run('purchaseLots', (s) => fixture.purchaseLots.forEach((r) => s.put(r)))
    await run('paymentRecords', (s) => fixture.paymentRecords.forEach((r) => s.put(r)))
    await run('ledgerEntries', (s) => fixture.ledgerEntries.forEach((r) => s.put(r)))
    db.close()
  }, FIXTURE)
}

async function readDB(page: Page) {
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
    const result = {
      instruments: await read('instruments'),
      payments: await read('paymentRecords'),
      ledger: await read('ledgerEntries'),
    }
    db.close()
    return result
  })
}

async function openMaturedModal(page: Page) {
  await page.goto(`/instruments/${ID}`)
  await page.getByRole('button', { name: 'Погашено' }).click()
  return page.getByRole('dialog')
}

test.beforeEach(async ({ page }) => {
  // "Today" = backup date; the calendar opens on the current month.
  await page.clock.setFixedTime(new Date('2026-11-11T12:00:00'))
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await seedDB(page)
})

test('before redemption: December 2026 coupon 68.05 is in the calendar', async ({ page }) => {
  await page.goto('/calendar')
  await page.getByRole('button', { name: 'Next month' }).click()
  await expect(page.locator('body')).toContainText('68,05')
})

test('early redemption on 06.11.2026 matches the portal and cancels 22 future coupons', async ({
  page,
}) => {
  const dialog = await openMaturedModal(page)
  const dateInput = dialog.getByLabel('Дата фактического погашения')
  await expect(dateInput).toHaveValue('2026-11-11') // defaults to today
  await dateInput.fill('2026-11-06')

  await expect(dialog).toContainText('9 000,00')
  await expect(dialog.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  await expect(dialog).toContainText('(22)')
  await expect(dialog).toContainText('1 504,76')
  await expect(dialog).toContainText('отмечены как отменённые')
  await dialog.getByRole('button', { name: 'Подтвердить' }).click()

  await expect(page.getByText('Погашен', { exact: true })).toBeVisible()
  await expect(page.locator('body')).toContainText('06.11.2026')
  await page.getByRole('button', { name: 'История' }).click()
  await expect(page.getByText('Отменено').first()).toBeVisible()

  const { instruments, payments, ledger } = await readDB(page)
  expect(instruments[0]).toMatchObject({ status: 'matured', redemptionDate: '2026-11-06' })

  // Paid payments and ledger agree with the portal export
  for (const { date, type, amount } of PORTAL) {
    expect(payments, `${type} ${date}`).toContainEqual(
      expect.objectContaining({ type, status: 'paid', paidAt: date, actualAmount: amount }),
    )
    expect(ledger, `ledger ${type} ${date}`).toContainEqual(
      expect.objectContaining({ type, date, amount }),
    )
  }
  expect(ledger).toHaveLength(FIXTURE.ledgerEntries.length + 1) // only the redemption is added

  // Future coupons are cancelled but kept in the DB
  expect(payments).toHaveLength(FIXTURE.paymentRecords.length)
  const cancelled = payments.filter((p) => p.status === 'cancelled')
  expect(cancelled).toHaveLength(22)
  expect(cancelled.every((p) => (p.paymentDateFrom as string) >= '2026-12-10')).toBe(true)
  const cancelledSum = cancelled.reduce((s, p) => s + (p.expectedAmount as number), 0)
  expect(cancelledSum).toBeCloseTo(1504.76, 2)
  // Zero-amount periods before the first purchase stay untouched
  const scheduled = payments.filter((p) => p.status === 'scheduled')
  expect(scheduled.every((p) => p.expectedAmount === 0)).toBe(true)

  // Calendar: November keeps paid coupon + redemption, December is empty
  await page.goto('/calendar')
  await page.waitForLoadState('networkidle')
  await expect(page.locator('body')).toContainText('9 070,32')
  await page.getByRole('button', { name: 'Next month' }).click()
  await expect(page.locator('body')).not.toContainText('68,05')
})

test('toggle on: remaining coupons are paid on their scheduled dates', async ({ page }) => {
  const dialog = await openMaturedModal(page)
  await dialog.getByLabel('Дата фактического погашения').fill('2028-08-25')
  await dialog.getByRole('switch').click()
  await expect(dialog).toContainText('отмечены как выплаченные')
  await dialog.getByRole('button', { name: 'Подтвердить' }).click()
  await expect(page.getByText('Погашен', { exact: true })).toBeVisible()

  const { payments, ledger } = await readDB(page)
  expect(payments.some((p) => p.status === 'cancelled')).toBe(false)
  expect(payments).toContainEqual(
    expect.objectContaining({ type: 'coupon', status: 'paid', paidAt: '2026-12-10' }),
  )
  expect(payments).toContainEqual(
    expect.objectContaining({ type: 'redemption', status: 'paid', paidAt: '2028-08-25' }),
  )
  expect(ledger).toHaveLength(FIXTURE.ledgerEntries.length + 22 + 1)
})
