import { getRealDb, getDemoDb } from './dbManager'
import { getPresentationMode } from './presentationModeStorage'
import type { Settings } from './types'

const realDb = getRealDb()
const demoDb = getDemoDb()

/**
 * Proxy object that routes all database operations to the correct database
 * based on presentation mode stored in localStorage
 */
export const db = new Proxy(realDb, {
  get: (_, prop) => {
    const isPresentationMode = getPresentationMode()
    const activeDb = isPresentationMode ? demoDb : realDb
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (activeDb as any)[prop]
  },
}) as typeof realDb

/**
 * Get settings from the REAL database only
 * (Settings are always stored in real DB to determine the mode)
 */
export async function getSettings(): Promise<Settings> {
  const existing = await realDb.settings.toCollection().first()
  if (existing) return existing
  const defaultSettings: Settings = {
    theme: 'dark',
    language: 'ru',
    baseCurrency: 'BYN',
    hideAmounts: false,
    showZeroPayments: false,
    presentationMode: false,
  }
  await realDb.settings.add(defaultSettings)
  return defaultSettings
}

/**
 * Update settings in the REAL database only
 */
export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const existing = await realDb.settings.toCollection().first()
  if (existing?.id != null) {
    await realDb.settings.update(existing.id, patch)
  }
}
