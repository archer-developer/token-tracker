/**
 * Presentation mode storage - uses localStorage to persist the mode independently
 * from database switching. This ensures the flag is never lost or corrupted.
 */

const STORAGE_KEY = 'tokens_tracker_presentation_mode'

export function getPresentationMode(): boolean {
  if (typeof window === 'undefined') {
    return false // SSR safety
  }
  const value = localStorage.getItem(STORAGE_KEY)
  return value === 'true'
}

export function setPresentationMode(enabled: boolean): void {
  if (typeof window === 'undefined') {
    return // SSR safety
  }
  if (enabled) {
    localStorage.setItem(STORAGE_KEY, 'true')
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
}
