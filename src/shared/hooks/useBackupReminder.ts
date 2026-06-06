import { useState, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getRealDb } from '@/db/dbManager'
import { getPresentationMode } from '@/db/presentationModeStorage'

const SNOOZE_KEY = 'backup-reminder-snoozed-until'
const THRESHOLD_DAYS = 30
const SNOOZE_DAYS = 7

export function useBackupReminder() {
  const settings = useLiveQuery(() => getRealDb().settings.toCollection().first())

  const [now] = useState(() => Date.now())

  const [snoozedUntil, setSnoozedUntil] = useState<number | null>(() => {
    const stored = localStorage.getItem(SNOOZE_KEY)
    return stored ? new Date(stored).getTime() : null
  })

  const snooze = useCallback(() => {
    const until = new Date()
    until.setDate(until.getDate() + SNOOZE_DAYS)
    localStorage.setItem(SNOOZE_KEY, until.toISOString())
    setSnoozedUntil(until.getTime())
  }, [])

  // Still loading or in presentation mode — never remind
  if (settings === undefined || getPresentationMode()) {
    return { shouldRemind: false, snooze, lastBackupAt: undefined }
  }

  if (snoozedUntil !== null && snoozedUntil > now) {
    return { shouldRemind: false, snooze, lastBackupAt: settings.lastBackupAt }
  }

  const firstUsedAt = settings.firstUsedAt
  const appAgeDays = firstUsedAt ? (now - new Date(firstUsedAt).getTime()) / 86_400_000 : Infinity

  // Don't remind users who just installed — give them 30 days first
  if (appAgeDays < THRESHOLD_DAYS) {
    return { shouldRemind: false, snooze, lastBackupAt: settings.lastBackupAt }
  }

  const lastBackupAt = settings.lastBackupAt
  const daysSinceBackup = lastBackupAt
    ? (now - new Date(lastBackupAt).getTime()) / 86_400_000
    : Infinity

  return {
    shouldRemind: daysSinceBackup > THRESHOLD_DAYS,
    lastBackupAt,
    snooze,
  }
}
