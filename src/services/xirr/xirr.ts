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

function newtonRaphson(sorted: CashFlow[], initialRate: number): number | null {
  let rate = initialRate
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const value = npv(rate, sorted)
    const deriv = npvDerivative(rate, sorted)
    if (!isFinite(value) || !isFinite(deriv) || Math.abs(deriv) < 1e-12) return null
    const next = rate - value / deriv
    if (!isFinite(next)) return null
    if (Math.abs(next - rate) < TOLERANCE) return next
    // Clamp to keep (1+rate) positive — Math.pow with negative base and
    // fractional exponent returns NaN, silently poisoning all subsequent iterations.
    rate = Math.max(-0.9999, next)
  }
  return null
}

export function xirr(cashFlows: CashFlow[]): number | null {
  if (cashFlows.length < 2) return null

  const sorted = [...cashFlows].sort((a, b) => a.date.getTime() - b.date.getTime())
  if (!sorted.some((cf) => cf.amount < 0) || !sorted.some((cf) => cf.amount > 0)) return null

  // Try Newton-Raphson from several starting points to handle varied data patterns.
  for (const guess of [0.1, 0.0, 0.5, -0.1, 2.0]) {
    const result = newtonRaphson(sorted, guess)
    if (result !== null && isFinite(result)) return result
  }

  return null
}
