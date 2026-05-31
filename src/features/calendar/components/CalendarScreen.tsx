import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { Button } from '@/shared/components/Button'
import { Badge } from '@/shared/components/Badge'
import { Modal } from '@/shared/components/Modal'
import { formatCurrency, formatDateRange } from '@/shared/utils/format'
import { db } from '@/db/db'
import {
  useCalendarPayments,
  type CalendarPaymentEntry,
} from '@/features/calendar/hooks/useCalendarPayments'
import type { Currency, PaymentStatus } from '@/db/types'

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

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

interface DayModalProps {
  day: number
  year: number
  month: number
  entries: CalendarPaymentEntry[]
  baseCurrency: Currency
  onClose: () => void
}

function DayModal({ day, year, month, entries, baseCurrency, onClose }: DayModalProps) {
  const { t } = useTranslation()
  const dateStr = new Date(year, month, day).toLocaleDateString('ru-BY', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <Modal open onClose={onClose} title={dateStr}>
      <div className="space-y-3">
        {entries.map(({ payment, instrumentName }) => (
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
                  {formatCurrency(payment.expectedAmount, baseCurrency)}
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
  const { baseCurrency } = useUIStore()

  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

  const dayPaymentsMap = useCalendarPayments(year, month)

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

  const monthLabel = new Date(year, month, 1).toLocaleDateString('ru-BY', {
    month: 'long',
    year: 'numeric',
  })

  // Calculate first weekday of month (Mon = 0)
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  // Month summary totals
  let totalExpected = 0
  let totalPaid = 0
  let totalMissed = 0

  for (const [, entries] of dayPaymentsMap) {
    for (const { payment } of entries) {
      totalExpected += payment.expectedAmount
      if (payment.status === 'paid') totalPaid += payment.actualAmount ?? payment.expectedAmount
      if (payment.status === 'missed') totalMissed += payment.expectedAmount
    }
  }

  const hasAnyPayment = dayPaymentsMap.size > 0

  const selectedEntries = selectedDay != null ? (dayPaymentsMap.get(selectedDay) ?? []) : []

  // Build grid cells: leading empty + day cells
  const totalCells = firstWeekday + daysInMonth
  // Pad to complete last row
  const paddedCells = Math.ceil(totalCells / 7) * 7

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">
        {t('calendar.title')}
      </h1>

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
                        {/* Dots always visible */}
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

                        {/* Amount shown on md+ */}
                        <p className="mt-0.5 hidden truncate text-[10px] text-gray-500 tabular-nums md:block dark:text-gray-400">
                          {formatCurrency(
                            entries.reduce((s, e) => s + e.payment.expectedAmount, 0),
                            baseCurrency,
                          )}
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
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('calendar.expected')}</p>
              <p className="mt-1 text-sm font-semibold text-gray-900 tabular-nums dark:text-gray-100">
                {formatCurrency(totalExpected, baseCurrency)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('payment.status_paid')}</p>
              <p className="mt-1 text-sm font-semibold text-green-600 tabular-nums dark:text-green-400">
                {formatCurrency(totalPaid, baseCurrency)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('payment.status_missed')}
              </p>
              <p className="mt-1 text-sm font-semibold text-red-600 tabular-nums dark:text-red-400">
                {formatCurrency(totalMissed, baseCurrency)}
              </p>
            </div>
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
          baseCurrency={baseCurrency}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  )
}
