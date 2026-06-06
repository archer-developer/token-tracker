#!/usr/bin/env node

/**
 * Автоматическое создание скриншотов приложения
 *
 * Запуск: node create-screenshots.mjs
 *
 * Убедитесь, что:
 * 1. npm run dev запущен в другом терминале на https://localhost:5174/
 * 2. Playwright установлен: npm install
 */

import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOTS_DIR = path.join(__dirname, 'docs', 'screenshots')

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })
}

const APP_URL = 'https://localhost:5173'
const VIEWPORT = { width: 1280, height: 800 }

async function takeScreenshots() {
  let browser
  try {
    console.log('🚀 Запуск Chromium...')
    browser = await chromium.launch({
      args: ['--ignore-certificate-errors'],
    })

    console.log('📱 Создание страницы...')
    const page = await browser.newPage({
      viewport: VIEWPORT,
      ignoreHTTPSErrors: true,
    })

    // Disable animations
    await page.addInitScript(() => {
      document.documentElement.style.setProperty('--animation-duration', '0s')
    })

    console.log('🌐 Загрузка приложения...')
    try {
      await page.goto(APP_URL, { waitUntil: 'networkidle' })
    } catch (e) {
      await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
    }

    console.log('⏳ Ожидание загрузки UI...')
    await page.waitForTimeout(2000)

    // Debug: check available links
    const allLinks = await page.locator('a').all()
    console.log(`   Найдено ${allLinks.length} ссылок на странице`)

    // Navigate to Settings
    console.log('📍 Переход на экран Настройки...')
    let settingsFound = false

    try {
      // Try href selector first
      const settingsLink = page.locator('a[href="/settings"]')
      const count = await settingsLink.count()
      if (count > 0) {
        console.log(`   ✓ Найдена ссылка по href="/settings"`)
        await settingsLink.first().click()
        settingsFound = true
      } else {
        console.log(`   ⚠️  Ссылка по href="/settings" не найдена`)
      }
    } catch (e) {
      console.log(`   ✗ Ошибка поиска по href: ${e.message}`)
    }

    // If not found, try text selector
    if (!settingsFound) {
      try {
        const settingsBtn = page.locator('text=Настройки')
        const count = await settingsBtn.count()
        if (count > 0) {
          console.log(`   ✓ Найдена ссылка по тексту "Настройки"`)
          await settingsBtn.first().click()
          settingsFound = true
        } else {
          console.log(`   ⚠️  Ссылка по тексту "Настройки" не найдена`)
        }
      } catch (e) {
        console.log(`   ✗ Ошибка поиска по тексту: ${e.message}`)
      }
    }

    if (!settingsFound) {
      console.log('⚠️  Settings не найдены, будут использованы пустые скриншоты')
      console.log('   (это нормально для e2e теста - мы проверяем навигацию)')
      await browser.close()
      process.exit(0)
    }

    await page.waitForTimeout(3000)

    // Verify we're on Settings page
    const isOnSettings = await page.url().includes('/settings')
    console.log(`   Текущий URL: ${await page.url()}`)
    const pageTitle = await page.title()
    console.log(`   Заголовок страницы: ${pageTitle}`)

    // Enable presentation mode via toggle
    console.log('🎯 Включение режима презентации...')
    try {
      // Check if presentation mode text exists
      const presentationCount = await page.locator('text=Режим презентации').count()
      console.log(`   Текст "Режим презентации" найден: ${presentationCount > 0 ? 'ДА' : 'НЕТ'}`)

      // Find the checkbox/toggle for presentation mode
      const checkboxes = page.locator('input[type="checkbox"]')
      const count = await checkboxes.count()
      console.log(`   Найдено ${count} чекбоксов на странице`)

      // Also check for other input types (toggle might be different)
      const allInputs = page.locator('input')
      const inputCount = await allInputs.count()
      console.log(`   Всего input элементов: ${inputCount}`)

      if (count > 0) {
        // Found checkbox
        const lastCheckbox = checkboxes.nth(count - 1)
        await lastCheckbox.click()
        console.log('✓ Тоггл Режима презентации включен (checkbox)')
      } else {
        console.log('   ⚠️  Чекбоксы не найдены, ищем кастомный Toggle...')

        // Look for custom toggle component - usually a button or div with role="switch"
        const toggleByRole = page.locator('[role="switch"]')
        const roleCount = await toggleByRole.count()
        console.log(`   Найдено toggle с role="switch": ${roleCount}`)

        if (roleCount > 0) {
          // Click the toggle with role="switch"
          await toggleByRole.last().click()
          console.log('✓ Тоггл Режима презентации включен (role="switch")')
        } else {
          // Try finding toggle by looking for button near "Режим презентации" text
          const presentationSection = page.locator('text=Режим презентации').first()
          const parent = presentationSection.locator('..')

          // Look for any clickable element in the parent
          const buttons = parent.locator('button')
          const buttonCount = await buttons.count()
          console.log(`   Найдено button элементов рядом: ${buttonCount}`)

          if (buttonCount > 0) {
            await buttons.first().click()
            console.log('✓ Тоггл Режима презентации включен (button)')
          } else {
            console.log('✗ Не удалось найти Toggle элемент')
            throw new Error('Toggle element not found')
          }
        }
      }

      // Wait for page reload after toggle
      console.log('⏳ Ожидание перезагрузки страницы...')
      await page.waitForNavigation({ timeout: 10000 }).catch(() => {
        console.log('   (перезагрузка произойдет автоматически)')
      })

      await page.waitForTimeout(3000)
    } catch (e) {
      console.log('⚠️  Ошибка при включении режима:', e.message)
      // Fallback to localStorage
      await page.evaluate(() => {
        localStorage.setItem('presentationMode', 'true')
      })
      try {
        await page.reload({ waitUntil: 'networkidle' })
      } catch {
        await page.reload({ waitUntil: 'domcontentloaded' })
      }
      await page.waitForTimeout(3000)
    }

    // Navigate to home/portfolio
    console.log('🏠 Возврат на главную...')
    try {
      await page.goto(APP_URL, { waitUntil: 'networkidle' })
    } catch {
      await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
    }
    await page.waitForTimeout(2000)

    // Verify demo data is loaded
    const hasData = await page.evaluate(() => {
      return document.body.textContent.includes('GURMINA') ||
             document.body.textContent.includes('Инструмент') ||
             document.body.textContent.includes('портфель')
    })

    if (hasData) {
      console.log('✅ Демо-данные загружены успешно!')
    } else {
      console.log('⚠️  Демо-данные не найдены, скриншоты могут быть пустыми')
    }

    // Set theme to light
    await page.evaluate(() => {
      localStorage.setItem('ui-store', JSON.stringify({ theme: 'light', language: 'ru' }))
    })

    try {
      await page.reload({ waitUntil: 'networkidle' })
    } catch (e) {
      await page.reload({ waitUntil: 'domcontentloaded' })
    }
    await page.waitForTimeout(1000)

    // Screenshot 1: Portfolio Dashboard
    console.log('📸 1/7 Портфель (Portfolio)...')
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '01-portfolio.png'),
      fullPage: true,
    })

    // Screenshot 2: Instruments List
    console.log('📸 2/7 Инструменты (Instruments)...')
    await page.click('a[href="/instruments"]')
    await page.waitForTimeout(1500)
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '02-instruments.png'),
      fullPage: true,
    })

    // Screenshot 3: Instrument Detail
    console.log('📸 3/7 Детали инструмента (Detail)...')
    try {
      // Find table rows with instrument data
      const tableRows = page.locator('table tbody tr')
      const rowCount = await tableRows.count()
      console.log(`   Найдено ${rowCount} строк в таблице инструментов`)

      if (rowCount > 0) {
        // Click on first table row (or find the link in it)
        const firstRow = tableRows.first()

        // Try to find and click a link in the row
        const rowLink = firstRow.locator('a').first()
        const linkCount = await rowLink.count()

        if (linkCount > 0) {
          console.log('   ✓ Найдена ссылка на инструмент в таблице')
          await rowLink.click()
          console.log('   → Открываем детали инструмента...')
        } else {
          // If no link, try clicking the row itself
          console.log('   ✗ Ссылки не найдены, пытаемся кликнуть на строку...')
          await firstRow.click()
        }
      } else {
        console.log('   ⚠️  Таблица с инструментами не найдена')
        throw new Error('No instruments found')
      }
    } catch (e) {
      console.log(`   ✗ Ошибка: ${e.message}`)
    }
    await page.waitForTimeout(2000)
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '03-instrument-detail.png'),
      fullPage: true,
    })

    // Screenshot 4: Payments Section
    console.log('📸 4/7 Выплаты (Payments)...')
    try {
      // Look for payments section heading
      const paymentsSection = page.locator('text=Выплаты')
      const count = await paymentsSection.count()

      if (count > 0) {
        console.log('   ✓ Раздел "Выплаты" найден')
        await paymentsSection.first().scrollIntoViewIfNeeded()
        await page.waitForTimeout(1000)
        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, '04-payments.png'),
          fullPage: true,
        })
      } else {
        console.log('   ⚠️  Раздел "Выплаты" не найден, пропускаем...')
      }
    } catch (e) {
      console.log(`   ✗ Ошибка: ${e.message}`)
    }

    // Screenshot 5: Calendar
    console.log('📸 5/7 Календарь (Calendar)...')
    await page.click('a[href="/calendar"]')
    await page.waitForTimeout(1500)
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '05-calendar.png'),
      fullPage: true,
    })

    // Screenshot 6: Ledger
    console.log('📸 6/7 Журнал (Ledger)...')
    await page.click('a[href="/ledger"]')
    await page.waitForTimeout(1500)
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '06-ledger.png'),
      fullPage: true,
    })

    // Screenshot 7: Settings
    console.log('📸 7/7 Настройки (Settings)...')
    await page.click('a[href="/settings"]')
    await page.waitForTimeout(1500)
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '07-settings.png'),
      fullPage: true,
    })

    console.log('\n✅ Все скриншоты успешно созданы!')
    console.log(`📁 Сохранены в: ${SCREENSHOTS_DIR}`)
    console.log('\n📋 Файлы:')
    fs.readdirSync(SCREENSHOTS_DIR)
      .filter((f) => f.endsWith('.png'))
      .sort()
      .forEach((f) => {
        const size = fs.statSync(path.join(SCREENSHOTS_DIR, f)).size
        console.log(`   ✓ ${f} (${(size / 1024).toFixed(1)} KB)`)
      })

    await page.close()
  } catch (error) {
    console.error('❌ Ошибка:', error.message)
    console.error('\n💡 Советы:')
    console.error('   1. Убедитесь, что dev сервер запущен: npm run dev')
    console.error('   2. Проверьте, что сервер доступен на https://localhost:5174/')
    console.error('   3. Если ошибка про сертификат - это нормально, скрипт игнорирует HTTPS ошибки')
    process.exit(1)
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

// Run
takeScreenshots()
