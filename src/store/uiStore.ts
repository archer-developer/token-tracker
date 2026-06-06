import { create } from 'zustand'
import type { Currency, Language, Theme } from '@/db/types'
import { updateSettings } from '@/db/db'
import {
  getPresentationMode,
  setPresentationMode as setPresentationModeStorage,
} from '@/db/presentationModeStorage'

interface UIState {
  theme: Theme
  language: Language
  baseCurrency: Currency
  hideAmounts: boolean
  showZeroPayments: boolean
  presentationMode: boolean
  enableAutoUpdates: boolean
  sidebarOpen: boolean
  setTheme: (theme: Theme) => void
  setLanguage: (language: Language) => void
  setBaseCurrency: (currency: Currency) => void
  setHideAmounts: (hide: boolean) => void
  setShowZeroPayments: (show: boolean) => void
  setPresentationMode: (mode: boolean) => void
  setEnableAutoUpdates: (enable: boolean) => void
  setSidebarOpen: (open: boolean) => void
}

function getAutoUpdatesEnabled(): boolean {
  try {
    const stored = localStorage.getItem('enableAutoUpdates')
    return stored === null ? true : stored === 'true'
  } catch {
    return true
  }
}

function setAutoUpdatesEnabledStorage(enabled: boolean): void {
  try {
    localStorage.setItem('enableAutoUpdates', String(enabled))
  } catch {
    // Silently fail if localStorage is not available
  }
}

export const useUIStore = create<UIState>((set) => ({
  theme: 'dark',
  language: 'ru',
  baseCurrency: 'BYN',
  hideAmounts: false,
  showZeroPayments: false,
  presentationMode: getPresentationMode(), // Initialize from localStorage
  enableAutoUpdates: getAutoUpdatesEnabled(), // Initialize from localStorage
  sidebarOpen: false,

  setTheme: (theme) => {
    set({ theme })
    applyTheme(theme)
    void updateSettings({ theme })
  },

  setLanguage: (language) => {
    set({ language })
    void updateSettings({ language })
  },

  setBaseCurrency: (baseCurrency) => {
    set({ baseCurrency })
    void updateSettings({ baseCurrency })
  },

  setHideAmounts: (hideAmounts) => {
    set({ hideAmounts })
    void updateSettings({ hideAmounts })
  },

  setShowZeroPayments: (showZeroPayments) => {
    set({ showZeroPayments })
    void updateSettings({ showZeroPayments })
  },

  setPresentationMode: (presentationMode) => {
    set({ presentationMode })
    // Store in localStorage (independent of database)
    setPresentationModeStorage(presentationMode)
  },

  setEnableAutoUpdates: (enableAutoUpdates) => {
    set({ enableAutoUpdates })
    // Store in localStorage (independent of database)
    setAutoUpdatesEnabledStorage(enableAutoUpdates)
  },

  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
}))

export function applyTheme(theme: Theme): void {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const isDark = theme === 'dark' || (theme === 'system' && prefersDark)
  document.documentElement.classList.toggle('dark', isDark)
}
