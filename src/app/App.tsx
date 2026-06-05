import { useEffect } from 'react'
import { useRoutes } from 'react-router-dom'
import { routes } from './routes'
import { Sidebar } from '@/shared/components/Sidebar'
import { BottomTabBar } from '@/shared/components/BottomTabBar'
import { InstallBanner } from '@/shared/components/InstallBanner'
import { useUIStore, applyTheme } from '@/store/uiStore'
import { db, getSettings } from '@/db/db'
import { fetchAndCacheRates, needsRefresh } from '@/services/exchangeRates/NBRBClient'
import i18n from './i18n'

export default function App() {
  const { setTheme, setLanguage, setBaseCurrency, setHideAmounts, theme } = useUIStore()
  const element = useRoutes(routes)

  useEffect(() => {
    void (async () => {
      try {
        const usdRate = await db.exchangeRates.get('USD')
        if (needsRefresh(usdRate?.fetchedAt)) {
          await fetchAndCacheRates()
        }
      } catch {
        // silent — offline or API unavailable
      }
    })()
  }, [])

  useEffect(() => {
    void (async () => {
      const settings = await getSettings()
      setTheme(settings.theme)
      setLanguage(settings.language)
      setBaseCurrency(settings.baseCurrency)
      setHideAmounts(settings.hideAmounts ?? false)
      await i18n.changeLanguage(settings.language)
      document.title = i18n.t('appTitle')
    })()
  }, [setTheme, setLanguage, setBaseCurrency, setHideAmounts])

  useEffect(() => {
    applyTheme(theme)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme(theme)
    mq.addEventListener('change', handler)
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
