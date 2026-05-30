import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  Pencil,
  Trash2,
  BadgeCheck,
  TriangleAlert,
  TrendingUp,
  CircleCheck,
} from 'lucide-react'
import { Button } from '@/shared/components/Button'
import { Badge } from '@/shared/components/Badge'
import { Input } from '@/shared/components/Input'
import { Modal } from '@/shared/components/Modal'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { Spinner } from '@/shared/components/Spinner'
import { useInstrument } from '@/features/instruments/hooks/useInstruments'
import { PurchaseLotList } from '@/features/purchaseLots/components/PurchaseLotList'
import { PaymentList } from '@/features/payments/components/PaymentList'
import { db } from '@/db/db'
import { formatDate, formatCurrency } from '@/shared/utils/format'
import type { InstrumentStatus } from '@/db/types'

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

interface DefaultFormState {
  defaultDate: string
  defaultOutstandingPrincipal: string
  expectedRecoveryRate: string
  expectedRecoveryDate: string
  defaultNotes: string
}

const emptyDefaultForm: DefaultFormState = {
  defaultDate: new Date().toISOString().slice(0, 10),
  defaultOutstandingPrincipal: '',
  expectedRecoveryRate: '',
  expectedRecoveryDate: '',
  defaultNotes: '',
}

export default function InstrumentDetailScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const instrumentId = id ? parseInt(id, 10) : undefined
  const instrument = useInstrument(instrumentId)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [defaultModalOpen, setDefaultModalOpen] = useState(false)
  const [defaultForm, setDefaultForm] = useState<DefaultFormState>(emptyDefaultForm)

  if (instrument === null) {
    // still loading
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="size-8" />
      </div>
    )
  }

  if (instrument === undefined) {
    // not found
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 text-center text-gray-500 dark:text-gray-400">
        {t('common.empty')}
      </div>
    )
  }

  async function handleDelete() {
    if (instrument?.id == null) return
    const iid = instrument.id
    await db.transaction(
      'rw',
      [db.instruments, db.purchaseLots, db.paymentRecords, db.ledgerEntries],
      async () => {
        await db.instruments.delete(iid)
        await db.purchaseLots.where('instrumentId').equals(iid).delete()
        await db.paymentRecords.where('instrumentId').equals(iid).delete()
        await db.ledgerEntries.where('instrumentId').equals(iid).delete()
      },
    )
    navigate('/instruments')
  }

  async function handleMarkMatured() {
    if (instrument?.id == null) return
    const now = new Date().toISOString()
    await db.instruments.update(instrument.id, { status: 'matured', updatedAt: now })
  }

  async function handleMarkSold() {
    if (instrument?.id == null) return
    const now = new Date().toISOString()
    await db.instruments.update(instrument.id, { status: 'sold', updatedAt: now })
  }

  async function handleMarkDefaulted() {
    if (instrument?.id == null) return
    const now = new Date().toISOString()
    await db.instruments.update(instrument.id, {
      status: 'defaulted',
      updatedAt: now,
      defaultDate: defaultForm.defaultDate || undefined,
      defaultOutstandingPrincipal: defaultForm.defaultOutstandingPrincipal
        ? Number(defaultForm.defaultOutstandingPrincipal)
        : undefined,
      expectedRecoveryRate: defaultForm.expectedRecoveryRate
        ? Number(defaultForm.expectedRecoveryRate)
        : undefined,
      expectedRecoveryDate: defaultForm.expectedRecoveryDate || undefined,
      defaultNotes: defaultForm.defaultNotes || undefined,
    })
    setDefaultModalOpen(false)
    setDefaultForm(emptyDefaultForm)
  }

  function setDefaultField(field: keyof DefaultFormState, value: string) {
    setDefaultForm((prev) => ({ ...prev, [field]: value }))
  }

  const isActive = instrument.status === 'active'

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate('/instruments')}
          className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label={t('common.back')}
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-bold text-gray-900 dark:text-gray-100">
              {instrument.name}
            </h1>
            <Badge
              label={t(`instrument.status_${instrument.status}`)}
              variant={statusBadgeVariant(instrument.status)}
              icon={statusIcon(instrument.status)}
            />
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="mb-6 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={<Pencil className="size-4" />}
          onClick={() => navigate(`/instruments/${instrument.id}/edit`)}
        >
          {t('common.edit')}
        </Button>

        {isActive && (
          <>
            <Button
              variant="secondary"
              size="sm"
              icon={<BadgeCheck className="size-4" />}
              onClick={handleMarkMatured}
            >
              {t('instrument.markMatured')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<TriangleAlert className="size-4" />}
              onClick={() => {
                setDefaultForm(emptyDefaultForm)
                setDefaultModalOpen(true)
              }}
            >
              {t('instrument.markDefaulted')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<TrendingUp className="size-4" />}
              onClick={handleMarkSold}
            >
              {t('instrument.markSold')}
            </Button>
          </>
        )}

        <Button
          variant="danger"
          size="sm"
          icon={<Trash2 className="size-4" />}
          onClick={() => setDeleteOpen(true)}
        >
          {t('common.delete')}
        </Button>
      </div>

      {/* Details card */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t('common.actions')}
        </h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
          <DetailItem label={t('instrument.platform')} value={instrument.platform} />
          <DetailItem label={t('instrument.currency')} value={instrument.currency} />
          <DetailItem label={t('instrument.couponRate')} value={`${instrument.couponRate}%`} />
          <DetailItem label={t('instrument.startDate')} value={formatDate(instrument.startDate)} />
          <DetailItem label={t('instrument.endDate')} value={formatDate(instrument.endDate)} />
          <DetailItem
            label={t('instrument.paymentFrequency')}
            value={t(`instrument.frequency.${instrument.paymentFrequency}`)}
          />
          {instrument.paymentFrequency === 'custom' && instrument.customFrequencyDays != null && (
            <DetailItem label="Interval (days)" value={String(instrument.customFrequencyDays)} />
          )}
          <DetailItem
            label={t('instrument.paymentDayFrom')}
            value={String(instrument.paymentDayFrom)}
          />
          <DetailItem
            label={t('instrument.paymentDayTo')}
            value={String(instrument.paymentDayTo)}
          />
          {instrument.whitepaperUrl && (
            <div className="col-span-2 sm:col-span-3">
              <dt className="text-gray-500 dark:text-gray-400">{t('instrument.whitepaperUrl')}</dt>
              <dd>
                <a
                  href={instrument.whitepaperUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  {instrument.whitepaperUrl}
                </a>
              </dd>
            </div>
          )}
        </dl>

        {instrument.status === 'defaulted' && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
            <p className="mb-2 text-sm font-medium text-red-800 dark:text-red-300">
              {t('instrument.status_defaulted')}
            </p>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {instrument.defaultDate && (
                <DetailItem label="Default date" value={formatDate(instrument.defaultDate)} />
              )}
              {instrument.defaultOutstandingPrincipal != null && (
                <DetailItem
                  label="Outstanding principal"
                  value={formatCurrency(
                    instrument.defaultOutstandingPrincipal,
                    instrument.currency,
                  )}
                />
              )}
              {instrument.expectedRecoveryRate != null && (
                <DetailItem
                  label="Expected recovery"
                  value={`${instrument.expectedRecoveryRate}%`}
                />
              )}
              {instrument.expectedRecoveryDate && (
                <DetailItem
                  label="Recovery date"
                  value={formatDate(instrument.expectedRecoveryDate)}
                />
              )}
              {instrument.defaultNotes && (
                <div className="col-span-2">
                  <dt className="text-gray-500 dark:text-gray-400">Notes</dt>
                  <dd className="text-red-800 dark:text-red-300">{instrument.defaultNotes}</dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </div>

      {/* Payments */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t('payment.title')}
        </h2>
        <PaymentList instrumentId={instrument.id!} />
      </div>

      {/* Purchase lots */}
      <PurchaseLotList instrumentId={instrument.id!} currency={instrument.currency} />

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteOpen}
        title={t('common.delete')}
        message={t('instrument.deleteConfirm', { name: instrument.name })}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
        danger
      />

      {/* Default modal */}
      <Modal
        open={defaultModalOpen}
        onClose={() => setDefaultModalOpen(false)}
        title={t('instrument.markDefaulted')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDefaultModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={handleMarkDefaulted}>
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Default date"
            type="date"
            value={defaultForm.defaultDate}
            onChange={(e) => setDefaultField('defaultDate', e.target.value)}
          />
          <Input
            label="Outstanding principal"
            type="number"
            min="0"
            step="any"
            value={defaultForm.defaultOutstandingPrincipal}
            onChange={(e) => setDefaultField('defaultOutstandingPrincipal', e.target.value)}
          />
          <Input
            label="Expected recovery rate (%)"
            type="number"
            min="0"
            max="100"
            step="any"
            value={defaultForm.expectedRecoveryRate}
            onChange={(e) => setDefaultField('expectedRecoveryRate', e.target.value)}
          />
          <Input
            label="Expected recovery date"
            type="date"
            value={defaultForm.expectedRecoveryDate}
            onChange={(e) => setDefaultField('expectedRecoveryDate', e.target.value)}
          />
          <Input
            label="Notes"
            type="text"
            value={defaultForm.defaultNotes}
            onChange={(e) => setDefaultField('defaultNotes', e.target.value)}
          />
        </div>
      </Modal>
    </div>
  )
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="font-medium text-gray-900 dark:text-gray-100">{value}</dd>
    </div>
  )
}
