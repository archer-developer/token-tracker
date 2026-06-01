import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/shared/components/Button'
import { Input } from '@/shared/components/Input'
import { Modal } from '@/shared/components/Modal'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { EmptyState } from '@/shared/components/EmptyState'
import { usePurchaseLots } from '@/features/purchaseLots/hooks/usePurchaseLots'
import { db } from '@/db/db'
import { regenerateSchedule } from '@/features/payments/scheduleUtils'
import { formatDate, formatCurrency } from '@/shared/utils/format'
import { getRateForDate } from '@/services/exchangeRates/NBRBClient'
import type { Currency, PurchaseLot } from '@/db/types'

interface Props {
  instrumentId: number
  currency: Currency
  tokenPrice?: number
}

interface LotFormState {
  purchaseDate: string
  quantity: string
  pricePerToken: string
  notes: string
}

const emptyForm: LotFormState = {
  purchaseDate: new Date().toISOString().slice(0, 10),
  quantity: '',
  pricePerToken: '',
  notes: '',
}

interface FormErrors {
  purchaseDate?: string
  quantity?: string
  pricePerToken?: string
}

function validateForm(form: LotFormState): FormErrors {
  const errors: FormErrors = {}
  if (!form.purchaseDate) errors.purchaseDate = 'Required'
  if (!form.quantity || isNaN(Number(form.quantity)) || Number(form.quantity) <= 0)
    errors.quantity = 'Must be > 0'
  if (!form.pricePerToken || isNaN(Number(form.pricePerToken)) || Number(form.pricePerToken) <= 0)
    errors.pricePerToken = 'Must be > 0'
  return errors
}

