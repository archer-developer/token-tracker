import { useRef, useState, useEffect, type ReactNode, type ChangeEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { useTranslation } from 'react-i18next'
import i18n from '@/app/i18n'
import {
  Sun,
  Moon,
  Monitor,
  RefreshCw,
  Sparkles,
  Download,
  Upload,
  Eye,
  EyeOff,
  ChevronDown,
} from 'lucide-react'
import type { Currency, Language, Theme } from '@/db/types'
import { useSettings } from '@/features/settings/hooks/useSettings'
import { updateSettings } from '@/db/db'
import { fetchAndCacheRates } from '@/services/exchangeRates/NBRBClient'
import { testConnection } from '@/services/llm/LLMService'
import { exportBackup, importBackup, downloadJson } from '@/db/backup'
import { Button } from '@/shared/components/Button'
import { Input } from '@/shared/components/Input'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { Spinner } from '@/shared/components/Spinner'
import { Toggle } from '@/shared/components/Toggle'
import { useUIStore } from '@/store/uiStore'
import { formatDate } from '@/shared/utils/format'

export function SettingsScreen() {
  const { t } = useTranslation()
  const settings = useSettings()
  const {
    theme,
    setTheme,
    language,
    setLanguage,
    baseCurrency,
    setBaseCurrency,
    hideAmounts,
    setHideAmounts,
    showZeroPayments,
    setShowZeroPayments,
  } = useUIStore()

  // Exchange rates
  const [ratesLoading, setRatesLoading] = useState(false)
  const [ratesError, setRatesError] = useState<string | null>(null)
  const exchangeRates = useLiveQuery(() => db.exchangeRates.toArray(), [], [])

  // LLM fields (local state to avoid round-trip on every keystroke)
  const [llmBaseUrl, setLlmBaseUrl] = useState('')
  const [llmApiKey, setLlmApiKey] = useState('')
  const [llmModel, setLlmModel] = useState('')
  const [llmKeyVisible, setLlmKeyVisible] = useState(false)
  const [llmSaving, setLlmSaving] = useState(false)
  const [llmTesting, setLlmTesting] = useState(false)
  const [llmTestResult, setLlmTestResult] = useState<'success' | 'error' | null>(null)
  const [llmExpanded, setLlmExpanded] = useState(false)

  // Backup
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importConfirm, setImportConfirm] = useState(false)
  const [pendingImportJson, setPendingImportJson] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  // Initialize LLM fields from settings once when settings first load
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (settings) {
      setLlmBaseUrl(settings.llmBaseUrl ?? '')
      setLlmApiKey(settings.llmApiKey ?? '')
      setLlmModel(settings.llmModel ?? '')
      setHideAmounts(settings.hideAmounts ?? false)
      setShowZeroPayments(settings.showZeroPayments ?? false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.id])
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleRefreshRates() {
    setRatesLoading(true)
    setRatesError(null)
    try {
      await fetchAndCacheRates()
      await updateSettings({ exchangeRatesUpdatedAt: new Date().toISOString() })
    } catch (e) {
      setRatesError(e instanceof Error ? e.message : String(e))
    } finally {
      setRatesLoading(false)
    }
  }

  async function handleSaveLlm() {
    setLlmSaving(true)
    try {
      await updateSettings({
        llmBaseUrl: llmBaseUrl || undefined,
        llmApiKey: llmApiKey || undefined,
        llmModel: llmModel || undefined,
      })
    } finally {
      setLlmSaving(false)
    }
  }

  async function handleTestLlm() {
    setLlmTesting(true)
    setLlmTestResult(null)
    try {
      const ok = await testConnection()
      setLlmTestResult(ok ? 'success' : 'error')
    } catch {
      setLlmTestResult('error')
    } finally {
      setLlmTesting(false)
    }
  }

  async function handleExport() {
    const content = await exportBackup()
    const date = new Date().toISOString().slice(0, 10)
    downloadJson(content, `tokens-tracker-backup-${date}.json`)
  }

  function handleImportClick() {
    fileInputRef.current?.click()
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      const text = evt.target?.result
      if (typeof text === 'string') {
        setPendingImportJson(text)
        setImportConfirm(true)
        setImportError(null)
      }
    }
    reader.readAsText(file)
    // Reset file input so the same file can be re-selected if needed
    e.target.value = ''
  }

  async function handleConfirmImport() {
    if (!pendingImportJson) return
    try {
      await importBackup(pendingImportJson)
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e))
    } finally {
      setImportConfirm(false)
      setPendingImportJson(null)
    }
  }

  function handleChangeLanguage(lang: Language) {
    setLanguage(lang)
    void i18n.changeLanguage(lang)
  }

  const themeOptions: { value: Theme; label: string; icon: ReactNode }[] = [
    { value: 'light', label: t('settings.theme_light'), icon: <Sun className="size-4" /> },
    { value: 'dark', label: t('settings.theme_dark'), icon: <Moon className="size-4" /> },
    { value: 'system', label: t('settings.theme_system'), icon: <Monitor className="size-4" /> },
  ]

  const languageOptions: { value: Language; label: string }[] = [
    { value: 'ru', label: 'Русский' },
    { value: 'by', label: 'Беларуская' },
  ]

  const currencyOptions: { value: Currency; label: string }[] = [
    { value: 'BYN', label: 'BYN' },
    { value: 'USD', label: 'USD' },
    { value: 'EUR', label: 'EUR' },
  ]

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-6 text-xl font-bold text-gray-900 dark:text-gray-100">
        {t('settings.title')}
      </h1>

      {/* General section */}
      <div className="mb-4 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
        <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">
          {t('settings.general')}
        </h2>

        <div className="flex flex-col gap-5">
          {/* Theme */}
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('settings.theme')}
            </p>
            <div className="flex w-fit overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
              {themeOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTheme(opt.value)}
                  className={`flex items-center justify-center gap-0 px-3 py-2 text-sm font-medium transition-colors md:gap-1.5 md:px-4 ${
                    theme === opt.value
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
                  }`}
                >
                  {opt.icon}
                  <span className="hidden md:inline">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Language */}
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('settings.language')}
            </p>
            <div className="flex w-fit overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
              {languageOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleChangeLanguage(opt.value)}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    language === opt.value
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Base Currency */}
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('settings.baseCurrency')}
            </p>
            <div className="flex w-fit overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
              {currencyOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setBaseCurrency(opt.value)}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    baseCurrency === opt.value
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Hide Amounts */}
          <div>
            <Toggle
              checked={hideAmounts}
              onChange={setHideAmounts}
              label={t('settings.hideAmounts')}
            />
          </div>

          {/* Show Zero Payments */}
          <div>
            <Toggle
              checked={showZeroPayments}
              onChange={setShowZeroPayments}
              label={t('settings.showZeroPayments')}
            />
          </div>
        </div>
      </div>

      {/* Exchange Rates section */}
      <div className="mb-4 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
        <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">
          {t('settings.exchangeRates')}
        </h2>

        <div className="flex flex-col gap-3">
          {/* Cached rates display */}
          {exchangeRates.length > 0 ? (
            <div className="flex flex-col gap-1">
              {exchangeRates.map((r) => (
                <div key={r.currency} className="flex items-baseline gap-2 text-sm">
                  <span className="w-16 font-medium text-gray-900 dark:text-gray-100">
                    1 {r.currency}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400">=</span>
                  <span className="font-semibold text-gray-900 tabular-nums dark:text-gray-100">
                    {r.rate.toFixed(4)} BYN
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">({r.date})</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('settings.noRatesCached', 'Курсы не загружены. Нажмите «Обновить».')}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              icon={
                ratesLoading ? <Spinner className="size-4" /> : <RefreshCw className="size-4" />
              }
              loading={ratesLoading}
              onClick={() => void handleRefreshRates()}
            >
              <span className="md:hidden">{t('settings.refreshRatesShort')}</span>
              <span className="hidden md:inline">{t('settings.refreshRates')}</span>
            </Button>
            {settings?.exchangeRatesUpdatedAt && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t('settings.lastUpdated')}: {formatDate(settings.exchangeRatesUpdatedAt)}
              </span>
            )}
          </div>

          {ratesError && <p className="text-xs text-red-500 dark:text-red-400">{ratesError}</p>}
        </div>
      </div>

      {/* LLM Integration section */}
      <div className="mb-4 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
        <button
          onClick={() => setLlmExpanded(!llmExpanded)}
          className="mb-4 flex w-full items-center justify-between text-left transition-colors hover:text-indigo-600 dark:hover:text-indigo-400"
        >
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {t('settings.llm')}
          </h2>
          <ChevronDown
            className={`size-5 text-gray-600 transition-transform dark:text-gray-400 ${
              llmExpanded ? 'rotate-180' : ''
            }`}
          />
        </button>

        {llmExpanded && (
          <div className="flex flex-col gap-4">
            <Input
              label={t('settings.llmBaseUrl')}
              placeholder="https://api.openai.com/v1"
              value={llmBaseUrl}
              onChange={(e) => setLlmBaseUrl(e.target.value)}
            />

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('settings.llmApiKey')}
              </label>
              <div className="relative">
                <input
                  type={llmKeyVisible ? 'text' : 'password'}
                  value={llmApiKey}
                  onChange={(e) => setLlmApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 pr-10 text-sm text-gray-900 placeholder-gray-400 focus:border-transparent focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                />
                <button
                  type="button"
                  onClick={() => setLlmKeyVisible((v) => !v)}
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {llmKeyVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <Input
              label={t('settings.llmModel')}
              placeholder="gpt-4o-mini"
              value={llmModel}
              onChange={(e) => setLlmModel(e.target.value)}
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                loading={llmSaving}
                onClick={() => void handleSaveLlm()}
              >
                {t('common.save')}
              </Button>

              <Button
                variant="secondary"
                size="sm"
                icon={llmTesting ? <Spinner className="size-4" /> : <Sparkles className="size-4" />}
                loading={llmTesting}
                onClick={() => void handleTestLlm()}
              >
                {t('settings.llmTest')}
              </Button>

              {llmTestResult === 'success' && (
                <span className="text-sm text-green-600 dark:text-green-400">
                  {t('settings.llmTestSuccess')}
                </span>
              )}
              {llmTestResult === 'error' && (
                <span className="text-sm text-red-600 dark:text-red-400">
                  {t('settings.llmTestFail')}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Backup section */}
      <div className="mb-4 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
        <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">
          {t('settings.backup')}
        </h2>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<Download className="size-4" />}
              onClick={() => void handleExport()}
            >
              {t('settings.exportBackup')}
            </Button>

            <Button
              variant="secondary"
              size="sm"
              icon={<Upload className="size-4" />}
              onClick={handleImportClick}
            >
              {t('settings.importBackup')}
            </Button>
          </div>

          {importError && <p className="text-xs text-red-500 dark:text-red-400">{importError}</p>}

          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>

      <ConfirmDialog
        open={importConfirm}
        title={t('settings.importBackup')}
        message={t('settings.importBackupWarning')}
        danger
        onConfirm={() => void handleConfirmImport()}
        onCancel={() => {
          setImportConfirm(false)
          setPendingImportJson(null)
        }}
      />
    </div>
  )
}

export default SettingsScreen
