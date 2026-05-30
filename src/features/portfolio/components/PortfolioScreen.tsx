import { useTranslation } from 'react-i18next'
import { LayoutDashboard } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { EmptyState } from '@/shared/components/EmptyState'
import { Spinner } from '@/shared/components/Spinner'
import { formatCurrency, formatPercent } from '@/shared/utils/format'
import { usePortfolioMetrics } from '@/features/portfolio/hooks/usePortfolioMetrics'

function MetricCard({
  label,
  value,
  valueClass = 'text-gray-900 dark:text-gray-100',
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <p className="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
        {label}
      </p>
      <p className={`mt-1.5 text-xl font-semibold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  )
}

function CountCard({ label, count }: { label: string; count: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
      <p className="text-2xl font-bold text-gray-900 tabular-nums dark:text-gray-100">{count}</p>
      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  )
}

export default function PortfolioScreen() {
  const { t } = useTranslation()
  const { baseCurrency } = useUIStore()
  const metrics = usePortfolioMetrics()

  if (metrics.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="size-8" />
      </div>
    )
  }

  const hasAnyInstruments =
    metrics.counts.active +
      metrics.counts.matured +
      metrics.counts.defaulted +
      metrics.counts.sold >
    0

  if (!hasAnyInstruments) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('portfolio.title')}
        </h1>
        <EmptyState icon={<LayoutDashboard className="size-full" />} title={t('portfolio.empty')} />
      </div>
    )
  }

  const fmt = (amount: number) => formatCurrency(amount, baseCurrency)

  const xirrClass =
    metrics.xirrValue == null
      ? 'text-gray-900 dark:text-gray-100'
      : metrics.xirrValue > 0
        ? 'text-green-600 dark:text-green-400'
        : 'text-red-600 dark:text-red-400'

  const xirrDisplay = metrics.xirrValue != null ? formatPercent(metrics.xirrValue) : '—'

  const plClass = (v: number) =>
    v > 0
      ? 'text-green-600 dark:text-green-400'
      : v < 0
        ? 'text-red-600 dark:text-red-400'
        : 'text-gray-900 dark:text-gray-100'

  const hasDefaulted = metrics.counts.defaulted > 0

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">
        {t('portfolio.title')}
      </h1>

      {/* Main metrics grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        <MetricCard label={t('portfolio.totalInvested')} value={fmt(metrics.totalInvested)} />
        <MetricCard label={t('portfolio.activePrincipal')} value={fmt(metrics.activePrincipal)} />
        <MetricCard label={t('portfolio.repaidPrincipal')} value={fmt(metrics.repaidPrincipal)} />
        <MetricCard
          label={t('portfolio.defaultedPrincipal')}
          value={fmt(metrics.defaultedPrincipal)}
          valueClass={
            metrics.defaultedPrincipal > 0
              ? 'text-red-600 dark:text-red-400'
              : 'text-gray-900 dark:text-gray-100'
          }
        />
        <MetricCard label={t('portfolio.portfolioValue')} value={fmt(metrics.portfolioValue)} />
        <MetricCard label={t('portfolio.xirr')} value={xirrDisplay} valueClass={xirrClass} />
        <MetricCard
          label={t('portfolio.realizedPL')}
          value={fmt(metrics.realizedPL)}
          valueClass={plClass(metrics.realizedPL)}
        />
        <MetricCard
          label={t('portfolio.unrealizedPL')}
          value={fmt(metrics.unrealizedPL)}
          valueClass={plClass(metrics.unrealizedPL)}
        />
      </div>

      {/* Risk / counts section */}
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
          {t('nav.instruments')}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <CountCard label={t('portfolio.activeInstruments')} count={metrics.counts.active} />
          <CountCard label={t('portfolio.maturedInstruments')} count={metrics.counts.matured} />
          <CountCard label={t('portfolio.defaultedInstruments')} count={metrics.counts.defaulted} />
          <CountCard label={t('portfolio.soldInstruments')} count={metrics.counts.sold} />
        </div>
      </div>

      {/* Recovery metrics (only if defaulted exists) */}
      {hasDefaulted && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MetricCard
            label={t('portfolio.recoveredPrincipal')}
            value={fmt(metrics.recoveredPrincipal)}
          />
          <MetricCard
            label={t('portfolio.recoveryRatio')}
            value={metrics.recoveryRatio != null ? formatPercent(metrics.recoveryRatio) : '—'}
          />
          <MetricCard
            label={t('portfolio.largestLoss')}
            value={metrics.largestLoss != null ? fmt(metrics.largestLoss) : '—'}
            valueClass={
              metrics.largestLoss != null && metrics.largestLoss < 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-gray-900 dark:text-gray-100'
            }
          />
        </div>
      )}

      {/* Recovery scenario table (only if defaulted instruments exist) */}
      {hasDefaulted && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
            XIRR Scenarios
          </h2>
          <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                  <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
                    Scenario
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500 dark:text-gray-400">
                    Recovery Rate
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500 dark:text-gray-400">
                    {t('portfolio.xirr')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {metrics.scenarioXIRRs.map((scenario, idx) => {
                  const scenarioRate = idx * 25
                  const rateVal = scenario.rate
                  const rateClass =
                    rateVal == null
                      ? 'text-gray-500 dark:text-gray-400'
                      : rateVal > 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                  return (
                    <tr key={scenario.label} className="bg-white dark:bg-gray-900">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                        {scenario.label}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600 tabular-nums dark:text-gray-300">
                        {scenarioRate}%
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-semibold tabular-nums ${rateClass}`}
                      >
                        {rateVal != null ? formatPercent(rateVal) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
