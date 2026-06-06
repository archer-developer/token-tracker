import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useUIStore } from '@/store/uiStore'
import { Button } from '@/shared/components/Button'
import { Badge } from '@/shared/components/Badge'
import { Modal } from '@/shared/components/Modal'
import { formatCurrency, formatDateRange, formatMonthYear } from '@/shared/utils/format'
import { db } from '@/db/db'
import {
  useCalendarPayments,
  type CalendarPaymentEntry,
  type DayPaymentsMap,
} from '@/features/calendar/hooks/useCalendarPayments'
import type { Currency, PaymentStatus } from '@/db/types'

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const CURRENCIES: Currency[] = ['BYN', 'USD', 'EUR']

function dotClass(status: PaymentStatus): string {
  if (status === 'paid') return 'bg-green-500'
  if (status === 'missed') return 'bg-red-500'
  return 'bg-indigo-500'
}

function statusVariant(status: PaymentStatus): 'green' | 'red' | 'blue' {
  if (status === 'paid') return 'green'
  if (status === 'missed') return 'red'
  return 'blue'
}

async function markPayment(id: number, status: PaymentStatus): Promise<void> {
  await db.paymentRecords.update(id, {
    status,
    paidAt: status === 'paid' ? new Date().toISOString() : undefined,
    actualAmount: undefined,
  })
}

function makeConvert(rateMap: Map<Currency, number>) {
  return function convert(amount: number, from: Currency, to: Currency): number {
    if (from === to) return amount
    const fromRate = from === 'BYN' ? 1 : (rateMap.get(from) ?? 1)
    const toRate = to === 'BYN' ? 1 : (rateMap.get(to) ?? 1)
    return (amount * fromRate) / toRate
  }
}

interface DayModalProps {
  day: number
  year: number
  month: number
  entries: CalendarPaymentEntry[]
  onClose: () => void
}

