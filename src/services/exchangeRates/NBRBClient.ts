import type { Currency } from '@/db/types'
import { db } from '@/db/db'

const NBRB_URL = 'https://api.nbrb.by/exrates/rates?periodicity=0'
const NBRB_RATE_URL = 'https://api.nbrb.by/exrates/rates'
const CURRENCY_IDS: Record<Exclude<Currency, 'BYN'>, number> = {
  USD: 431,
  EUR: 451,
}

interface NBRBRate {
  Cur_ID: number
  Cur_Abbreviation: string
  Cur_Scale: number
  Cur_Name: string
  Cur_OfficialRate: number
}

function currentSlotStart(): Date {
  const now = new Date()
  const slot = new Date(now)
  slot.setHours(now.getHours() < 12 ? 0 : 12, 0, 0, 0)
  return slot
}

export function needsRefresh(fetchedAt?: string): boolean {
  if (!fetchedAt) return true
  return new Date(fetchedAt) < currentSlotStart()
}

export async function fetchAndCacheRates(): Promise<void> {
  const response = await fetch(NBRB_URL)
  if (!response.ok) throw new Error(`NBRB API error: ${response.status}`)

  const rates: NBRBRate[] = await response.json()
  const now = new Date().toISOString()
  const today = now.slice(0, 10)

  await db.transaction('rw', db.exchangeRates, async () => {
    for (const [currency, id] of Object.entries(CURRENCY_IDS) as [
      Exclude<Currency, 'BYN'>,
      number,
    ][]) {
      const rate = rates.find((r) => r.Cur_ID === id)
      if (rate) {
        await db.exchangeRates.put({
          currency,
          rate: rate.Cur_OfficialRate / rate.Cur_Scale,
          date: today,
          fetchedAt: now,
        })
      }
    }
  })
}

export async function fetchHistoricalRate(
  currency: Exclude<Currency, 'BYN'>,
  date: string,
): Promise<number | null> {
  const id = CURRENCY_IDS[currency]
  try {
    const response = await fetch(`${NBRB_RATE_URL}/${id}?ondate=${date}`)
    if (!response.ok) return null
    const data: NBRBRate = await response.json()
    return data.Cur_OfficialRate / data.Cur_Scale
  } catch {
    return null
  }
}

/** Returns the BYN rate for the given currency on the given date. Returns undefined for BYN. */
export async function getRateForDate(
  currency: Currency,
  date: string,
): Promise<number | undefined> {
  if (currency === 'BYN') return undefined
  const today = new Date().toISOString().slice(0, 10)
  if (date >= today) {
    return (await db.exchangeRates.get(currency))?.rate
  }
  const rate = await fetchHistoricalRate(currency, date)
  return rate ?? undefined
}

export async function convertToCurrency(
  amount: number,
  from: Currency,
  to: Currency,
): Promise<number> {
  if (from === to) return amount

  const fromRate = from === 'BYN' ? 1 : ((await db.exchangeRates.get(from))?.rate ?? 1)
  const toRate = to === 'BYN' ? 1 : ((await db.exchangeRates.get(to))?.rate ?? 1)

  const inBYN = amount * fromRate
  return inBYN / toRate
}
