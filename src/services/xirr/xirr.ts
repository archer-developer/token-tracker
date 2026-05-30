export interface CashFlow {
  date: Date
  amount: number
}

const DAYS_IN_YEAR = 365
const MAX_ITERATIONS = 100
const TOLERANCE = 1e-7

function npv(rate: number, cashFlows: CashFlow[]): number {
  const t0 = cashFlows[0]?.date.getTime() ?? 0
  return cashFlows.reduce((sum, { date, amount }) => {
    const years = (date.getTime() - t0) / (DAYS_IN_YEAR * 24 * 60 * 60 * 1000)
    return sum + amount / Math.pow(1 + rate, years)
  }, 0)
}

function npvDerivative(rate: number, cashFlows: CashFlow[]): number {
  const t0 = cashFlows[0]?.date.getTime() ?? 0
  return cashFlows.reduce((sum, { date, amount }) => {
    const years = (date.getTime() - t0) / (DAYS_IN_YEAR * 24 * 60 * 60 * 1000)
    if (years === 0) return sum
    return sum - (years * amount) / Math.pow(1 + rate, years + 1)
  }, 0)
}

export function xirr(cashFlows: CashFlow[]): number | null {
  if (cashFlows.length < 2) return null

  const sorted = [...cashFlows].sort((a, b) => a.date.getTime() - b.date.getTime())
  const hasNegative = sorted.some((cf) => cf.amount < 0)
  const hasPositive = sorted.some((cf) => cf.amount > 0)
  if (!hasNegative || !hasPositive) return null

  let rate = 0.1
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const value = npv(rate, sorted)
    const derivative = npvDerivative(rate, sorted)
    if (Math.abs(derivative) < 1e-12) break
    const newRate = rate - value / derivative
    if (Math.abs(newRate - rate) < TOLERANCE) return newRate
    rate = newRate
  }
  return null
}