export function PurchaseLotList({ instrumentId, currency, tokenPrice }: Props) {
  const { t } = useTranslation()
  const lots = usePurchaseLots(instrumentId)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingLot, setEditingLot] = useState<PurchaseLot | null>(null)
  const [form, setForm] = useState<LotFormState>(emptyForm)
  const [errors, setErrors] = useState<FormErrors>({})
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<PurchaseLot | null>(null)

  function openAdd() {
    setEditingLot(null)
    setForm({ ...emptyForm, pricePerToken: tokenPrice != null ? String(tokenPrice) : '' })
    setErrors({})
    setModalOpen(true)
  }

  function openEdit(lot: PurchaseLot) {
    setEditingLot(lot)
    setForm({
      purchaseDate: lot.purchaseDate,
      quantity: String(lot.quantity),
      pricePerToken: String(lot.pricePerToken),
      notes: lot.notes ?? '',
    })
    setErrors({})
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingLot(null)
    setErrors({})
  }

  function set(field: keyof LotFormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    const errs = validateForm(form)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    setSaving(true)
    try {
      const quantity = Number(form.quantity)
      const pricePerToken = Number(form.pricePerToken)
      const totalCost = quantity * pricePerToken
      const now = new Date().toISOString()
      const appliedRate = await getRateForDate(currency, form.purchaseDate)

      if (editingLot?.id != null) {
        // Update lot
        await db.purchaseLots.update(editingLot.id, {
          purchaseDate: form.purchaseDate,
          quantity,
          pricePerToken,
          totalCost,
          notes: form.notes || undefined,
        })

        // Update corresponding ledger entry (find by type=purchase and original date/instrumentId)
        const oldEntry = await db.ledgerEntries
          .where('instrumentId')
          .equals(instrumentId)
          .and((e) => e.type === 'purchase' && e.date === editingLot.purchaseDate)
          .first()
        if (oldEntry?.id != null) {
          await db.ledgerEntries.update(oldEntry.id, {
            date: form.purchaseDate,
            amount: -totalCost,
            appliedRate,
          })
        } else {
          // create if missing
          await db.ledgerEntries.add({
            instrumentId,
            date: form.purchaseDate,
            type: 'purchase',
            amount: -totalCost,
            appliedRate,
            createdAt: now,
          })
        }
      } else {
        // Add new lot
        await db.purchaseLots.add({
          instrumentId,
          purchaseDate: form.purchaseDate,
          quantity,
          pricePerToken,
          totalCost,
          notes: form.notes || undefined,
          createdAt: now,
        })

        await db.ledgerEntries.add({
          instrumentId,
          date: form.purchaseDate,
          type: 'purchase',
          amount: -totalCost,
          appliedRate,
          createdAt: now,
        })
      }
      closeModal()
      // Regenerate schedule with updated principal
      const instrument = await db.instruments.get(instrumentId)
      if (instrument) await regenerateSchedule(instrument)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(lot: PurchaseLot) {
    if (lot.id == null) return
    await db.purchaseLots.delete(lot.id)
    // Remove matching ledger entry
    const entry = await db.ledgerEntries
      .where('instrumentId')
      .equals(instrumentId)
      .and(
        (e) => e.type === 'purchase' && e.date === lot.purchaseDate && e.amount === -lot.totalCost,
      )
      .first()
    if (entry?.id != null) {
      await db.ledgerEntries.delete(entry.id)
    }
    // Regenerate schedule with updated principal
    const instrument = await db.instruments.get(instrumentId)
    if (instrument) await regenerateSchedule(instrument)
    setDeleteTarget(null)
  }

  const totalInvested = lots.reduce((acc, l) => acc + l.totalCost, 0)

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t('purchaseLot.title')}
        </h2>
        <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={openAdd}>
          {t('purchaseLot.add')}
        </Button>
      </div>

      {lots.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <EmptyState icon={null} title={t('purchaseLot.empty')} />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
          {/* Mobile list */}
          <div className="divide-y divide-gray-100 lg:hidden dark:divide-gray-800">
            {lots.map((lot) => (
              <div key={lot.id} className="bg-white p-4 dark:bg-gray-900">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {formatDate(lot.purchaseDate)}
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEdit(lot)}
                      className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(lot)}
                      className="rounded-lg p-1.5 text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
                <div className="flex gap-4 text-sm text-gray-500 dark:text-gray-400">
                  <span>
                    {lot.quantity} × {formatCurrency(lot.pricePerToken, currency)}
                  </span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {formatCurrency(lot.totalCost, currency)}
                  </span>
                </div>
                {lot.notes && (
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{lot.notes}</p>
                )}
              </div>
            ))}
            <div className="flex justify-between bg-gray-50 px-4 py-2 text-sm font-medium text-gray-900 dark:bg-gray-800/50 dark:text-gray-100">
              <span>{t('purchaseLot.totalCost')}</span>
              <span>{formatCurrency(totalInvested, currency)}</span>
            </div>
          </div>

          {/* Desktop table */}
          <table className="hidden w-full text-sm lg:table">
            <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-gray-600 dark:text-gray-400">
                  {t('purchaseLot.purchaseDate')}
                </th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-600 dark:text-gray-400">
                  {t('purchaseLot.quantity')}
                </th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-600 dark:text-gray-400">
                  {t('purchaseLot.pricePerToken')}
                </th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-600 dark:text-gray-400">
                  {t('purchaseLot.totalCost')}
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-gray-600 dark:text-gray-400">
                  {t('purchaseLot.notes')}
                </th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {lots.map((lot) => (
                <tr key={lot.id} className="bg-white dark:bg-gray-900">
                  <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">
                    {formatDate(lot.purchaseDate)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300">
                    {lot.quantity}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300">
                    {formatCurrency(lot.pricePerToken, currency)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-gray-900 dark:text-gray-100">
                    {formatCurrency(lot.totalCost, currency)}
                  </td>
                  <td className="max-w-xs truncate px-4 py-2.5 text-gray-500 dark:text-gray-400">
                    {lot.notes ?? '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => openEdit(lot)}
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(lot)}
                        className="rounded-lg p-1.5 text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-medium dark:bg-gray-800/50">
                <td colSpan={3} className="px-4 py-2.5 text-gray-700 dark:text-gray-300">
                  {t('purchaseLot.totalCost')}
                </td>
                <td className="px-4 py-2.5 text-right text-gray-900 dark:text-gray-100">
                  {formatCurrency(totalInvested, currency)}
                </td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingLot ? t('purchaseLot.edit') : t('purchaseLot.add')}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" loading={saving} onClick={handleSave}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label={t('purchaseLot.purchaseDate')}
            type="date"
            value={form.purchaseDate}
            onChange={(e) => set('purchaseDate', e.target.value)}
            error={errors.purchaseDate}
          />
          <Input
            label={t('purchaseLot.quantity')}
            type="number"
            min="0.000001"
            step="any"
            value={form.quantity}
            onChange={(e) => set('quantity', e.target.value)}
            error={errors.quantity}
          />
          <Input
            label={t('purchaseLot.pricePerToken')}
            type="number"
            min="0.000001"
            step="any"
            value={form.pricePerToken}
            onChange={(e) => set('pricePerToken', e.target.value)}
            error={errors.pricePerToken}
          />
          {form.quantity &&
            form.pricePerToken &&
            !isNaN(Number(form.quantity)) &&
            !isNaN(Number(form.pricePerToken)) && (
              <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                <span className="font-medium">{t('purchaseLot.totalCost')}: </span>
                {formatCurrency(Number(form.quantity) * Number(form.pricePerToken), currency)}
              </div>
            )}
          <Input
            label={t('purchaseLot.notes')}
            type="text"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        </div>
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteTarget != null}
        title={t('common.delete')}
        message={`${t('purchaseLot.purchaseDate')}: ${deleteTarget ? formatDate(deleteTarget.purchaseDate) : ''} — ${deleteTarget ? formatCurrency(deleteTarget.totalCost, currency) : ''}`}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
        danger
      />
    </div>
  )
}
