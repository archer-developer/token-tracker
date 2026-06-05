import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { useUIStore } from '@/store/uiStore'
import { formatMonthYearShort } from '@/shared/utils/format'
import type { Currency } from '@/db/types'

export interface TimelinePoint {
  monthISO: string
  label: string
  labelMobile: string
  /** Cumulative net P&L for months up to and including today */
  historical: number | null
  /** Cumulative net P&L for months after today (projected) */
  projected: number | null
}

function cvt(amount: number, from: Currency, to: Currency, rateMap: Map<string, number>): number {
  if (from === to) return amount
  const fromRate = from === 'BYN' ? 1 : (rateMap.get(from) ?? 1)
  const toRate = to === 'BYN' ? 1 : (rateMap.get(to) ?? 1)
  return (amount * fromRate) / toRate
}

function isoToLabel(iso: string): string {
  const [y, m] = iso.split('-')
  return formatMonthYearShort(new Date(Number(y), Number(m) - 1, 1))
}

function isoToLabelMobile(iso: string): string {
  const [y, m] = iso.split('-')
  return `${m}/${y?.slice(-2) ?? ''}`
}

function monthRange(start: string, end: string): string[] {
  const months: string[] = []
  const startParts = start.split('-').map(Number)
  const endParts = end.split('-').map(Number)
  let y = startParts[0] ?? 0
  let m = startParts[1] ?? 1
  const ey = endParts[0] ?? 0
  const em = endParts[1] ?? 1
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`)
    if (++m > 12) {
      m = 1
      y++
    }
  }
  return months
}

function addDelta(map: Map<string, number>, month: string, delta: number) {
  map.set(month, (map.get(month) ?? 0) + delta)
}

export function useCashFlowTimeline(): TimelinePoint[] {
  const { baseCurrency } = useUIStore()

  const result = useLiveQuery(async () => {
    const [ledgerEntries, paymentRecords, instruments, exchangeRates] = await Promise.all([
      db.ledgerEntries.toArray(),
      db.paymentRecords.toArray(),
      db.instruments.toArray(),
      db.exchangeRates.toArray(),
    ])

    const rateMap = new Map<string, number>()
    for (const r of exchangeRates) rateMap.set(r.currency, r.rate)

    const instMap = new Map<number, (typeof instruments)[0]>()
    for (const inst of instruments) {
      if (inst.id != null) instMap.set(inst.id, inst)
    }

    const todayMonth = new Date().toISOString().slice(0, 7)

    // P&L = coupon income + recoveries − default losses.
    // Purchases and redemptions are principal movements — not P&L.

    const histDeltas = new Map<string, number>()
    const futureDeltas = new Map<string, number>()

    // ── Historical: coupon and recovery ledger entries ──────────────────────
    for (const entry of ledgerEntries) {
      if (entry.type !== 'coupon' && entry.type !== 'recovery') continue
      const inst = instMap.get(entry.instrumentId)
      if (!inst) continue
      const amt = cvt(entry.amount, inst.currency, baseCurrency, rateMap)
      addDelta(histDeltas, entry.date.slice(0, 7), amt)
    }

    // ── Default events: loss crystallises at defaultDate ────────────────────
    for (const inst of instruments) {
      if (inst.status !== 'defaulted' || !inst.defaultDate || !inst.defaultOutstandingPrincipal)
        continue
      const loss = cvt(inst.defaultOutstandingPrincipal, inst.currency, baseCurrency, rateMap)
      const month = inst.defaultDate.slice(0, 7)
      if (month <= todayMonth) {
        addDelta(histDeltas, month, -loss)
      } else {
        addDelta(futureDeltas, month, -loss)
      }
    }

    // ── Future: scheduled coupons for active instruments ────────────────────
    for (const p of paymentRecords) {
      if (p.status !== 'scheduled' || p.expectedAmount <= 0 || p.type === 'redemption') continue
      const month = p.paymentDateTo.slice(0, 7)
      if (month <= todayMonth) continue
      const inst = instMap.get(p.instrumentId)
      if (!inst || inst.status !== 'active') continue
      const amt = cvt(p.expectedAmount, inst.currency, baseCurrency, rateMap)
      addDelta(futureDeltas, month, amt)
    }

    // ── Future: expected recoveries for defaulted instruments ───────────────
    for (const inst of instruments) {
      if (inst.status !== 'defaulted' || !inst.expectedRecoveryDate || !inst.expectedRecoveryRate)
        continue
      const recoveryMonth = inst.expectedRecoveryDate.slice(0, 7)
      if (recoveryMonth <= todayMonth) continue
      const entries = ledgerEntries.filter((e) => e.instrumentId === inst.id)
      let purchases = 0
      let recoveries = 0
      for (const e of entries) {
        if (e.type === 'purchase') purchases += e.amount
        if (e.type === 'recovery') recoveries += e.amount
      }
      const outstanding = inst.defaultOutstandingPrincipal ?? purchases
      const additional = (outstanding * inst.expectedRecoveryRate) / 100 - recoveries
      if (additional > 0) {
        addDelta(futureDeltas, recoveryMonth, cvt(additional, inst.currency, baseCurrency, rateMap))
      }
    }

    // ── Build month range ───────────────────────────────────────────────────
    const histKeys = [...histDeltas.keys()].sort()
    const futureKeys = [...futureDeltas.keys()].sort()

    if (histKeys.length === 0 && futureKeys.length === 0) return []

    const startMonth = histKeys[0] ?? futureKeys[0]
    const endMonth = futureKeys[futureKeys.length - 1] ?? histKeys[histKeys.length - 1]

    // Include today's month as seam even if no activity this month
    const allKeySet = new Set([...histKeys, todayMonth, ...futureKeys])
    const effectiveStart = [...allKeySet].sort()[0] ?? startMonth!
    const allMonths = monthRange(effectiveStart, endMonth!)

    // ── Cumulative series ───────────────────────────────────────────────────
    const points: TimelinePoint[] = []
    let cumulative = 0

    for (const month of allMonths) {
      if (month <= todayMonth) {
        cumulative += histDeltas.get(month) ?? 0
        const isSeam = month === todayMonth
        points.push({
          monthISO: month,
          label: isoToLabel(month),
          labelMobile: isoToLabelMobile(month),
          historical: cumulative,
          projected: isSeam ? cumulative : null,
        })
      } else {
        cumulative += futureDeltas.get(month) ?? 0
        points.push({
          monthISO: month,
          label: isoToLabel(month),
          labelMobile: isoToLabelMobile(month),
          historical: null,
          projected: cumulative,
        })
      }
    }

    return points
  }, [baseCurrency])

  return result ?? []
}
