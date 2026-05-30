import { useLiveQuery } from 'dexie-react-hooks'
import { getSettings } from '@/db/db'
import type { Settings } from '@/db/types'

export function useSettings(): Settings | undefined {
  return useLiveQuery(() => getSettings(), [], undefined)
}
