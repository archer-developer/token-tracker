import { useState } from 'react'
import { AlertTriangle, XCircle, Globe, X, Share, PlusSquare } from 'lucide-react'
import type { BrowserCheckResult, BrowserWarning as BWarning } from '@/shared/utils/browserCheck'

const WARNING_LABELS: Record<BWarning, { title: string; detail: string }> = {
  'no-service-worker': {
    title: 'Нет поддержки Service Worker',
    detail: 'Офлайн-режим и установка как приложения недоступны.',
  },
  'no-modern-css': {
    title: 'Устаревший движок CSS',
    detail: 'Интерфейс может отображаться некорректно.',
  },
  'not-chromium': {
    title: 'Не Chrome / Edge',
    detail: 'Установка как приложения (PWA) и полная поддержка гарантированы только в Chrome.',
  },
}

const DISMISSED_KEY = 'browser-warning-dismissed'
const SAFARI_TIP_KEY = 'safari-install-tip-dismissed'

function isRunningStandalone(): boolean {
  return (
    // iOS standalone
    (navigator as { standalone?: boolean }).standalone === true ||
    // Any installed PWA
    window.matchMedia('(display-mode: standalone)').matches
  )
}

interface Props {
  result: BrowserCheckResult
}

export function BrowserWarning({ result }: Props) {
  const isSafari = result.browserType === 'safari-ios' || result.browserType === 'safari-macos'

  const [warningDismissed, setWarningDismissed] = useState(
    () => !result.critical && localStorage.getItem(DISMISSED_KEY) === '1',
  )
  const [safariTipDismissed, setSafariTipDismissed] = useState(
    () => isRunningStandalone() || localStorage.getItem(SAFARI_TIP_KEY) === '1',
  )

  // Safari without critical issues → show install tip
  if (isSafari && !result.critical) {
    if (safariTipDismissed) return null
    return (
      <SafariInstallTip
        isIOS={result.browserType === 'safari-ios'}
        onDismiss={() => {
          localStorage.setItem(SAFARI_TIP_KEY, '1')
          setSafariTipDismissed(true)
        }}
      />
    )
  }

  // No issues or already dismissed
  if (!result.critical && result.warnings.length === 0) return null
  if (warningDismissed) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          {result.critical ? (
            <XCircle className="size-12 text-red-500" />
          ) : (
            <AlertTriangle className="size-12 text-amber-500" />
          )}
          <h1 className="text-xl font-bold text-gray-900">
            {result.critical ? 'Браузер не поддерживается' : 'Ограниченная поддержка браузера'}
          </h1>
          <p className="text-sm text-gray-500">
            {result.critical
              ? 'Это приложение не может работать в вашем браузере.'
              : 'Некоторые функции могут быть недоступны или работать некорректно.'}
          </p>
        </div>

        <ul className="mb-6 flex flex-col gap-3">
          {result.critical && (
            <li className="flex items-start gap-3 rounded-lg bg-red-50 p-3">
              <XCircle className="mt-0.5 size-4 shrink-0 text-red-500" />
              <div>
                <p className="text-sm font-medium text-red-800">Нет поддержки IndexedDB</p>
                <p className="text-xs text-red-600">
                  Хранение данных недоступно — приложение не запустится.
                </p>
              </div>
            </li>
          )}
          {result.warnings.map((w) => (
            <li key={w} className="flex items-start gap-3 rounded-lg bg-amber-50 p-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
              <div>
                <p className="text-sm font-medium text-amber-800">{WARNING_LABELS[w].title}</p>
                <p className="text-xs text-amber-600">{WARNING_LABELS[w].detail}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-3">
          <a
            href="https://www.google.com/chrome/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Globe className="size-4" />
            Установить Google Chrome
          </a>
          {!result.critical && (
            <button
              onClick={() => {
                localStorage.setItem(DISMISSED_KEY, '1')
                setWarningDismissed(true)
              }}
              className="rounded-xl px-4 py-3 text-sm font-medium text-gray-500 hover:bg-gray-100"
            >
              Всё равно продолжить
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function SafariInstallTip({ isIOS, onDismiss }: { isIOS: boolean; onDismiss: () => void }) {
  return (
    <div className="fixed right-4 bottom-20 left-4 z-50 rounded-xl border border-blue-200 bg-white px-4 py-3 shadow-lg sm:right-auto sm:bottom-6 sm:left-6 sm:max-w-sm dark:border-blue-800 dark:bg-gray-900">
      <div className="mb-3 flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Установить приложение
        </p>
        <button
          onClick={onDismiss}
          className="-mt-0.5 -mr-1 shrink-0 rounded-lg p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          aria-label="Закрыть"
        >
          <X className="size-4" />
        </button>
      </div>

      {isIOS ? (
        <ol className="flex flex-col gap-2">
          <li className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-900 dark:text-blue-300">
              1
            </span>
            Нажмите
            <Share className="inline size-4 shrink-0 text-blue-500" />в нижней панели Safari
          </li>
          <li className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-900 dark:text-blue-300">
              2
            </span>
            Выберите
            <PlusSquare className="inline size-4 shrink-0 text-blue-500" />
            <span className="font-medium">«На экран "Домой"»</span>
          </li>
        </ol>
      ) : (
        <ol className="flex flex-col gap-2">
          <li className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-900 dark:text-blue-300">
              1
            </span>
            Откройте меню
            <Share className="inline size-4 shrink-0 text-blue-500" />
            <span className="font-medium">«Поделиться»</span>
          </li>
          <li className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-900 dark:text-blue-300">
              2
            </span>
            Нажмите
            <span className="font-medium">«Добавить на панель Dock»</span>
          </li>
          <li className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            Требуется macOS Sonoma и Safari 17+
          </li>
        </ol>
      )}
    </div>
  )
}
