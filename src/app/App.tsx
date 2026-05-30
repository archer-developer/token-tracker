import { useEffect } from 'react'
import { useRoutes } from 'react-router-dom'
import { routes } from './routes'
import { Sidebar } from '@/shared/components/Sidebar'
import { BottomTabBar } from '@/shared/components/BottomTabBar'
import { useUIStore, applyTheme } from '@/store/uiStore'
import { getSettings } from '@/db/db'
import i18n from './i18n'

export default function App() {
  const { setTheme, setLanguage, setBaseCurrency, theme } = useUIStore()
  const element = useRoutes(routes)

  useEffect(() => {
    void (async () => {
      const settings = await getSettings()
      setTheme(settings.theme)
      setLanguage(settings.language)
      setBaseCurrency(settings.baseCurrency)
      void i18n.changeLanguage(settings.language)
    })()
  }, [setTheme, setLanguage, setBaseCurrency])

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
    </div>
  )
}