function DayModal({ day, year, month, entries, onClose }: DayModalProps) {
  const { t } = useTranslation()
  const { t: tFormat } = useTranslation()
  const monthName = tFormat(`months.long.${month}`)
  const dateStr = `${day} ${monthName} ${year}`

  return (
    <Modal open onClose={onClose} title={dateStr}>
      <div className="space-y-3">
        {entries.map(({ payment, instrumentName, instrumentCurrency }) => (
          <div
            key={`${payment.instrumentId}-${payment.periodIndex}-${payment.type}`}
            className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                  {instrumentName}
                </p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {t(`payment.type_${payment.type}`)} ·{' '}
                  {formatDateRange(payment.paymentDateFrom, payment.paymentDateTo)}
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-900 tabular-nums dark:text-gray-100">
                  {formatCurrency(payment.expectedAmount, instrumentCurrency)}
                </p>
              </div>
              <Badge
                label={t(`payment.status_${payment.status}`)}
                variant={statusVariant(payment.status)}
              />
            </div>
            {payment.status === 'scheduled' && payment.id != null && (
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    void markPayment(payment.id!, 'paid')
                  }}
                >
                  {t('payment.markPaid')}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    void markPayment(payment.id!, 'missed')
                  }}
                >
                  {t('payment.markMissed')}
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  )
}

export default function CalendarScreen() {
  const { t } = useTranslation()
  const { baseCurrency, showZeroPayments } = useUIStore()

  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [displayCurrency, setDisplayCurrency] = useState<Currency>(baseCurrency)

  const rawDayPaymentsMap = useCalendarPayments(year, month)

  // Filter out zero payments if showZeroPayments is false
  const dayPaymentsMap: DayPaymentsMap = showZeroPayments
    ? rawDayPaymentsMap
    : (() => {
        const filtered = new Map<number, CalendarPaymentEntry[]>()
        for (const [day, entries] of rawDayPaymentsMap) {
          const nonZeroEntries = entries.filter((e) => e.payment.expectedAmount > 0)
          if (nonZeroEntries.length > 0) {
            filtered.set(day, nonZeroEntries)
          }
        }
        return filtered
      })()

  const exchangeRates = useLiveQuery(() => db.exchangeRates.toArray(), [], [])
  const rateMap = new Map<Currency, number>()
  for (const r of exchangeRates ?? []) rateMap.set(r.currency as Currency, r.rate)
  const convert = makeConvert(rateMap)

  function prevMonth() {
    if (month === 0) {
      setYear((y) => y - 1)
      setMonth(11)
    } else {
      setMonth((m) => m - 1)
    }
    setSelectedDay(null)
  }

  function nextMonth() {
    if (month === 11) {
      setYear((y) => y + 1)
      setMonth(0)
    } else {
      setMonth((m) => m + 1)
    }
    setSelectedDay(null)
  }

  const monthLabel = formatMonthYear(new Date(year, month, 1))

  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  // Per-currency totals
  const currencyTotals = new Map<Currency, { expected: number; paid: number; missed: number }>()
  for (const [, entries] of dayPaymentsMap) {
    for (const { payment, instrumentCurrency } of entries) {
      const t0 = currencyTotals.get(instrumentCurrency) ?? { expected: 0, paid: 0, missed: 0 }
      t0.expected += payment.expectedAmount
      if (payment.status === 'paid') t0.paid += payment.actualAmount ?? payment.expectedAmount
      if (payment.status === 'missed') t0.missed += payment.expectedAmount
      currencyTotals.set(instrumentCurrency, t0)
    }
  }

  // Grand totals in displayCurrency
  let grandExpected = 0
  let grandPaid = 0
  let grandMissed = 0
  for (const [currency, totals] of currencyTotals) {
    grandExpected += convert(totals.expected, currency, displayCurrency)
    grandPaid += convert(totals.paid, currency, displayCurrency)
    grandMissed += convert(totals.missed, currency, displayCurrency)
  }

  const hasAnyPayment = dayPaymentsMap.size > 0
  const activeCurrencies = [...currencyTotals.keys()]

  const selectedEntries = selectedDay != null ? (dayPaymentsMap.get(selectedDay) ?? []) : []

  const totalCells = firstWeekday + daysInMonth
  const paddedCells = Math.ceil(totalCells / 7) * 7

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">
        {t('calendar.title')}
      </h1>

      {/* Currency selector */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {t('calendar.displayCurrency')}:
        </span>
        <div className="flex overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
          {CURRENCIES.map((c) => (
            <button
              key={c}
              onClick={() => setDisplayCurrency(c)}
              className={[
                'px-3 py-1 text-sm font-medium transition-colors',
                displayCurrency === c
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800',
              ].join(' ')}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Month navigation */}
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={prevMonth}
          className="rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          aria-label="Previous month"
        >
          <ChevronLeft className="size-5" />
        </button>
        <h2 className="text-lg font-semibold text-gray-900 capitalize dark:text-gray-100">
          {monthLabel}
        </h2>
        <button
          onClick={nextMonth}
          className="rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          aria-label="Next month"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      {/* Calendar grid */}
      <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
        {/* Day name headers */}
        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
          {DAY_NAMES.map((name) => (
            <div
              key={name}
              className="py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400"
            >
              {name}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 divide-x divide-y divide-gray-100 dark:divide-gray-800">
          {Array.from({ length: paddedCells }, (_, i) => {
            const day = i - firstWeekday + 1
            const isValid = day >= 1 && day <= daysInMonth
            const isToday =
              isValid &&
              day === today.getDate() &&
              month === today.getMonth() &&
              year === today.getFullYear()
            const entries = isValid ? (dayPaymentsMap.get(day) ?? []) : []
            const hasPayments = entries.length > 0
            const cellTotal = entries.reduce(
              (s, e) =>
                s + convert(e.payment.expectedAmount, e.instrumentCurrency, displayCurrency),
              0,
            )

            return (
              <div
                key={i}
                onClick={() => {
                  if (isValid && hasPayments) setSelectedDay(day)
                }}
                className={[
                  'min-h-[64px] p-1.5 transition-colors',
                  !isValid ? 'bg-gray-50 dark:bg-gray-800/50' : 'bg-white dark:bg-gray-900',
                  isValid && hasPayments
                    ? 'cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-950/30'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {isValid && (
                  <>
                    <span
                      className={[
                        'flex size-6 items-center justify-center rounded-full text-xs font-medium',
                        isToday ? 'bg-indigo-600 text-white' : 'text-gray-700 dark:text-gray-300',
                      ].join(' ')}
                    >
                      {day}
                    </span>

                    {hasPayments && (
                      <>
                        <div className="mt-1 flex flex-wrap gap-0.5">
                          {entries.slice(0, 4).map(({ payment }, idx) => (
                            <span
                              key={idx}
                              className={`inline-block size-1.5 rounded-full ${dotClass(payment.status)}`}
                            />
                          ))}
                          {entries.length > 4 && (
                            <span className="text-[10px] text-gray-400">+{entries.length - 4}</span>
                          )}
                        </div>

                        <p className="mt-0.5 hidden truncate text-[10px] text-gray-500 tabular-nums md:block dark:text-gray-400">
                          {formatCurrency(cellTotal, displayCurrency)}
                        </p>
                      </>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Month summary */}
      <div className="mt-4">
        {!hasAnyPayment ? (
          <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
            {t('calendar.noPayments')}
          </p>
        ) : (
          <div className="space-y-2">
            {activeCurrencies.map((currency) => {
              const totals = currencyTotals.get(currency)!
              return (
                <div key={currency} className="grid grid-cols-3 items-center gap-3">
                  <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('calendar.expected')}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-gray-900 tabular-nums dark:text-gray-100">
                      {formatCurrency(totals.expected, currency)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('payment.status_paid')}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-green-600 tabular-nums dark:text-green-400">
                      {formatCurrency(totals.paid, currency)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('payment.status_missed')}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-red-600 tabular-nums dark:text-red-400">
                      {formatCurrency(totals.missed, currency)}
                    </p>
                  </div>
                </div>
              )
            })}

            {activeCurrencies.length > 1 && (
              <>
                <div className="border-t border-gray-200 pt-2 dark:border-gray-700">
                  <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                    {t('calendar.total')} {displayCurrency}
                  </span>
                </div>
                <div className="grid grid-cols-3 items-center gap-3">
                  <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('calendar.expected')}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-gray-900 tabular-nums dark:text-gray-100">
                      {formatCurrency(grandExpected, displayCurrency)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('payment.status_paid')}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-green-600 tabular-nums dark:text-green-400">
                      {formatCurrency(grandPaid, displayCurrency)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('payment.status_missed')}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-red-600 tabular-nums dark:text-red-400">
                      {formatCurrency(grandMissed, displayCurrency)}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Payment detail modal */}
      {selectedDay != null && selectedEntries.length > 0 && (
        <DayModal
          day={selectedDay}
          year={year}
          month={month}
          entries={selectedEntries}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  )
}
