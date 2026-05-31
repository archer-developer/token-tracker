import type { Instrument, PaymentFrequency, PaymentRecord, PurchaseLot } from '@/db/types'

// --- helpers ---

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInCalYear(year: number): number {
  return isLeapYear(year) ? 366 : 365
}

/** Inclusive day count between two dates. */
function dayCount(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1
}

function toISO(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function windowForMonth(year: number, month: number, dayFrom: number, dayTo: number) {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const from = new Date(year, month, Math.min(dayFrom, daysInMonth))
  const to = new Date(year, month, Math.min(dayTo, daysInMonth))
  return { from: toISO(from), to: toISO(to) }
}

/**
 * Calculates interest income for a single sub-period with a fixed principal.
 * Handles periods that span a Dec 31 → Jan 1 boundary.
 */
function calcPeriodIncome(principal: number, rate: number, start: Date, end: Date): number {
  const sy = start.getFullYear()
  const ey = end.getFullYear()

  if (sy === ey) {
    return ((principal * rate) / 100 / daysInCalYear(sy)) * dayCount(start, end)
  }

  // Cross-year: Dec 31 of start year + Jan 1..end of end year
  const dec31 = new Date(sy, 11, 31)
  const jan1 = new Date(ey, 0, 1)
  const daysFirst = dayCount(start, dec31)
  const daysSecond = dayCount(jan1, end)

  return (
    ((principal * rate) / 100) * (daysFirst / daysInCalYear(sy) + daysSecond / daysInCalYear(ey))
  )
}

/**
 * Calculates coupon income for an accrual period using the White Paper formula:
 *   СПД = Σ (СТВi × СД/100 × 1/КДГ)  for each day i in [periodStart, periodEnd]
 *
 * Where СТВi (amount invested on day i) changes when new purchase lots are added.
 *
 * Two kinds of lots are eligible:
 *  - Lots purchased during [periodStart, periodEnd]: prorated from purchase date (breakpoints)
 *  - Lots purchased after periodEnd but before paymentCutoff: "catch-up" lots — the platform
 *    pays the full period income to whoever holds tokens at the payment date, so these
 *    contribute as if they were purchased on periodStart.
 */
function calcIncomeForPeriod(
  lots: PurchaseLot[],
  rate: number,
  periodStart: Date,
  periodEnd: Date,
  paymentCutoff: Date,
): number {
  const periodStartISO = toISO(periodStart)
  const periodEndISO = toISO(periodEnd)
  const paymentCutoffISO = toISO(paymentCutoff)

  // All lots whose purchase date is on or before the payment cutoff
  const eligible = [...lots]
    .filter((l) => l.purchaseDate <= paymentCutoffISO)
    .sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate))

  if (eligible.length === 0) return 0

  // Pre-period lots: active from the start of the period
  const prePrincipal = eligible
    .filter((l) => l.purchaseDate <= periodStartISO)
    .reduce((sum, l) => sum + l.totalCost, 0)

  // Catch-up lots: purchased after accrual end but before payment — full period income
  const catchUpPrincipal = eligible
    .filter((l) => l.purchaseDate > periodEndISO)
    .reduce((sum, l) => sum + l.totalCost, 0)

  // Base principal is active for the ENTIRE accrual period
  const basePrincipal = prePrincipal + catchUpPrincipal

  // Within-period lots create sub-period breakpoints (prorated from purchase date)
  const withinPeriodLots = eligible.filter(
    (l) => l.purchaseDate > periodStartISO && l.purchaseDate <= periodEndISO,
  )

  if (withinPeriodLots.length === 0) {
    if (basePrincipal === 0) return 0
    return calcPeriodIncome(basePrincipal, rate, periodStart, periodEnd)
  }

  const breakpointISOs = [...new Set(withinPeriodLots.map((l) => l.purchaseDate))].sort()

  let totalIncome = 0
  let subStartISO = periodStartISO

  for (const bpISO of breakpointISOs) {
    const subEndDate = new Date(bpISO)
    subEndDate.setDate(subEndDate.getDate() - 1)
    const subEndISO = toISO(subEndDate)

    if (subEndISO >= subStartISO) {
      const withinSub = withinPeriodLots
        .filter((l) => l.purchaseDate <= subStartISO)
        .reduce((sum, l) => sum + l.totalCost, 0)

      const subPrincipal = basePrincipal + withinSub
      if (subPrincipal > 0) {
        totalIncome += calcPeriodIncome(subPrincipal, rate, new Date(subStartISO), subEndDate)
      }
    }

    subStartISO = bpISO
  }

  // Final sub-period
  const withinFinal = withinPeriodLots
    .filter((l) => l.purchaseDate <= subStartISO)
    .reduce((sum, l) => sum + l.totalCost, 0)

  const finalPrincipal = basePrincipal + withinFinal
  if (finalPrincipal > 0) {
    totalIncome += calcPeriodIncome(finalPrincipal, rate, new Date(subStartISO), periodEnd)
  }

  return totalIncome
}

