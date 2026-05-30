import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Save, ScanText, Sparkles } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button } from '@/shared/components/Button'
import { Input } from '@/shared/components/Input'
import { Select } from '@/shared/components/Select'
import { Spinner } from '@/shared/components/Spinner'
import { useInstrument } from '@/features/instruments/hooks/useInstruments'
import { db } from '@/db/db'
import { regenerateSchedule } from '@/features/payments/scheduleUtils'
import { extractInstrumentFields } from '@/services/llm/LLMService'
import type { Currency, Instrument, PaymentFrequency } from '@/db/types'

interface FormState {
  name: string
  platform: string
  currency: Currency
  couponRate: string
  startDate: string
  endDate: string
  paymentFrequency: PaymentFrequency
  customFrequencyDays: string
  paymentDayFrom: string
  paymentDayTo: string
  whitepaperUrl: string
}

interface FormErrors {
  name?: string
  platform?: string
  couponRate?: string
  startDate?: string
  endDate?: string
  customFrequencyDays?: string
  paymentDayFrom?: string
  paymentDayTo?: string
}

const defaultForm: FormState = {
  name: '',
  platform: '',
  currency: 'BYN',
  couponRate: '',
  startDate: '',
  endDate: '',
  paymentFrequency: 'monthly',
  customFrequencyDays: '',
  paymentDayFrom: '',
  paymentDayTo: '',
  whitepaperUrl: '',
}

function validate(form: FormState): FormErrors {
  const errors: FormErrors = {}
  if (!form.name.trim()) errors.name = 'Required'
  if (!form.platform.trim()) errors.platform = 'Required'
  if (!form.couponRate || isNaN(Number(form.couponRate)) || Number(form.couponRate) < 0)
    errors.couponRate = 'Must be ≥ 0'
  if (!form.startDate) errors.startDate = 'Required'
  if (!form.endDate) errors.endDate = 'Required'
  if (form.paymentFrequency === 'custom') {
    if (
      !form.customFrequencyDays ||
      isNaN(Number(form.customFrequencyDays)) ||
      Number(form.customFrequencyDays) < 1
    )
      errors.customFrequencyDays = 'Must be ≥ 1'
  }
  const dayFrom = Number(form.paymentDayFrom)
  const dayTo = Number(form.paymentDayTo)
  if (!form.paymentDayFrom || isNaN(dayFrom) || dayFrom < 1 || dayFrom > 31)
    errors.paymentDayFrom = '1–31'
  if (!form.paymentDayTo || isNaN(dayTo) || dayTo < 1 || dayTo > 31) errors.paymentDayTo = '1–31'
  if (!errors.paymentDayFrom && !errors.paymentDayTo && dayTo < dayFrom)
    errors.paymentDayTo = 'Must be ≥ day from'
  return errors
}

function instrumentToForm(instrument: Instrument): FormState {
  return {
    name: instrument.name,
    platform: instrument.platform,
    currency: instrument.currency,
    couponRate: String(instrument.couponRate),
    startDate: instrument.startDate,
    endDate: instrument.endDate,
    paymentFrequency: instrument.paymentFrequency,
    customFrequencyDays:
      instrument.customFrequencyDays != null ? String(instrument.customFrequencyDays) : '',
    paymentDayFrom: String(instrument.paymentDayFrom),
    paymentDayTo: String(instrument.paymentDayTo),
    whitepaperUrl: instrument.whitepaperUrl ?? '',
  }
}

