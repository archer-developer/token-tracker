import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleCheck, CircleX, Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import type { PaymentRecord, PaymentStatus } from '@/db/types'
import { usePayments } from '@/features/payments/hooks/usePayments'
import { db } from '@/db/db'
import { Badge } from '@/shared/components/Badge'
import { Button } from '@/shared/components/Button'
import { Input } from '@/shared/components/Input'
import { Modal } from '@/shared/components/Modal'
import { EmptyState } from '@/shared/components/EmptyState'
import { formatCurrency, formatDateRange } from '@/shared/utils/format'
import { useUIStore } from '@/store/uiStore'

interface Props {
  instrumentId: number
}

type Tab = 'upcoming' | 'history'

const PAGE_SIZE = 5

const statusBadgeVariant: Record<PaymentStatus, 'yellow' | 'green' | 'red'> = {
  scheduled: 'yellow',
  paid: 'green',
  missed: 'red',
}

const statusIcons: Record<PaymentStatus, ReactNode> = {
  scheduled: <Clock className="size-3.5" />,
  paid: <CircleCheck className="size-3.5" />,
  missed: <CircleX className="size-3.5" />,
}

interface MarkPaidState {
  payment: PaymentRecord
  actualAmount: string
  paidAt: string
}

export function PaymentList({ instrumentId }: Props) {
  const { t } = useTranslation()
  const { baseCurrency, showZeroPayments } = useUIStore()
  const payments = usePayments(instrumentId)

  const [tab, setTab] = useState<Tab>('upcoming')
  const [page, setPage] = useState(0)
  const [markPaidState, setMarkPaidState] = useState<MarkPaidState | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function switchTab(next: Tab) {
    setTab(next)
    setPage(0)
  }

  // upcoming: scheduled, ascending (nearest future first — already from hook)
  // history: paid + missed, descending (most recent first)
  const filtered =
    tab === 'upcoming'
      ? payments.filter(
          (p) => p.status === 'scheduled' && (showZeroPayments || p.expectedAmount > 0),
        )
      : [
          ...payments.filter(
            (p) =>
              (p.status === 'paid' || p.status === 'missed') &&
              (showZeroPayments || p.expectedAmount > 0 || p.actualAmount?.toString() !== ''),
          ),
        ].reverse()

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const displayed = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  async function handleMarkMissed(payment: PaymentRecord) {
    if (!payment.id) return
    await db.paymentRecords.update(payment.id, { status: 'missed' })
  }

  function openMarkPaid(payment: PaymentRecord) {
    setMarkPaidState({
      payment,
      actualAmount: String(payment.expectedAmount),
      paidAt: payment.paymentDateFrom,
    })
    setError(null)
  }

  async function handleConfirmPaid() {
    if (!markPaidState) return
    const { payment, actualAmount, paidAt } = markPaidState

    const amount = parseFloat(actualAmount)
    if (isNaN(amount) || amount <= 0) {
      setError(t('payment.actual') + ' — ' + t('common.empty').toLowerCase())
      return
    }
    if (!paidAt) {
      setError(t('ledger.date') + ' — ' + t('common.empty').toLowerCase())
      return
    }

    setSaving(true)
    try {
      await db.transaction('rw', [db.paymentRecords, db.ledgerEntries], async () => {
        if (payment.id) {
          await db.paymentRecords.update(payment.id, {
            status: 'paid' as PaymentStatus,
            actualAmount: amount,
            paidAt,
          })
        }
        await db.ledgerEntries.add({
          instrumentId,
          date: paidAt,
          type: payment.type,
          amount,
          createdAt: new Date().toISOString(),
        })
      })
      setMarkPaidState(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {/* Tabs */}
      <div className="mb-4 flex w-fit overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
        {(['upcoming', 'history'] as Tab[]).map((t_) => (
          <button
            key={t_}
            onClick={() => switchTab(t_)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t_
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
            }`}
          >
            {t_ === 'upcoming' ? t('payment.status_scheduled') : t('payment.history')}
          </button>
        ))}
      </div>

      {displayed.length === 0 ? (
        <EmptyState icon={<Clock className="size-12" />} title={t('common.empty')} />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {displayed.map((payment) => (
              <div
                key={payment.id}
                className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Badge label={t(`payment.type_${payment.type}`)} variant="blue" />
                      <Badge
                        label={t(`payment.status_${payment.status}`)}
                        variant={statusBadgeVariant[payment.status]}
                        icon={statusIcons[payment.status]}
                      />
                    </div>
                    <span className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {formatDateRange(payment.paymentDateFrom, payment.paymentDateTo)}
                    </span>
                    <div className="mt-1 flex gap-4 text-sm">
                      <span className="text-gray-600 dark:text-gray-400">
                        {t('payment.expected')}:{' '}
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {formatCurrency(payment.expectedAmount, baseCurrency)}
                        </span>
                      </span>
                      {payment.actualAmount != null && (
                        <span className="text-gray-600 dark:text-gray-400">
                          {t('payment.actual')}:{' '}
                          <span className="font-medium text-green-600 dark:text-green-400">
                            {formatCurrency(payment.actualAmount, baseCurrency)}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>

                  {payment.status === 'scheduled' && (
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        icon={<CircleCheck className="size-4" />}
                        onClick={() => openMarkPaid(payment)}
                      >
                        {t('payment.markPaid')}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<CircleX className="size-4" />}
                        onClick={() => void handleMarkMissed(payment)}
                      >
                        {t('payment.markMissed')}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
              <span>
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} /{' '}
                {filtered.length}
              </span>
              <div className="flex gap-1">
                <button
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded-lg p-1.5 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-gray-800"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg p-1.5 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-gray-800"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Mark Paid Modal */}
      <Modal
        open={markPaidState !== null}
        onClose={() => setMarkPaidState(null)}
        title={t('payment.markPaid')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMarkPaidState(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" loading={saving} onClick={() => void handleConfirmPaid()}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        {markPaidState && (
          <div className="flex flex-col gap-4">
            <Input
              label={t('payment.actual')}
              type="number"
              min="0"
              step="0.01"
              value={markPaidState.actualAmount}
              onChange={(e) => setMarkPaidState((s) => s && { ...s, actualAmount: e.target.value })}
            />
            <Input
              label={t('ledger.date')}
              type="date"
              value={markPaidState.paidAt}
              onChange={(e) => setMarkPaidState((s) => s && { ...s, paidAt: e.target.value })}
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        )}
      </Modal>
    </div>
  )
}
