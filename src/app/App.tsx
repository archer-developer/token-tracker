import { useEffect } from 'react'
import { useRoutes } from 'react-router-dom'
import { routes } from './routes'
import { Sidebar } from '@/shared/components/Sidebar'
import { BottomTabBar } from '@/shared/components/BottomTabBar'
import { InstallBanner } from '@/shared/components/InstallBanner'
import { useUIStore, applyTheme } from '@/store/uiStore'
import { getSettings } from '@/db/db'
import { refreshExchangeRatesIfNeeded } from '@/services/exchangeRates/NBRBClient'
import i18n from './i18n'

export default function App() {
  const { setTheme, setLanguage, setBaseCurrency, setHideAmounts, setShowZeroPayments, theme } =
    useUIStore()
  const element = useRoutes(routes)

  useEffect(() => {
    void refreshExchangeRatesIfNeeded()

    const interval = setInterval(() => {
      void refreshExchangeRatesIfNeeded()
    }, 60 * 1000) // Check every minute

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    void (async () => {
      // Get settings from appropriate database
      // (if presentation mode is on, demoDb already has data loaded from SettingsScreen)
      const settings = await getSettings()
      setTheme(settings.theme)
      setLanguage(settings.language)
      setBaseCurrency(settings.baseCurrency)
      setHideAmounts(settings.hideAmounts ?? false)
      setShowZeroPayments(settings.showZeroPayments ?? false)
      await i18n.changeLanguage(settings.language)
      document.title = i18n.t('appTitle')
    })()
  }, [setTheme, setLanguage, setBaseCurrency, setHideAmounts, setShowZeroPayments])

  useEffect(() => {
    applyTheme(theme)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme(theme)
    mq.addEventListener('change', handler)

    // Update theme-color meta tag for iOS (pull-to-refresh background)
    const prefersDark = mq.matches
    const isDark = theme === 'dark' || (theme === 'system' && prefersDark)
    const themeColorMeta = document.querySelector('meta[name="theme-color"]')
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', isDark ? '#111827' : '#ffffff')
    }

    return () => mq.removeEventListener('change', handler)
  }, [theme])

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <div className="flex">
        <Sidebar />
        <main className="min-w-0 flex-1 pb-20 lg:pb-0">{element}</main>
      </div>
      <BottomTabBar />
      <InstallBanner />
    </div>
  )
}
