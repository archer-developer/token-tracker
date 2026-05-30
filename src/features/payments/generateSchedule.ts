import type { Instrument, PaymentFrequency, PaymentRecord } from '@/db/types'

// --- helpers ---

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInCalYear(year: number): number {
  return isLeapYear(year) ? 366 : 365
}

/** Inclusive day count between two dates (both in the same year assumed for monthly periods). */
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
 * Calculates interest income for a period using the White Paper formula:
 *   СПД = Σ (principal × rate/100 × 1/КДГ)  for each day in [start, end]
 *
 * KDG (days in calendar year) may differ between start and end when a period
 * spans Dec 31 → Jan 1. For monthly periods this never happens, but handled anyway.
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
  principal: number,
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

    const rawIncome = calcPeriodIncome(principal, couponRate, accrualStart, accrualEnd)
    const income = roundHalfUp(rawIncome, 2)

    const isLastPeriod = accrualEnd >= end
    const { from: payFrom, to: payTo } = paymentWindow(
      accrualEnd,
      isLastPeriod,
      paymentDayFrom,
      paymentDayTo,
    )

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

  records.push({
    instrumentId: id,
    periodIndex: periodIndex + 0.5,
    type: 'redemption',
    paymentDateFrom: toISO(end),
    paymentDateTo: toISO(end),
    expectedAmount: principal,
    status: 'scheduled',
  })

  return records
}
