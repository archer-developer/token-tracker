import Dexie, { type Table } from 'dexie'
import type {
  Instrument,
  PurchaseLot,
  PaymentRecord,
  LedgerEntry,
  ExchangeRate,
  Settings,
} from './types'

// Real database for user data
class RealDB extends Dexie {
  instruments!: Table<Instrument>
  purchaseLots!: Table<PurchaseLot>
  paymentRecords!: Table<PaymentRecord>
  ledgerEntries!: Table<LedgerEntry>
  exchangeRates!: Table<ExchangeRate>
  settings!: Table<Settings>

  constructor() {
    super('TokensTrackerDB')
    this.version(1).stores({
      instruments: '++id, name, status, platform, currency',
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

// Demo database for presentation mode
class DemoDB extends Dexie {
  instruments!: Table<Instrument>
  purchaseLots!: Table<PurchaseLot>
  paymentRecords!: Table<PaymentRecord>
  ledgerEntries!: Table<LedgerEntry>
  exchangeRates!: Table<ExchangeRate>
  settings!: Table<Settings>

  constructor() {
    super('TokensTrackerDemoDB')
    this.version(1).stores({
      instruments: '++id, name, status, platform, currency',
      purchaseLots: '++id, instrumentId, purchaseDate',
      paymentRecords: '++id, instrumentId, periodIndex, status, type, paymentDateFrom',
      ledgerEntries: '++id, instrumentId, date, type',
      exchangeRates: 'currency',
      settings: '++id',
    })
  }
}

const realDb = new RealDB()
const demoDb = new DemoDB()

/**
 * Get the active database based on presentation mode.
 * Must be called AFTER presentation mode is determined in App.tsx
 */
export function getActiveDb(isPresentationMode: boolean) {
  return isPresentationMode ? demoDb : realDb
}

/**
 * Get the real database (for reading original data or checking settings)
 */
export function getRealDb() {
  return realDb
}

/**
 * Get the demo database
 */
export function getDemoDb() {
  return demoDb
}

/**
 * Load demo data from JSON into the demo database
 */
export async function loadDemoData(demoData: {
  instruments: Instrument[]
  purchaseLots: PurchaseLot[]
  paymentRecords: PaymentRecord[]
  ledgerEntries: LedgerEntry[]
  exchangeRates: ExchangeRate[]
  settings?: Settings[]
}): Promise<void> {
  await demoDb.transaction(
    'rw',
    [
      demoDb.instruments,
      demoDb.purchaseLots,
      demoDb.paymentRecords,
      demoDb.ledgerEntries,
      demoDb.exchangeRates,
      demoDb.settings,
    ],
    async () => {
      // Clear existing data
      await demoDb.instruments.clear()
      await demoDb.purchaseLots.clear()
      await demoDb.paymentRecords.clear()
      await demoDb.ledgerEntries.clear()
      await demoDb.exchangeRates.clear()
      await demoDb.settings.clear()

      // Load new data
      if (demoData.instruments.length > 0) {
        await demoDb.instruments.bulkAdd(demoData.instruments)
      }
      if (demoData.purchaseLots.length > 0) {
        await demoDb.purchaseLots.bulkAdd(demoData.purchaseLots)
      }
      if (demoData.paymentRecords.length > 0) {
        await demoDb.paymentRecords.bulkAdd(demoData.paymentRecords)
      }
      if (demoData.ledgerEntries.length > 0) {
        await demoDb.ledgerEntries.bulkAdd(demoData.ledgerEntries)
      }
      if (demoData.exchangeRates.length > 0) {
        await demoDb.exchangeRates.bulkAdd(demoData.exchangeRates)
      }

      // Load settings with presentationMode: true
      if (demoData.settings && demoData.settings.length > 0) {
        // Ensure presentationMode is true in all settings
        const settingsWithMode = demoData.settings.map((s) => ({
          ...s,
          presentationMode: true,
        }))
        await demoDb.settings.bulkAdd(settingsWithMode)
      } else {
        await demoDb.settings.add({
          theme: 'dark',
          language: 'ru',
          baseCurrency: 'BYN',
          hideAmounts: false,
          showZeroPayments: false,
          presentationMode: true,
        })
      }
    },
  )
}
