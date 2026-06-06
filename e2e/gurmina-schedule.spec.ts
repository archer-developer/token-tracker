/**
 * E2E: GURMINA.USD.2024.01 — payment schedule UI verification
 *
 * Seeds IndexedDB directly with the Gurmina instrument, purchase lots, and a
 * subset of payment records that the fixed algorithm produces, then verifies the UI.
 *
 * Reference: docs/examples/gurnima-algorithm.md
 * Amounts verified in: src/features/payments/generateSchedule.test.ts
 */
import { test, expect, type Page } from '@playwright/test'

const INSTRUMENT = {
  id: 1,
  name: 'GURMINA.USD.2024.01',
  platform: 'Fainex',
  currency: 'USD',
  couponRate: 11,
  startDate: '2024-12-30',
  endDate: '2026-12-14',
  paymentFrequency: 'monthly',
  paymentDayFrom: 15,
  paymentDayTo: 18,
  status: 'active',
  createdAt: '2024-12-30T00:00:00.000Z',
  updatedAt: '2024-12-30T00:00:00.000Z',
}

// Lot 1: Jan 9 — first purchase; Lot 2: Jan 26 — top-up to 502 tokens total
const PURCHASE_LOTS = [
  {
    id: 1,
    instrumentId: 1,
    purchaseDate: '2025-01-09',
    quantity: 284,
    pricePerToken: 20,
    totalCost: 5680,
    createdAt: '2025-01-09T00:00:00.000Z',
  },
  {
    id: 2,
    instrumentId: 1,
    purchaseDate: '2025-01-26',
    quantity: 218,
    pricePerToken: 20,
    totalCost: 4360,
    createdAt: '2025-01-26T00:00:00.000Z',
  },
]

// Subset of payment records produced by the algorithm.
//
// Period 0  (Dec 30–31, 2024): 0 — Lot 1 bought Jan 9, after period end → no income
// Period 1  (Jan 1–31, 2025):  47.25 — weighted by lot purchase dates, pays Feb 15 2025
//   Lot 1 active Jan 9–25   (17 days):      5680 × 0.11 × 17 / 365 = 29.10
//   Lot 1+2 active Jan 26–31 (6 days): 10 040 × 0.11 ×  6 / 365 = 18.15
// Period 2  (Feb 1–28, 2025):  84.72 — 10040 × 0.11 × 28 / 365, pays Mar 15 2025
// Period 14 (Feb 1–28, 2026):  84.72 — same formula, pays Mar 15 2026
// Period 15 (Mar 1–31, 2026):  93.80 — 10040 × 0.11 × 31 / 365, pays Apr 15 2026
// Period 16 (Apr 1–30, 2026):  90.77 — 10040 × 0.11 × 30 / 365, pays May 15 2026
const PAYMENT_RECORDS = [
  {
    id: 1,
    instrumentId: 1,
    periodIndex: 0,
    type: 'coupon',
    paymentDateFrom: '2025-01-15',
    paymentDateTo: '2025-01-18',
    expectedAmount: 0,
    status: 'scheduled',
  },
  {
    id: 2,
    instrumentId: 1,
    periodIndex: 1,
    type: 'coupon',
    paymentDateFrom: '2025-02-15',
    paymentDateTo: '2025-02-18',
    expectedAmount: 47.25,
    status: 'scheduled',
  },
  {
    id: 3,
    instrumentId: 1,
    periodIndex: 2,
    type: 'coupon',
    paymentDateFrom: '2025-03-15',
    paymentDateTo: '2025-03-18',
    expectedAmount: 84.72,
    status: 'scheduled',
  },
  {
    id: 15,
    instrumentId: 1,
    periodIndex: 14,
    type: 'coupon',
    paymentDateFrom: '2026-03-15',
    paymentDateTo: '2026-03-18',
    expectedAmount: 84.72,
    status: 'scheduled',
  },
  {
    id: 16,
    instrumentId: 1,
    periodIndex: 15,
    type: 'coupon',
    paymentDateFrom: '2026-04-15',
    paymentDateTo: '2026-04-18',
    expectedAmount: 93.8,
    status: 'scheduled',
  },
  {
    id: 17,
    instrumentId: 1,
    periodIndex: 16,
    type: 'coupon',
    paymentDateFrom: '2026-05-15',
    paymentDateTo: '2026-05-18',
    expectedAmount: 90.77,
    status: 'scheduled',
  },
]

async function seedDB(page: Page) {
  await page.evaluate(
    async ({ instrument, lots, payments }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('TokensTrackerDB')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })

      const clearStore = (name: string) =>
        new Promise<void>((res, rej) => {
          const tx = db.transaction(name, 'readwrite')
          tx.objectStore(name).clear().onsuccess = () => res()
          tx.onerror = () => rej(tx.error)
        })

      const putRecord = (name: string, record: object) =>
        new Promise<void>((res, rej) => {
          const tx = db.transaction(name, 'readwrite')
          tx.objectStore(name).put(record).onsuccess = () => res()
          tx.onerror = () => rej(tx.error)
        })

      await clearStore('instruments')
      await clearStore('purchaseLots')
      await clearStore('paymentRecords')

      await putRecord('instruments', instrument)
      for (const lot of lots) await putRecord('purchaseLots', lot)
      for (const p of payments) await putRecord('paymentRecords', p)
    },
    { instrument: INSTRUMENT, lots: PURCHASE_LOTS, payments: PAYMENT_RECORDS },
  )
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await seedDB(page)
  await page.goto('/instruments/1')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(800)
})

test('payment schedule shows weighted January and later-period amounts', async ({ page }) => {
  const pageText = await page.locator('body').innerText()
  // ru locale uses comma as decimal separator
  expect(pageText).toContain('47,25') // January 2025 — weighted by lot purchase dates
  expect(pageText).toContain('84,72') // February 2025 and February 2026
  expect(pageText).toContain('93,80') // March 2026
  expect(pageText).toContain('90,77') // April 2026
})

test('payment dates show correct month and year after accrual period', async ({ page }) => {
  const pageText = await page.locator('body').innerText()
  // Period 0 (Dec 30–31, 2024) has 0 amount and is not rendered by the UI
  expect(pageText).toContain('15.02.2025') // Jan 2025 period
  expect(pageText).toContain('15.03.2025') // Feb 2025 period
  expect(pageText).toContain('15.03.2026') // Feb 2026 period — year must be 2026
  expect(pageText).toContain('15.04.2026') // Mar 2026 period
  expect(pageText).toContain('15.05.2026') // Apr 2026 period
})

test('purchase lots show correct token counts and price', async ({ page }) => {
  const pageText = await page.locator('body').innerText()
  expect(pageText).toContain('284') // Lot 1 quantity
  expect(pageText).toContain('218') // Lot 2 quantity
  expect(pageText).toMatch(/20[,.]00/) // price per token
})
