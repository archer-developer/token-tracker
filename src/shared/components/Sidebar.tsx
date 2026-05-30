import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LayoutDashboard, Landmark, CalendarDays, ScrollText, Settings, Coins } from 'lucide-react'

const navItems = [
  { to: '/', label: 'nav.portfolio', Icon: LayoutDashboard },
  { to: '/instruments', label: 'nav.instruments', Icon: Landmark },
  { to: '/calendar', label: 'nav.calendar', Icon: CalendarDays },
  { to: '/ledger', label: 'nav.ledger', Icon: ScrollText },
  { to: '/settings', label: 'nav.settings', Icon: Settings },
]

export function Sidebar() {
  const { t } = useTranslation()
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-gray-200 bg-white lg:flex dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center gap-2 border-b border-gray-200 px-5 py-5 dark:border-gray-700">
        <Coins className="size-6 text-indigo-500" />
        <span className="text-base font-semibold text-gray-900 dark:text-gray-100">
          Tokens Tracker
        </span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {navItems.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'}`
            }
          >
            <Icon className="size-5" />
            {t(label)}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
