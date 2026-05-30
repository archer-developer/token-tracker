import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LayoutDashboard, Landmark, CalendarDays, ScrollText, Settings } from 'lucide-react'

const tabs = [
  { to: '/', label: 'nav.portfolio', Icon: LayoutDashboard },
  { to: '/instruments', label: 'nav.instruments', Icon: Landmark },
  { to: '/calendar', label: 'nav.calendar', Icon: CalendarDays },
  { to: '/ledger', label: 'nav.ledger', Icon: ScrollText },
  { to: '/settings', label: 'nav.settings', Icon: Settings },
]

export function BottomTabBar() {
  const { t } = useTranslation()
  return (
    <nav className="fixed right-0 bottom-0 left-0 z-40 border-t border-gray-200 bg-white lg:hidden dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-stretch" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {tabs.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'}`
            }
          >
            <Icon className="size-6" />
            <span>{t(label)}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
