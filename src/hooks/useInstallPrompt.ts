import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'pwa-install-dismissed'

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isDismissed, setIsDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      console.log('[PWA] beforeinstallprompt event captured')
    }
    window.addEventListener('beforeinstallprompt', handler)

    // Log if Service Worker is registered
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then(() => console.log('[PWA] Service Worker is ready'))
        .catch((err) => console.log('[PWA] Service Worker error:', err))
    } else {
      console.log('[PWA] Service Worker not supported')
    }

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const install = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setDeferredPrompt(null)
    }
  }

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      /* ignore */
    }
    setIsDismissed(true)
  }

  return {
    canInstall: !!deferredPrompt && !isDismissed,
    install,
    dismiss,
  }
}
