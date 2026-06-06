export type BrowserType = 'chromium' | 'safari-ios' | 'safari-macos' | 'firefox' | 'other'

export type BrowserWarning = 'no-service-worker' | 'no-modern-css' | 'not-chromium'

export interface BrowserCheckResult {
  /** App cannot function at all — IndexedDB unavailable. */
  critical: boolean
  browserType: BrowserType
  /** Feature gaps that degrade experience but don't block usage. */
  warnings: BrowserWarning[]
  isFullySupported: boolean
}

export function checkBrowser(): BrowserCheckResult {
  const browserType = detectBrowserType()
  const isSafari = browserType === 'safari-ios' || browserType === 'safari-macos'

  const noIndexedDB = typeof indexedDB === 'undefined'
  const noServiceWorker = !('serviceWorker' in navigator)
  const noModernCss = !supportsOklch()
  // Safari handles install via "Add to Home Screen" — not a warning, a separate tip
  const notChromium = !isSafari && browserType !== 'chromium'

  const warnings: BrowserWarning[] = [
    ...(noServiceWorker ? (['no-service-worker'] as const) : []),
    ...(noModernCss ? (['no-modern-css'] as const) : []),
    ...(notChromium ? (['not-chromium'] as const) : []),
  ]

  return {
    critical: noIndexedDB,
    browserType,
    warnings,
    isFullySupported: !noIndexedDB && warnings.length === 0,
  }
}

function detectBrowserType(): BrowserType {
  if (typeof navigator === 'undefined') return 'other'

  const ua = navigator.userAgent
  const isAppleVendor = (navigator.vendor ?? '').startsWith('Apple')

  // Chromium-based: window.chrome exists in normal mode; in headless/automated contexts
  // (e.g. Playwright) it may be absent, so also match Chrome/Edg in the UA.
  // Apple vendor check excludes Safari, which never has Chrome in its UA anyway.
  if (('chrome' in window || /Chrome|Chromium|Edg/.test(ua)) && !isAppleVendor) {
    return 'chromium'
  }

  if (isAppleVendor) {
    // iPad on iOS 13+ reports platform as MacIntel but has touch points
    const isIOS =
      /iPhone|iPod/.test(ua) ||
      /iPad/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    return isIOS ? 'safari-ios' : 'safari-macos'
  }

  if (/Firefox/.test(ua)) return 'firefox'
  return 'other'
}

function supportsOklch(): boolean {
  try {
    // oklch() is used by Tailwind v4 — Chrome 111+, Firefox 113+, Safari 15.4+
    return CSS.supports('color', 'oklch(0.5 0.2 180)')
  } catch {
    return false
  }
}
