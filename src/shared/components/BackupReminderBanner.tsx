import { DatabaseBackup, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useBackupReminder } from '@/shared/hooks/useBackupReminder'

function daysSince(isoDate: string): number {
  return (Date.now() - new Date(isoDate).getTime()) / 86_400_000
}

function lastBackupLabel(lastBackupAt: string | undefined): string {
  if (!lastBackupAt) return 'никогда'
  const days = Math.floor(daysSince(lastBackupAt))
  if (days === 0) return 'сегодня'
  if (days === 1) return 'вчера'
  return `${days} дн. назад`
}

export function BackupReminderBanner() {
  const { shouldRemind, lastBackupAt, snooze } = useBackupReminder()
  const navigate = useNavigate()

  if (!shouldRemind) return null

  return (
    <div className="fixed right-4 bottom-20 left-4 z-50 flex items-center gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3 shadow-lg sm:right-auto sm:bottom-6 sm:left-6 sm:max-w-sm dark:border-amber-800 dark:bg-gray-900">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500">
        <DatabaseBackup className="size-4 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
          Сделайте резервную копию
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Последний бэкап: {lastBackupLabel(lastBackupAt)}
        </p>
      </div>
      <button
        onClick={() => navigate('/settings')}
        className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
      >
        Бэкап
      </button>
      <button
        onClick={snooze}
        className="-mr-1 shrink-0 rounded-lg p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        aria-label="Напомнить через 7 дней"
        title="Напомнить через 7 дней"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
