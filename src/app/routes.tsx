/* eslint-disable react-refresh/only-export-components */
import { lazy, Suspense, type ComponentType } from 'react'
import type { RouteObject } from 'react-router-dom'
import { Spinner } from '@/shared/components/Spinner'

const Portfolio = lazy(() => import('@/features/portfolio/components/PortfolioScreen'))
const InstrumentList = lazy(() => import('@/features/instruments/components/InstrumentListScreen'))
const InstrumentDetail = lazy(
  () => import('@/features/instruments/components/InstrumentDetailScreen'),
)
const InstrumentForm = lazy(() => import('@/features/instruments/components/InstrumentFormScreen'))
const Calendar = lazy(() => import('@/features/calendar/components/CalendarScreen'))
const Ledger = lazy(() => import('@/features/ledger/components/LedgerScreen'))
const SettingsScreen = lazy(() => import('@/features/settings/components/SettingsScreen'))

function Loading() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner className="size-8" />
    </div>
  )
}

function wrap(Component: ComponentType) {
  return (
    <Suspense fallback={<Loading />}>
      <Component />
    </Suspense>
  )
}

export const routes: RouteObject[] = [
  { path: '/', element: wrap(Portfolio) },
  { path: '/instruments', element: wrap(InstrumentList) },
  { path: '/instruments/new', element: wrap(InstrumentForm) },
  { path: '/instruments/:id', element: wrap(InstrumentDetail) },
  { path: '/instruments/:id/edit', element: wrap(InstrumentForm) },
  { path: '/calendar', element: wrap(Calendar) },
  { path: '/ledger', element: wrap(Ledger) },
  { path: '/settings', element: wrap(SettingsScreen) },
]
