import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { xirr } from '@/services/xirr/xirr'
import { useUIStore } from '@/store/uiStore'
import type { Currency, Instrument, LedgerEntry, PaymentRecord } from '@/db/types'

export interface PortfolioMetrics {
  totalInvested: number
  activePrincipal: number
  repaidPrincipal: number
  defaultedPrincipal: number
  portfolioValue: number
  xirrValue: number | null
  realizedPL: number
  unrealizedPL: number
  recoveredPrincipal: number
  recoveryRatio: number | null
  largestLoss: number | null
  counts: {
    active: number
    matured: number
    defaulted: number
    sold: number
  }
  scenarioXIRRs: Array<{ label: string; rate: number | null }>
  isLoading: boolean
}

const SCENARIO_RATES = [0, 0.25, 0.5, 0.75, 1.0]
const SCENARIO_LABELS = ['Worst', 'Conservative', 'Moderate', 'Optimistic', 'Full Recovery']

export function usePortfolioMetrics(): PortfolioMetrics {
  const { baseCurrency } = useUIStore()

  const result = useLiveQuery(async () => {
    const [instruments, ledgerEntries, paymentRecords, exchangeRates] = await Promise.all([
      db.instruments.toArray(),
      db.ledgerEntries.toArray(),
      db.paymentRecords.toArray(),
      db.exchangeRates.toArray(),
    ])

    if (instruments.length === 0) {
      return {
        totalInvested: 0,
        activePrincipal: 0,
        repaidPrincipal: 0,
        defaultedPrincipal: 0,
        portfolioValue: 0,
        xirrValue: null,
        realizedPL: 0,
        unrealizedPL: 0,
        recoveredPrincipal: 0,
        recoveryRatio: null,
        largestLoss: null,
        counts: { active: 0, matured: 0, defaulted: 0, sold: 0 },
        scenarioXIRRs: SCENARIO_LABELS.map((label) => ({ label, rate: null })),
        isLoading: false,
      }
    }

    // Pre-load current exchange rates
    const rateMap = new Map<string, number>()
    for (const r of exchangeRates) rateMap.set(r.currency, r.rate)

    // Convert amount to baseCurrency.
    // appliedRate: historical BYN rate of the source currency (from ledger entry).
    // When undefined, falls back to the current rate from rateMap.
    function toBase(amount: number, from: Currency, appliedRate?: number): number {
      if (from === baseCurrency) return amount
      const fromRate = from === 'BYN' ? 1 : (appliedRate ?? rateMap.get(from) ?? 1)
      const fromBYN = amount * fromRate
      if (baseCurrency === 'BYN') return fromBYN
      return fromBYN / (rateMap.get(baseCurrency) ?? 1)
    }

    // Group ledger entries by instrument
    const ledgerByInstrument = new Map<number, LedgerEntry[]>()
    for (const entry of ledgerEntries) {
      const list = ledgerByInstrument.get(entry.instrumentId) ?? []
      list.push(entry)
      ledgerByInstrument.set(entry.instrumentId, list)
    }

    // Group payments by instrument
    const paymentsByInstrument = new Map<number, PaymentRecord[]>()
    for (const rec of paymentRecords) {
      const list = paymentsByInstrument.get(rec.instrumentId) ?? []
      list.push(rec)
      paymentsByInstrument.set(rec.instrumentId, list)
    }

    // Instrument map for quick lookup
    const instrumentMap = new Map<number, Instrument>()
    for (const inst of instruments) {
      if (inst.id != null) instrumentMap.set(inst.id, inst)
    }

    // Status counts
    const counts = { active: 0, matured: 0, defaulted: 0, sold: 0 }
    for (const inst of instruments) {
      counts[inst.status]++
    }

    let totalInvested = 0
    let activePrincipal = 0
    let repaidPrincipal = 0
    let defaultedPrincipal = 0
    let recoveredPrincipal = 0
    let realizedPL = 0
    let unrealizedPL = 0
    let worstInstrumentPL: number | null = null

    for (const inst of instruments) {
      if (inst.id == null) continue
      const entries = ledgerByInstrument.get(inst.id) ?? []
      const currency = inst.currency

      // Convert each entry individually using its historical appliedRate
      let purchases = 0
      let coupons = 0
      let redemptions = 0
      let recoveries = 0
      let sales = 0

      for (const e of entries) {
        switch (e.type) {
          case 'purchase':
            purchases += toBase(-e.amount, currency, e.appliedRate)
            break
          case 'coupon':
            coupons += toBase(e.amount, currency, e.appliedRate)
            break
          case 'redemption':
            redemptions += toBase(e.amount, currency, e.appliedRate)
            break
          case 'recovery':
            recoveries += toBase(e.amount, currency, e.appliedRate)
            break
          case 'sale':
            sales += toBase(e.amount, currency, e.appliedRate)
            break
        }
      }

      totalInvested += purchases

      if (inst.status === 'active') {
        const outstandingBase = purchases - redemptions
        activePrincipal += outstandingBase
        unrealizedPL += coupons + outstandingBase - purchases
      }

      if (inst.status === 'matured' || inst.status === 'sold') {
        repaidPrincipal += redemptions + recoveries
        const plForInst = coupons + redemptions + recoveries + sales - purchases
        realizedPL += plForInst
        if (plForInst < 0) {
          if (worstInstrumentPL === null || plForInst < worstInstrumentPL) {
            worstInstrumentPL = plForInst
          }
        }
      }

      if (inst.status === 'defaulted') {
        // Outstanding principal estimate uses current rate (not a historical fact)
        const outstandingRaw = inst.defaultOutstandingPrincipal ?? purchases
        const outstandingBase = toBase(outstandingRaw, currency)
        defaultedPrincipal += outstandingBase

        recoveredPrincipal += recoveries

        const plForInst = coupons + recoveries - purchases
        realizedPL += plForInst
        if (plForInst < 0) {
          if (worstInstrumentPL === null || plForInst < worstInstrumentPL) {
            worstInstrumentPL = plForInst
          }
        }
      }
    }

    const portfolioValue = activePrincipal + repaidPrincipal + recoveredPrincipal
    const recoveryRatio = defaultedPrincipal > 0 ? recoveredPrincipal / defaultedPrincipal : null

    // Build cash flows for portfolio XIRR — use appliedRate for historical entries
    const historicalFlows: { date: Date; amount: number }[] = []
    for (const entry of ledgerEntries) {
      const inst = instrumentMap.get(entry.instrumentId)
      if (!inst) continue
      // entry.amount is signed correctly: purchases are negative, income positive
      const amtBase = toBase(entry.amount, inst.currency, entry.appliedRate)
      historicalFlows.push({ date: new Date(entry.date), amount: amtBase })
    }

    // Future scheduled payments for active instruments — use current rate
    const futureFlows: { date: Date; amount: number }[] = []
    for (const inst of instruments) {
      if (inst.status !== 'active' || inst.id == null) continue
      const payments = paymentsByInstrument.get(inst.id) ?? []
      for (const p of payments) {
        if (p.status !== 'scheduled' || p.expectedAmount <= 0) continue
        const amtBase = toBase(p.expectedAmount, inst.currency)
        if (amtBase > 0) {
          futureFlows.push({ date: new Date(p.paymentDateTo), amount: amtBase })
        }
      }
    }

    const allFlows = [...historicalFlows, ...futureFlows].filter((f) => f.amount !== 0)
    const xirrValue = allFlows.length >= 2 ? xirr(allFlows) : null

    // Scenario XIRRs (for defaulted instruments)
    const hasDefaulted = instruments.some((i) => i.status === 'defaulted')
    const scenarioXIRRs: Array<{ label: string; rate: number | null }> = []

    if (hasDefaulted) {
      for (let s = 0; s < SCENARIO_RATES.length; s++) {
        const recoveryRate = SCENARIO_RATES[s] ?? 0
        const scenarioFlows = [...historicalFlows, ...futureFlows]

        for (const inst of instruments) {
          if (inst.status !== 'defaulted' || inst.id == null) continue
          const entries = ledgerByInstrument.get(inst.id) ?? []
          let purchases = 0
          let recoveries = 0
          for (const e of entries) {
            if (e.type === 'purchase') purchases += toBase(-e.amount, inst.currency, e.appliedRate)
            if (e.type === 'recovery') recoveries += toBase(e.amount, inst.currency, e.appliedRate)
          }
          const outstandingRaw = inst.defaultOutstandingPrincipal ?? purchases
          const outstandingBase = toBase(outstandingRaw, inst.currency)
          const additionalRecovery = outstandingBase * recoveryRate - recoveries
          if (additionalRecovery > 0) {
            const recoveryDate = inst.expectedRecoveryDate
              ? new Date(inst.expectedRecoveryDate)
              : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
            scenarioFlows.push({ date: recoveryDate, amount: additionalRecovery })
          }
        }

        const validFlows = scenarioFlows.filter((f) => f.amount !== 0)
        scenarioXIRRs.push({
          label: SCENARIO_LABELS[s] ?? '',
          rate: validFlows.length >= 2 ? xirr(validFlows) : null,
        })
      }
    } else {
      for (const label of SCENARIO_LABELS) {
        scenarioXIRRs.push({ label, rate: null })
      }
    }

    return {
      totalInvested,
      activePrincipal,
      repaidPrincipal,
      defaultedPrincipal,
      portfolioValue,
      xirrValue,
      realizedPL,
      unrealizedPL,
      recoveredPrincipal,
      recoveryRatio,
      largestLoss: worstInstrumentPL,
      counts,
      scenarioXIRRs,
      isLoading: false,
    }
  }, [baseCurrency])

  if (result === undefined) {
    return {
      totalInvested: 0,
      activePrincipal: 0,
      repaidPrincipal: 0,
      defaultedPrincipal: 0,
      portfolioValue: 0,
      xirrValue: null,
      realizedPL: 0,
      unrealizedPL: 0,
      recoveredPrincipal: 0,
      recoveryRatio: null,
      largestLoss: null,
      counts: { active: 0, matured: 0, defaulted: 0, sold: 0 },
      scenarioXIRRs: SCENARIO_LABELS.map((label) => ({ label, rate: null })),
      isLoading: true,
    }
  }

  return result
}
