import { useMemo } from 'react'
import { useUIStore } from '@/store/uiStore'
import { useRevealableAmounts } from '@/features/settings/hooks/useRevealableAmounts'
import { formatCurrency } from '@/shared/utils/format'
import type { Currency } from '@/db/types'

interface CurrencyDisplayProps {
  amount: number
  currency?: Currency
  className?: string
  showFormatted?: boolean
}

let idCounter = 0

export function CurrencyDisplay({
  amount,
  currency,
  className = '',
  showFormatted = true,
}: CurrencyDisplayProps) {
  const { hideAmounts } = useUIStore()
  const { isRevealed, reveal } = useRevealableAmounts()

  // Generate a stable ID for this component instance
  const displayId = useMemo(() => `amount-${idCounter++}`, [])
  const shouldHide = hideAmounts && !isRevealed(displayId)

  if (showFormatted && currency) {
    const formatted = formatCurrency(amount, currency)
    return (
      <button
        onClick={() => reveal(displayId)}
        className={`cursor-pointer transition-opacity hover:opacity-70 ${className}`}
        title="Нажмите, чтобы показать сумму на 10 сек"
      >
        {shouldHide ? '****' : formatted}
      </button>
    )
  }

  return (
    <button
      onClick={() => reveal(displayId)}
      className={`cursor-pointer transition-opacity hover:opacity-70 ${className}`}
      title="Нажмите, чтобы показать сумму на 10 сек"
    >
      {shouldHide ? '****' : amount.toString()}
    </button>
  )
}
