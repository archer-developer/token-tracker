import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, Landmark, CircleCheck, BadgeCheck, TriangleAlert, TrendingUp } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button } from '@/shared/components/Button'
import { Badge } from '@/shared/components/Badge'
import { EmptyState } from '@/shared/components/EmptyState'
import { useInstruments } from '@/features/instruments/hooks/useInstruments'
import { db } from '@/db/db'
import { formatDate } from '@/shared/utils/format'
import type { Instrument, InstrumentStatus } from '@/db/types'

const today = new Date().toISOString().slice(0, 10)

function statusBadgeVariant(status: InstrumentStatus): 'green' | 'blue' | 'red' | 'gray' {
  if (status === 'active') return 'green'
  if (status === 'matured') return 'blue'
  if (status === 'defaulted') return 'red'
  return 'gray'
}

function statusIcon(status: InstrumentStatus) {
  if (status === 'active') return <CircleCheck className="size-3.5" />
  if (status === 'matured') return <BadgeCheck className="size-3.5" />
  if (status === 'defaulted') return <TriangleAlert className="size-3.5" />
  return <TrendingUp className="size-3.5" />
}

function useOverdueInstrumentIds(): Set<number> {
  const overdueIds = useLiveQuery(
    () =>
      db.paymentRecords
        .where('status')
        .equals('scheduled')
        .and((r) => r.paymentDateTo < today)
        .toArray()
        .then((records) => new Set(records.map((r) => r.instrumentId))),
    [],
    new Set<number>(),
  )
  return overdueIds
}

export default function InstrumentListScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const instruments = useInstruments()
  const overdueIds = useOverdueInstrumentIds()

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('instrument.title')}
        </h1>
        <Button
          variant="primary"
          icon={<Plus className="size-4" />}
          onClick={() => navigate('/instruments/new')}
        >
          {t('common.add')}
        </Button>
      </div>

      {instruments.length === 0 ? (
        <EmptyState
          icon={<Landmark className="size-12" />}
          title={t('instrument.empty')}
          action={
            <Button
              variant="primary"
              icon={<Plus className="size-4" />}
              onClick={() => navigate('/instruments/new')}
            >
              {t('instrument.add')}
            </Button>
          }
        />
      ) : (
        <>
          {/* Mobile cards */}
          <div className="flex flex-col gap-3 lg:hidden">
            {instruments.map((instrument) => (
              <InstrumentCard
                key={instrument.id}
                instrument={instrument}
                isOverdue={overdueIds.has(instrument.id!)}
                onClick={() => navigate(`/instruments/${instrument.id}`)}
              />
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border border-gray-200 lg:block dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                    {t('instrument.name')}
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                    {t('instrument.platform')}
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                    {t('instrument.currency')}
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">
                    {t('instrument.couponRate')}
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                    {t('instrument.endDate')}
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">
                    {t('instrument.status')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {instruments.map((instrument) => (
                  <tr
                    key={instrument.id}
                    className="cursor-pointer bg-white transition-colors hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800"
                    onClick={() => navigate(`/instruments/${instrument.id}`)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                      <span className="flex items-center gap-2">
                        {overdueIds.has(instrument.id!) && (
                          <span className="size-2 shrink-0 rounded-full bg-red-500" />
                        )}
                        {instrument.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {instrument.platform}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {instrument.currency}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">
                      {instrument.couponRate}%
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {formatDate(instrument.endDate)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        label={t(`instrument.status_${instrument.status}`)}
                        variant={statusBadgeVariant(instrument.status)}
                        icon={statusIcon(instrument.status)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

interface CardProps {
  instrument: Instrument
  isOverdue: boolean
  onClick: () => void
}

function InstrumentCard({ instrument, isOverdue, onClick }: CardProps) {
  const { t } = useTranslation()
  return (
    <div
      className="cursor-pointer rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-indigo-300 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-indigo-700"
      onClick={onClick}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {isOverdue && <span className="mt-1 size-2 shrink-0 rounded-full bg-red-500" />}
          <span className="truncate font-medium text-gray-900 dark:text-gray-100">
            {instrument.name}
          </span>
        </div>
        <Badge
          label={t(`instrument.status_${instrument.status}`)}
          variant={statusBadgeVariant(instrument.status)}
          icon={statusIcon(instrument.status)}
        />
      </div>
      <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
        <span>{instrument.platform}</span>
        <span>{instrument.currency}</span>
        <span>{instrument.couponRate}%</span>
        <span>{formatDate(instrument.endDate)}</span>
      </div>
    </div>
  )
}