export default function InstrumentFormScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id && id !== 'new')
  const instrumentId = isEdit && id ? parseInt(id, 10) : undefined

  const existingInstrument = useInstrument(instrumentId)

  const llmConfigured = useLiveQuery(
    () =>
      db.settings
        .toCollection()
        .first()
        .then((s) => Boolean(s?.llmBaseUrl && s.llmApiKey && s.llmModel)),
    [],
    false,
  )

  const [form, setForm] = useState<FormState>(defaultForm)
  const [errors, setErrors] = useState<FormErrors>({})
  const [saving, setSaving] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const initializedRef = useRef(false)

  useEffect(() => {
    // existingInstrument is null while loading, undefined if not found, Instrument when loaded
    if (isEdit && existingInstrument != null && !initializedRef.current) {
      setForm(instrumentToForm(existingInstrument))
      initializedRef.current = true
    }
  }, [isEdit, existingInstrument])

  function set(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  async function handlePdfChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setParseError(null)
    setParsing(true)
    try {
      const pdfjsLib = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).href

      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      let text = ''
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        text += content.items.map((item) => ('str' in item ? item.str : '')).join(' ') + '\n'
      }

      const extracted = await extractInstrumentFields(text)

      setForm((prev) => ({
        ...prev,
        name: extracted.name ?? prev.name,
        platform: extracted.platform ?? prev.platform,
        currency: (extracted.currency as Currency) ?? prev.currency,
        couponRate: extracted.couponRate != null ? String(extracted.couponRate) : prev.couponRate,
        startDate: extracted.startDate ?? prev.startDate,
        endDate: extracted.endDate ?? prev.endDate,
        paymentFrequency: (extracted.paymentFrequency as PaymentFrequency) ?? prev.paymentFrequency,
        paymentDayFrom:
          extracted.paymentDayFrom != null ? String(extracted.paymentDayFrom) : prev.paymentDayFrom,
        paymentDayTo:
          extracted.paymentDayTo != null ? String(extracted.paymentDayTo) : prev.paymentDayTo,
        whitepaperUrl: extracted.whitepaperUrl ?? prev.whitepaperUrl,
      }))
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Parse error')
    } finally {
      setParsing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleSave() {
    const errs = validate(form)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    setSaving(true)
    try {
      const now = new Date().toISOString()
      const base = {
        name: form.name.trim(),
        platform: form.platform.trim(),
        currency: form.currency,
        couponRate: Number(form.couponRate),
        startDate: form.startDate,
        endDate: form.endDate,
        paymentFrequency: form.paymentFrequency,
        customFrequencyDays:
          form.paymentFrequency === 'custom' && form.customFrequencyDays
            ? Number(form.customFrequencyDays)
            : undefined,
        paymentDayFrom: Number(form.paymentDayFrom),
        paymentDayTo: Number(form.paymentDayTo),
        whitepaperUrl: form.whitepaperUrl.trim() || undefined,
        updatedAt: now,
      }

      if (isEdit && existingInstrument?.id != null) {
        await db.instruments.update(existingInstrument.id, base)
        const updated = { ...existingInstrument, ...base }
        await regenerateSchedule(updated)
        navigate(`/instruments/${existingInstrument.id}`)
      } else {
        const newInstrument: Instrument = {
          ...base,
          status: 'active',
          createdAt: now,
        }
        const newId = await db.instruments.add(newInstrument)
        const withId = { ...newInstrument, id: newId as number }
        await regenerateSchedule(withId)
        navigate(`/instruments/${newId}`)
      }
    } finally {
      setSaving(false)
    }
  }

  const currencyOptions = [
    { value: 'BYN', label: 'BYN' },
    { value: 'USD', label: 'USD' },
    { value: 'EUR', label: 'EUR' },
  ]

  const frequencyOptions = [
    { value: 'monthly', label: t('instrument.frequency.monthly') },
    { value: 'quarterly', label: t('instrument.frequency.quarterly') },
    { value: 'custom', label: t('instrument.frequency.custom') },
  ]

  if (isEdit && existingInstrument === null) {
    // still loading
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="size-8" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate(isEdit ? `/instruments/${id}` : '/instruments')}
          className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label={t('common.back')}
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {isEdit ? t('instrument.edit') : t('instrument.add')}
        </h1>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        {/* Whitepaper PDF extraction */}
        {llmConfigured && (
          <div className="mb-6">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handlePdfChange}
            />
            <Button
              variant="secondary"
              size="sm"
              icon={
                parsing ? (
                  <Spinner className="size-4" />
                ) : (
                  <span className="flex items-center gap-0.5">
                    <ScanText className="size-4" />
                    <Sparkles className="size-3" />
                  </span>
                )
              }
              loading={parsing}
              onClick={() => fileInputRef.current?.click()}
            >
              {t('instrument.parseWhitepaper')}
            </Button>
            {parseError && <p className="mt-1.5 text-xs text-red-500">{parseError}</p>}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Input
              label={t('instrument.name')}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              error={errors.name}
              placeholder="e.g. Token Bond A"
            />
          </div>

          <Input
            label={t('instrument.platform')}
            value={form.platform}
            onChange={(e) => set('platform', e.target.value)}
            error={errors.platform}
            placeholder="e.g. Finstore"
          />

          <Select
            label={t('instrument.currency')}
            value={form.currency}
            onChange={(e) => set('currency', e.target.value)}
            options={currencyOptions}
          />

          <Input
            label={t('instrument.couponRate')}
            type="number"
            min="0"
            step="any"
            value={form.couponRate}
            onChange={(e) => set('couponRate', e.target.value)}
            error={errors.couponRate}
            placeholder="e.g. 18.5"
          />

          <Input
            label={t('instrument.startDate')}
            type="date"
            value={form.startDate}
            onChange={(e) => set('startDate', e.target.value)}
            error={errors.startDate}
          />

          <Input
            label={t('instrument.endDate')}
            type="date"
            value={form.endDate}
            onChange={(e) => set('endDate', e.target.value)}
            error={errors.endDate}
          />

          <Select
            label={t('instrument.paymentFrequency')}
            value={form.paymentFrequency}
            onChange={(e) => set('paymentFrequency', e.target.value)}
            options={frequencyOptions}
          />

          {form.paymentFrequency === 'custom' && (
            <Input
              label="Interval (days)"
              type="number"
              min="1"
              step="1"
              value={form.customFrequencyDays}
              onChange={(e) => set('customFrequencyDays', e.target.value)}
              error={errors.customFrequencyDays}
            />
          )}

          <Input
            label={t('instrument.paymentDayFrom')}
            type="number"
            min="1"
            max="31"
            step="1"
            value={form.paymentDayFrom}
            onChange={(e) => set('paymentDayFrom', e.target.value)}
            error={errors.paymentDayFrom}
            placeholder="1–31"
          />

          <Input
            label={t('instrument.paymentDayTo')}
            type="number"
            min="1"
            max="31"
            step="1"
            value={form.paymentDayTo}
            onChange={(e) => set('paymentDayTo', e.target.value)}
            error={errors.paymentDayTo}
            placeholder="1–31"
          />

          <div className="sm:col-span-2">
            <Input
              label={t('instrument.whitepaperUrl')}
              type="url"
              value={form.whitepaperUrl}
              onChange={(e) => set('whitepaperUrl', e.target.value)}
              placeholder="https://..."
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
          <Button
            variant="secondary"
            onClick={() => navigate(isEdit ? `/instruments/${id}` : '/instruments')}
          >
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            icon={<Save className="size-4" />}
            loading={saving}
            onClick={handleSave}
          >
            {t('common.save')}
          </Button>
        </div>
      </div>
    </div>
  )
}
