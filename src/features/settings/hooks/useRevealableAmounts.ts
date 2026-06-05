import { create } from 'zustand'

const REVEAL_DURATION = 10000

interface AmountsRevealStore {
  isRevealedAll: boolean
  revealAllTimer: ReturnType<typeof setTimeout> | null
  revealAll: () => void
  isRevealed: () => boolean
  reset: () => void
}

export const useAmountsRevealStore = create<AmountsRevealStore>((set, get) => ({
  isRevealedAll: false,
  revealAllTimer: null,

  revealAll: () => {
    const state = get()
    // Clear existing timer if any
    if (state.revealAllTimer) {
      clearTimeout(state.revealAllTimer)
    }

    set({ isRevealedAll: true })

    // Set new timer to hide after REVEAL_DURATION
    const timer = setTimeout(() => {
      set({ isRevealedAll: false, revealAllTimer: null })
    }, REVEAL_DURATION)

    set({ revealAllTimer: timer })
  },

  isRevealed: () => get().isRevealedAll,

  reset: () => {
    const state = get()
    if (state.revealAllTimer) {
      clearTimeout(state.revealAllTimer)
    }
    set({ isRevealedAll: false, revealAllTimer: null })
  },
}))

export function useRevealableAmounts() {
  const { isRevealed, revealAll } = useAmountsRevealStore()
  return { isRevealed, reveal: revealAll }
}
