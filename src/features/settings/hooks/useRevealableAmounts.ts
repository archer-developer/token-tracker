import { create } from 'zustand'

const REVEAL_DURATION = 10000

interface AmountsRevealStore {
  revealedIds: Set<string>
  timers: Map<string, ReturnType<typeof setTimeout>>
  reveal: (id: string) => void
  isRevealed: (id: string) => boolean
}

export const useAmountsRevealStore = create<AmountsRevealStore>((set, get) => ({
  revealedIds: new Set(),
  timers: new Map(),

  reveal: (id: string) => {
    const state = get()
    const existingTimer = state.timers.get(id)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    set((s) => ({
      revealedIds: new Set([...s.revealedIds, id]),
    }))

    const timer = setTimeout(() => {
      set((s) => {
        const newSet = new Set(s.revealedIds)
        newSet.delete(id)
        return { revealedIds: newSet }
      })
      state.timers.delete(id)
    }, REVEAL_DURATION)

    state.timers.set(id, timer)
  },

  isRevealed: (id: string) => get().revealedIds.has(id),
}))

export function useRevealableAmounts() {
  const { isRevealed, reveal } = useAmountsRevealStore()
  return { isRevealed, reveal }
}
