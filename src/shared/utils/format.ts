import i18n from '@/app/i18n'
import type { Currency } from '@/db/types'

function getLocale(): string {
  const lang = i18n.language
  return lang === 'by' ? 'be-BY' : 'ru-BY'
}

function getMonthName(monthIndex: number, length: 'long' | 'short' = 'long'): string {
  const key = `months.${length}.${monthIndex}`
  return i18n.t(key)
}

export function formatCurrency(amount: number, currency: Currency): string {
  const formatted = new Intl.NumberFormat(getLocale(), {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)

  // Replace browser-generated Br with proper BYN symbol for consistency
  return currency === 'BYN' ? formatted.replace(/Br\b/g, 'BYN') : formatted
}

export function formatPercent(value: number, decimals = 2): string {
  return `${(value * 100).toFixed(decimals)}%`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(getLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function formatDateRange(from: string, to: string): string {
  if (from === to) return formatDate(from)
  return `${formatDate(from)} – ${formatDate(to)}`
}

export function formatMonthYear(date: Date, length: 'long' | 'short' = 'long'): string {
  const monthName = getMonthName(date.getMonth(), length)
  const year = date.getFullYear()
  return `${monthName} ${year}`
}

export function formatMonthYearShort(date: Date): string {
  const monthName = getMonthName(date.getMonth(), 'short')
  const year = String(date.getFullYear()).slice(-2)
  return `${monthName} ${year}`
}
