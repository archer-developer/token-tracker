import type { Currency } from '@/db/types'
import { db } from '@/db/db'

const NBRB_URL = 'https://api.nbrb.by/exrates/rates?periodicity=0'
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
