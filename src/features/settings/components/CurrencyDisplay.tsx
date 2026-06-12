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

export function CurrencyDisplay({
  amount,
  currency,
  className = '',
  showFormatted = true,
}: CurrencyDisplayProps) {
  const { hideAmounts } = useUIStore()
  const { isRevealed, reveal } = useRevealableAmounts()

  const shouldHide = hideAmounts && !isRevealed()

  if (showFormatted && currency) {
    if (currency === 'BYN') {
      const formatted = formatCurrency(amount, currency)
      const numberPart = formatted.replace(/\s?BYN\s?/g, '').trim()
      return (
        <button
          onClick={() => reveal()}
          className={`inline-flex cursor-pointer items-center gap-1 transition-opacity hover:opacity-70 ${className}`}
          title="Нажмите, чтобы показать все суммы на 10 сек"
        >
          <span>{shouldHide ? '****' : numberPart}</span>
          {!shouldHide && <i className="nbrb-icon" />}
        </button>
      )
    }

    const formatted = formatCurrency(amount, currency)
    return (
      <button
        onClick={() => reveal()}
        className={`cursor-pointer transition-opacity hover:opacity-70 ${className}`}
        title="Нажмите, чтобы показать все суммы на 10 сек"
      >
        {shouldHide ? '****' : formatted}
      </button>
    )
  }

  return (
    <button
      onClick={() => reveal()}
      className={`cursor-pointer transition-opacity hover:opacity-70 ${className}`}
      title="Нажмите, чтобы показать все суммы на 10 сек"
    >
      {shouldHide ? '****' : amount.toString()}
    </button>
  )
}
