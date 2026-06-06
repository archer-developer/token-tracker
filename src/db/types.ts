export type Currency = 'BYN' | 'USD' | 'EUR'
export type Theme = 'light' | 'dark' | 'system'
export type Language = 'ru' | 'by'
export type InstrumentStatus = 'active' | 'matured' | 'defaulted' | 'sold'
export type PaymentFrequency = 'monthly' | 'quarterly' | 'custom'
export type PaymentStatus = 'scheduled' | 'paid' | 'missed'
export type PaymentType = 'coupon' | 'redemption' | 'recovery'
export type LedgerEntryType = 'purchase' | 'coupon' | 'redemption' | 'recovery' | 'sale'

export interface Instrument {
  id?: number
  name: string
  whitepaperUrl?: string
  platform: string
  currency: Currency
  couponRate: number
  tokenPrice?: number
  startDate: string
  endDate: string
  paymentFrequency: PaymentFrequency
  customFrequencyDays?: number
  paymentDayFrom: number
  paymentDayTo: number
  status: InstrumentStatus
  defaultDate?: string
  defaultOutstandingPrincipal?: number
  expectedRecoveryRate?: number
  expectedRecoveryDate?: string
  defaultNotes?: string
  createdAt: string
  updatedAt: string
}

export interface PurchaseLot {
  id?: number
  instrumentId: number
  purchaseDate: string
  quantity: number
  pricePerToken: number
  totalCost: number
  notes?: string
  createdAt: string
}

export interface PaymentRecord {
  id?: number
  instrumentId: number
  periodIndex: number
  type: PaymentType
  paymentDateFrom: string
  paymentDateTo: string
  expectedAmount: number
  actualAmount?: number
  status: PaymentStatus
  paidAt?: string
  notes?: string
}

export interface LedgerEntry {
  id?: number
  instrumentId: number
  date: string
  type: LedgerEntryType
  amount: number
  notes?: string
  createdAt: string
}

export interface ExchangeRate {
  currency: Currency
  rate: number
  date: string
  fetchedAt: string
}

export interface Settings {
  id?: number
  theme: Theme
  language: Language
  baseCurrency: Currency
  hideAmounts: boolean
  showZeroPayments: boolean
  presentationMode: boolean
  llmBaseUrl?: string
  llmApiKey?: string
  llmModel?: string
  exchangeRatesUpdatedAt?: string
}
