import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { LayoutDashboard } from 'lucide-react'
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from 'recharts'
import { useUIStore } from '@/store/uiStore'
import { EmptyState } from '@/shared/components/EmptyState'
import { Spinner } from '@/shared/components/Spinner'
import { formatCurrency, formatPercent } from '@/shared/utils/format'
import { usePortfolioMetrics } from '@/features/portfolio/hooks/usePortfolioMetrics'
import { useCashFlowTimeline } from '@/features/portfolio/hooks/useCashFlowTimeline'
import type { Currency } from '@/db/types'

// ─── Metric card ────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  valueClass = 'text-gray-900 dark:text-gray-100',
  sub,
}: {
  label: string
  value: string
  valueClass?: string
  sub?: string
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <p className="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
        {label}
      </p>
      <p className={`mt-1.5 text-xl font-semibold tabular-nums ${valueClass}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{sub}</p>}
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

// ─── P&L chart ──────────────────────────────────────────────────────────────

function PnLTooltip({
  active,
  payload,
  label,
  baseCurrency,
}: {
  active?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: readonly any[]
  label?: string | number
  baseCurrency: Currency
}) {
  if (!active || !payload?.length) return null

  const rawValue = payload.find((p) => p.value != null)?.value as number | string | null | undefined
  if (rawValue == null) return null
  const value = typeof rawValue === 'string' ? parseFloat(rawValue) : rawValue
  if (!isFinite(value)) return null

  const isProjected = payload.find((p) => p.dataKey === 'projected' && p.value != null) != null
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-lg dark:border-gray-700 dark:bg-gray-900">
      <p className="font-medium text-gray-700 dark:text-gray-300">{String(label ?? '')}</p>
      <p
        className={`mt-0.5 font-semibold tabular-nums ${value >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
      >
        {value >= 0 ? '+' : ''}
        {formatCurrency(value, baseCurrency)}
      </p>
      {isProjected && <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">прогноз</p>}
    </div>
  )
}

interface CustomXAxisTickProps {
  x: number
  y: number
  payload: { value: string; index: number }
  isMobile: boolean
  data: ReturnType<typeof useCashFlowTimeline>
}

function CustomXAxisTick({
  x,
  y,
  payload,
  isMobile,
  data,
}: CustomXAxisTickProps): JSX.Element | null {
  if (!isMobile) return null

  const dataPoint = data[payload.index]
  if (!dataPoint) return null

  const [, month] = dataPoint.monthISO.split('-')
  const monthNum = Number(month)

  // Mobile: show January only
  if (monthNum !== 1) return null

  return (
    <text x={x} y={y} textAnchor="middle" dominantBaseline="hanging" fontSize={11} fill="#9ca3af">
      {dataPoint.labelMobile}
    </text>
  )
}

function PnLChart({
  data,
  baseCurrency,
}: {
  data: ReturnType<typeof useCashFlowTimeline>
  baseCurrency: Currency
}) {
  const { t } = useTranslation()
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // X-axis: show ~10 labels max
  const tickInterval = Math.max(1, Math.floor(data.length / 10))

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-gray-400 dark:text-gray-500">
        {t('portfolio.chartNoData')}
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#e5e7eb"
          strokeOpacity={0.6}
          vertical={false}
        />

        <XAxis
          dataKey="label"
          tick={
            isMobile
              ? (props: CustomXAxisTickProps) => (
                  <CustomXAxisTick {...props} isMobile={isMobile} data={data} />
                )
              : { fontSize: 11, fill: '#9ca3af' }
          }
          tickLine={false}
          axisLine={false}
          interval={isMobile ? 0 : tickInterval}
        />

        <YAxis
          tickFormatter={(v: number) =>
            new Intl.NumberFormat('ru-BY', {
              notation: 'compact',
              maximumFractionDigits: 1,
            }).format(v)
          }
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={false}
          width={56}
        />

        <Tooltip
          content={(props) => <PnLTooltip {...props} baseCurrency={baseCurrency} />}
          cursor={{ stroke: '#6366f1', strokeWidth: 1, strokeDasharray: '4 2' }}
        />

        {/* Break-even line */}
        <ReferenceLine y={0} stroke="#6b7280" strokeWidth={1.5} strokeDasharray="5 3" />

        {/* Historical — colored by value */}
        <Bar dataKey="historical" isAnimationActive={false}>
          {data.map((entry, index) => (
            <Cell
              key={`hist-${index}`}
              fill={entry.historical != null && entry.historical >= 0 ? '#22c55e' : '#ef4444'}
              opacity={0.5}
              stroke={entry.historical != null && entry.historical >= 0 ? '#16a34a' : '#dc2626'}
              strokeWidth={2}
            />
          ))}
        </Bar>

        {/* Projected — colored by value, lighter */}
        <Bar dataKey="projected" isAnimationActive={false}>
          {data.map((entry, index) => (
            <Cell
              key={`proj-${index}`}
              fill={entry.projected != null && entry.projected >= 0 ? '#22c55e' : '#ef4444'}
              opacity={0.25}
              stroke={entry.projected != null && entry.projected >= 0 ? '#16a34a' : '#dc2626'}
              strokeWidth={2}
              strokeOpacity={0.6}
            />
          ))}
        </Bar>

        {/* Line overlay for historical data */}
        <Line
          dataKey="historical"
          stroke="#6366f1"
          strokeWidth={2.5}
          dot={false}
          isAnimationActive={false}
          connectNulls
        />

        {/* Line overlay for projected data (dashed) */}
        <Line
          dataKey="projected"
          stroke="#6366f1"
          strokeWidth={2.5}
          strokeDasharray="6 3"
          strokeOpacity={0.6}
          dot={false}
          isAnimationActive={false}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ─── Screen ─────────────────────────────────────────────────────────────────

export default function PortfolioScreen() {
  const { t } = useTranslation()
  const { baseCurrency } = useUIStore()
  const metrics = usePortfolioMetrics()
  const timeline = useCashFlowTimeline()

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

  // Projected final P&L: last value in timeline
  const lastPoint = timeline.length > 0 ? timeline[timeline.length - 1] : null
  const projectedFinal = lastPoint?.projected ?? lastPoint?.historical ?? null

  const projectedClass =
    projectedFinal == null
      ? 'text-gray-900 dark:text-gray-100'
      : projectedFinal >= 0
        ? 'text-green-600 dark:text-green-400'
        : 'text-red-600 dark:text-red-400'

  const projectedDisplay =
    projectedFinal != null ? `${projectedFinal >= 0 ? '+' : ''}${fmt(projectedFinal)}` : '—'

  const xirrClass =
    metrics.xirrValue == null
      ? 'text-gray-900 dark:text-gray-100'
      : metrics.xirrValue > 0
        ? 'text-green-600 dark:text-green-400'
        : 'text-red-600 dark:text-red-400'

  const hasDefaulted = metrics.counts.defaulted > 0

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">
        {t('portfolio.title')}
      </h1>

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label={t('portfolio.activePrincipal')} value={fmt(metrics.activePrincipal)} />
        <MetricCard
          label={t('portfolio.defaultedPrincipal')}
          value={fmt(metrics.defaultedPrincipal)}
          valueClass={
            metrics.defaultedPrincipal > 0
              ? 'text-red-600 dark:text-red-400'
              : 'text-gray-900 dark:text-gray-100'
          }
        />
        <MetricCard
          label={t('portfolio.xirr')}
          value={metrics.xirrValue != null ? formatPercent(metrics.xirrValue) : '—'}
          valueClass={xirrClass}
          sub={t('portfolio.xirrSub')}
        />
        <MetricCard
          label={t('portfolio.projectedFinal')}
          value={projectedDisplay}
          valueClass={projectedClass}
          sub={lastPoint?.label}
        />
      </div>

      {/* P&L Chart */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {t('portfolio.chartTitle')}
          </h2>
          <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 bg-indigo-500" />
              {t('portfolio.chartHistorical')}
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-4 opacity-60"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(90deg,#6366f1 0,#6366f1 3px,transparent 3px,transparent 6px)',
                }}
              />
              {t('portfolio.chartProjected')}
            </span>
          </div>
        </div>
        <PnLChart data={timeline} baseCurrency={baseCurrency} />
        <div className="mt-2 flex justify-center gap-6 text-xs text-gray-400 dark:text-gray-500">
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-green-500" />
            {t('portfolio.chartProfit')}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-red-500" />
            {t('portfolio.chartLoss')}
          </span>
        </div>
      </div>

      {/* Instrument counts */}
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

      {/* Recovery metrics */}
      {hasDefaulted && (
        <>
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

          {/* XIRR scenarios */}
          <div className="mt-8">
            <h2 className="mb-3 text-sm font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
              {t('portfolio.scenariosTitle')}
            </h2>
            <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                    <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
                      {t('portfolio.scenarioColumn')}
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500 dark:text-gray-400">
                      {t('portfolio.recoveryRateColumn')}
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500 dark:text-gray-400">
                      {t('portfolio.xirr')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {metrics.scenarioXIRRs.map((scenario, idx) => {
                    const rateVal = scenario.rate
                    const rateClass =
                      rateVal == null
                        ? 'text-gray-500 dark:text-gray-400'
                        : rateVal > 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                    const scenarioKeys: Record<string, string> = {
                      Worst: 'portfolio.scenario_worst',
                      Conservative: 'portfolio.scenario_conservative',
                      Moderate: 'portfolio.scenario_moderate',
                      Optimistic: 'portfolio.scenario_optimistic',
                      'Full Recovery': 'portfolio.scenario_fullRecovery',
                    }
                    const translatedLabel = t(
                      scenarioKeys[scenario.label] ?? 'portfolio.scenario_worst',
                    )
                    return (
                      <tr key={scenario.label} className="bg-white dark:bg-gray-900">
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                          {translatedLabel}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 tabular-nums dark:text-gray-300">
                          {idx * 25}%
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
        </>
      )}
    </div>
  )
}
