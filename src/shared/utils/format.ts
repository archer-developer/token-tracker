import type { Currency } from '@/db/types'

export function formatCurrency(amount: number, currency: Currency): string {
  return new Intl.NumberFormat('ru-BY', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatPercent(value: number, decimals = 2): string {
  return `${(value * 100).toFixed(decimals)}%`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-BY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function formatDateRange(from: string, to: string): string {
  if (from === to) return formatDate(from)
  return `${formatDate(from)} – ${formatDate(to)}`
}
