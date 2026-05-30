import Dexie, { type Table } from 'dexie'
import type {
  Instrument,
  PurchaseLot,
  PaymentRecord,
  LedgerEntry,
  ExchangeRate,
  Settings,
} from './types'

class TokensTrackerDB extends Dexie {
  instruments!: Table<Instrument>
  purchaseLots!: Table<PurchaseLot>
  paymentRecords!: Table<PaymentRecord>
  ledgerEntries!: Table<LedgerEntry>
  exchangeRates!: Table<ExchangeRate>
  settings!: Table<Settings>

  constructor() {
    super('TokensTrackerDB')
    this.version(1).stores({
      instruments: '++id, status, platform, currency',
      purchaseLots: '++id, instrumentId, purchaseDate',
      paymentRecords: '++id, instrumentId, periodIndex, status, type, paymentDateFrom',
      ledgerEntries: '++id, instrumentId, date, type',
      exchangeRates: 'currency',
      settings: '++id',
    })
    this.version(2).stores({
      instruments: '++id, name, status, platform, currency',
    })
  }
}

export const db = new TokensTrackerDB()

export async function getSettings(): Promise<Settings> {
  const existing = await db.settings.toCollection().first()
  if (existing) return existing
  const defaultSettings: Settings = {
    theme: 'dark',
    language: 'ru',
    baseCurrency: 'BYN',
  }
  await db.settings.add(defaultSettings)
  return defaultSettings
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const existing = await db.settings.toCollection().first()
  if (existing?.id != null) {
    await db.settings.update(existing.id, patch)
  }
}
