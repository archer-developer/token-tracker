import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Banknote,
  CircleDollarSign,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
} from 'lucide-react'
import type { LedgerEntryType } from '@/db/types'
import { useLedgerEntries } from '@/features/ledger/hooks/useLedgerEntries'
import { Button } from '@/shared/components/Button'
import { Input } from '@/shared/components/Input'
import { Select } from '@/shared/components/Select'
import { Badge } from '@/shared/components/Badge'
import { EmptyState } from '@/shared/components/EmptyState'
import { formatCurrency, formatDate } from '@/shared/utils/format'

const typeIcons: Record<LedgerEntryType, ReactNode> = {
  purchase: <ShoppingCart className="size-3.5" />,
  coupon: <Banknote className="size-3.5" />,
  redemption: <CircleDollarSign className="size-3.5" />,
  recovery: <ShieldCheck className="size-3.5" />,
  sale: <TrendingUp className="size-3.5" />,
}

const typeBadgeVariant: Record<LedgerEntryType, 'blue' | 'green' | 'gray' | 'yellow' | 'red'> = {
  purchase: 'blue',
  coupon: 'green',
  redemption: 'gray',
  recovery: 'yellow',
  sale: 'green',
}

const PAGE_SIZE = 10

function exportToCsv(entries: ReturnType<typeof useLedgerEntries>): void {
  const header = ['Date', 'Type', 'Instrument', 'Amount']
  const rows = entries.map((e) => [
    e.date,
    e.type,
    `"${e.instrumentName.replace(/"/g, '""')}"`,
    formatCurrency(e.amount, e.instrumentCurrency),
  ])
  const csv = [header, ...rows].map((r) => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ledger-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function LedgerScreen() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<LedgerEntryType | ''>('')
  const [page, setPage] = useState(0)

  const entries = useLedgerEntries(filter || undefined, search)

  if (process.env.NODE_ENV === 'development' && entries.length > 0) {
    console.log('[LedgerScreen] First entry:', {
      instrumentName: entries[0].instrumentName,
      instrumentCurrency: entries[0].instrumentCurrency,
      amount: entries[0].amount,
    })
  }

  const totalPages = Math.ceil(entries.length / PAGE_SIZE)
  const displayed = entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const selectOptions = [
    { value: '', label: t('common.filter') + ': ' + t('ledger.filterAll') },
    { value: 'purchase', label: t('ledger.type_purchase') },
    { value: 'coupon', label: t('ledger.type_coupon') },
    { value: 'redemption', label: t('ledger.type_redemption') },
    { value: 'recovery', label: t('ledger.type_recovery') },
    { value: 'sale', label: t('ledger.type_sale') },
  ]

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('ledger.title')}</h1>
        <Button
          variant="secondary"
          size="sm"
          icon={<Download className="size-4" />}
          onClick={() => exportToCsv(entries)}
        >
          <span className="hidden sm:inline">{t('common.export')} CSV</span>
        </Button>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <Input
            placeholder={t('common.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="sm:w-52">
          <Select
            options={selectOptions}
            value={filter}
            onChange={(e) => setFilter(e.target.value as LedgerEntryType | '')}
          />
        </div>
      </div>

      {entries.length === 0 ? (
        <EmptyState icon={<BookOpen className="size-12" />} title={t('ledger.empty')} />
      ) : (
        <>
          {/* Mobile card layout */}
          <div className="flex flex-col gap-2 lg:hidden">
            {displayed.map((entry) => (
              <div
                key={entry.id}
                className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDate(entry.date)}
                    </span>
                    <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                      {entry.instrumentName}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge
                      label={t(`ledger.type_${entry.type}`)}
                      variant={typeBadgeVariant[entry.type]}
                      icon={typeIcons[entry.type]}
                    />
                    <span
                      className={`text-sm font-semibold ${
                        entry.amount < 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-green-600 dark:text-green-400'
                      }`}
                    >
                      {entry.amount >= 0 ? '+' : ''}
                      {formatCurrency(entry.amount, entry.instrumentCurrency)}
                    </span>
                  </div>
                </div>
                {entry.notes && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{entry.notes}</p>
                )}
              </div>
            ))}
          </div>

          {/* Desktop table layout */}
          <div className="hidden overflow-hidden rounded-xl border border-gray-200 lg:block dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
                    {t('ledger.date')}
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
                    {t('ledger.type')}
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
                    {t('ledger.instrument')}
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500 dark:text-gray-400">
                    {t('ledger.amount')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {displayed.map((entry) => (
                  <tr
                    key={entry.id}
                    className="bg-white transition-colors hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800/50"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-gray-400">
                      {formatDate(entry.date)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        label={t(`ledger.type_${entry.type}`)}
                        variant={typeBadgeVariant[entry.type]}
                        icon={typeIcons[entry.type]}
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-gray-100">
                      {entry.instrumentName}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-medium tabular-nums ${
                        entry.amount < 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-green-600 dark:text-green-400'
                      }`}
                    >
                      {entry.amount >= 0 ? '+' : ''}
                      {formatCurrency(entry.amount, entry.instrumentCurrency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
              <span>
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, entries.length)} /{' '}
                {entries.length}
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
    </div>
  )
}

export default LedgerScreen