/** Round half up to `decimals` places, as specified in the White Paper. */
function roundHalfUp(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

// --- period step helpers ---

function periodEndDate(accrualStart: Date, freq: PaymentFrequency, customDays?: number): Date {
  if (freq === 'custom' && customDays) {
    const d = new Date(accrualStart)
    d.setDate(d.getDate() + customDays - 1)
    return d
  }
  const monthsInPeriod = freq === 'quarterly' ? 3 : 1
  // Last day of the Nth month from accrualStart
  return new Date(accrualStart.getFullYear(), accrualStart.getMonth() + monthsInPeriod, 0)
}

function nextPeriodStart(accrualEnd: Date, freq: PaymentFrequency, customDays?: number): Date {
  if (freq === 'custom' && customDays) {
    const d = new Date(accrualEnd)
    d.setDate(d.getDate() + 1)
    return d
  }
  // 1st of the month after accrualEnd
  return new Date(accrualEnd.getFullYear(), accrualEnd.getMonth() + 1, 1)
}

function paymentWindow(
  accrualEnd: Date,
  isLastPeriod: boolean,
  dayFrom: number,
  dayTo: number,
): { from: string; to: string } {
  const lastDayOfAccrualMonth = new Date(
    accrualEnd.getFullYear(),
    accrualEnd.getMonth() + 1,
    0,
  ).getDate()

  // Last period that ends before the end of its month (e.g. 14.12.2026) — payment same month
  if (isLastPeriod && accrualEnd.getDate() < lastDayOfAccrualMonth) {
    return windowForMonth(accrualEnd.getFullYear(), accrualEnd.getMonth(), dayFrom, dayTo)
  }

  // Normal: payment in the next calendar month
  const payMonth = accrualEnd.getMonth() === 11 ? 0 : accrualEnd.getMonth() + 1
  const payYear =
    accrualEnd.getMonth() === 11 ? accrualEnd.getFullYear() + 1 : accrualEnd.getFullYear()
  return windowForMonth(payYear, payMonth, dayFrom, dayTo)
}

// --- public API ---

export function generateSchedule(
  instrument: Instrument,
  lots: PurchaseLot[],
): Omit<PaymentRecord, 'id'>[] {
  const {
    id,
    couponRate,
    paymentFrequency,
    paymentDayFrom,
    paymentDayTo,
    startDate,
    endDate,
    customFrequencyDays,
  } = instrument
  if (!id) return []

  const records: Omit<PaymentRecord, 'id'>[] = []
  const end = new Date(endDate)

  let accrualStart = new Date(startDate)
  let periodIndex = 0

  while (accrualStart <= end) {
    const naturalEnd = periodEndDate(accrualStart, paymentFrequency, customFrequencyDays)
    const accrualEnd = naturalEnd <= end ? naturalEnd : end
    const isLastPeriod = accrualEnd >= end

    const { from: payFrom, to: payTo } = paymentWindow(
      accrualEnd,
      isLastPeriod,
      paymentDayFrom,
      paymentDayTo,
    )

    // Pass paymentDateFrom as the cutoff: lots purchased before the payment date are eligible
    // for catch-up income on past accrual periods they missed.
    const rawIncome = calcIncomeForPeriod(
      lots,
      couponRate,
      accrualStart,
      accrualEnd,
      new Date(payFrom),
    )
    const income = roundHalfUp(rawIncome, 2)

    records.push({
      instrumentId: id,
      periodIndex,
      type: 'coupon',
      paymentDateFrom: payFrom,
      paymentDateTo: payTo,
      expectedAmount: income,
      status: 'scheduled',
    })

    if (isLastPeriod) break

    accrualStart = nextPeriodStart(accrualEnd, paymentFrequency, customFrequencyDays)
    periodIndex++
  }

  const totalPrincipal = lots.reduce((sum, l) => sum + l.totalCost, 0)
  records.push({
    instrumentId: id,
    periodIndex: periodIndex + 0.5,
    type: 'redemption',
    paymentDateFrom: toISO(end),
    paymentDateTo: toISO(end),
    expectedAmount: totalPrincipal,
    status: 'scheduled',
  })

  return records
}
