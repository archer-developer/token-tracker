# Tokens Tracker — CLAUDE.md

Personal investment tracker for tokenised bonds (Fainex/Finstore platform).
Client-side only — all data lives in the browser's IndexedDB via Dexie.

---

## Commands

```bash
npm run dev          # Vite dev server → http://localhost:5173
npm run test:run     # Vitest (unit) — runs once, no watch
npm run test         # Vitest in watch mode
npm run test:e2e     # Playwright e2e (needs dev server running or starts it via webServer config)
npm run build        # tsc -b && vite build
npm run lint         # eslint src/
npm run format       # prettier --write src/
```

Pre-commit hook: `lint-staged` (eslint + prettier on staged files) → `npm run test:run`.  
**Commits are blocked if tests fail.**

---

## Tech Stack

| Layer             | Library                 | Version         |
| ----------------- | ----------------------- | --------------- |
| UI                | React                   | 19              |
| Routing           | react-router-dom        | 7               |
| Database          | Dexie (IndexedDB)       | 4.4             |
| Live queries      | dexie-react-hooks       | 4.4             |
| UI state          | Zustand                 | 5               |
| Styling           | Tailwind CSS v4         | 4.3             |
| i18n              | react-i18next           | 17              |
| Icons             | lucide-react            | latest          |
| PDF parsing       | pdfjs-dist              | 6 (lazy-loaded) |
| Schema validation | Zod                     | 4               |
| Build             | Vite                    | 8               |
| Types             | TypeScript              | 6 (strict)      |
| Unit tests        | Vitest + fake-indexeddb | 4               |
| E2E tests         | Playwright              | latest          |

---

## Project Structure

```
src/
├── app/              # App shell: routes, i18n config
├── db/               # Dexie instance, types, backup/restore
├── features/
│   ├── calendar/     # Monthly payment calendar
│   ├── instruments/  # CRUD + detail + PDF parsing
│   ├── ledger/       # Cash flow history (read-only view)
│   ├── payments/     # Schedule generation + PaymentList UI
│   ├── portfolio/    # Aggregate metrics + XIRR
│   ├── purchaseLots/ # Purchase lot CRUD (triggers schedule regen)
│   └── settings/     # Theme, lang, currency, LLM, backup
├── locales/          # ru/, by/ translation JSONs
├── services/
│   ├── exchangeRates/ # NBRB API client + cache
│   ├── llm/           # LLM extraction service + prompt
│   └── xirr/          # Newton-Raphson XIRR implementation
├── shared/
│   ├── components/    # Badge, Button, Input, Modal, Select, Spinner…
│   └── utils/format.ts  # formatCurrency, formatDate, formatDateRange
├── store/uiStore.ts  # Zustand: theme, language, baseCurrency, sidebarOpen
└── test/setup.ts     # @testing-library/jest-dom + fake-indexeddb/auto
e2e/                  # Playwright tests
docs/                 # Architecture, PRD, glossary, examples
```

Path alias: `@/` → `src/`

---

## Database Schema (Dexie v2)

```typescript
instruments: '++id, name, status, platform, currency'
purchaseLots: '++id, instrumentId, purchaseDate'
paymentRecords: '++id, instrumentId, periodIndex, status, type, paymentDateFrom'
ledgerEntries: '++id, instrumentId, date, type'
exchangeRates: 'currency'
settings: '++id' // single-row, accessed via getSettings()
```

Key types → `src/db/types.ts`:

- `Instrument` — bond/token definition (rate, dates, payment frequency, etc.)
- `PurchaseLot` — individual purchase (quantity × pricePerToken → totalCost)
- `PaymentRecord` — one expected payment (coupon or redemption), can be marked paid/missed
- `LedgerEntry` — immutable cash flow entry (created on purchase/payment actions)
- `Settings` — user preferences

---

## Core Business Logic

### Payment Schedule Generation (`src/features/payments/generateSchedule.ts`)

**The White Paper formula (GURMINA.USD.2024.01, section 4.9):**

```
СПД = Σ (СТВi × rate/100 × 1/KDG)   for each day i in the period
```

Where СТВi is the amount invested on day i (changes when new lots are purchased).
If the lot balance changes mid-period (a lot purchased on day k), the period is split:

```
СПД = Σ_k [ principal_k × (rate/100) × days_k / KDG ]
```

- `KDG` = 365, or **366** for leap years (2024, 2028…)
- `days_k` = actual calendar days in each sub-period (inclusive)
- Rounding: **round half up** to 2 decimal places on the final sum (not per-day)
- Period 1 starts on `instrument.startDate`, not on 1st of the month
- Last period ends on `instrument.endDate`; if `endDate` is mid-month, the payment is in the **same** month (not the next)
- Days within a period before the first lot purchase have principal = 0 → income = 0 for those days
- Lots purchased **after** the accrual period end do not contribute — income accrues only while the lot is held

**Verified against real GURMINA.USD.2024.01 payments** (see `docs/examples/gurnima-algorithm.md`):
| Payment date | Period | Days | KDG | Principal | Amount |
|---|---|---|---|---|---|
| 15.02.2025 | Jan 2025 | 31 | 365 | weighted ≈ 5 058 USD/day | **47.25** |
| 15.03.2026 | Feb 2026 | 28 | 365 | 10 040 USD | **84.72** |
| 15.04.2026 | Mar 2026 | 31 | 365 | 10 040 USD | **93.80** |
| 15.05.2026 | Apr 2026 | 30 | 365 | 10 040 USD | **90.77** |

January 47.25 = 5 680×0.11×17/365 + 10 040×0.11×6/365 (Lot 1 from Jan 9, Lot 2 from Jan 26).

### Schedule Regeneration (`src/features/payments/scheduleUtils.ts`)

`regenerateSchedule(instrument)` is called:

- When saving an instrument (InstrumentFormScreen)
- When adding / editing / deleting a purchase lot (PurchaseLotList)

It **preserves** records with `status: 'paid' | 'missed'` (matched by `${periodIndex}:${type}`).
Passes the full `PurchaseLot[]` list to `generateSchedule`; per-period principal is derived from lot purchase dates.

### XIRR (`src/services/xirr/xirr.ts`)

Newton-Raphson solver for internal rate of return on irregular cash flows. Tries multiple starting points (0.1, 0.0, 0.5, −0.1, 2.0) and clamps rate to `max(-0.9999, next)` to prevent NaN from `Math.pow(negative_base, fractional_exponent)`.

Used in `usePortfolioMetrics` for:

- **Portfolio XIRR**: ledger entries (signed correctly — purchases negative, income positive) + all remaining scheduled payments for active instruments (including overdue ones).
- **Scenario XIRR**: same flows + hypothetical recovery amounts for defaulted instruments at 0/25/50/75/100% of outstanding principal.

### Cash Flow Timeline (`src/features/portfolio/hooks/useCashFlowTimeline.ts`)

Builds monthly cumulative P&L data for the portfolio chart. P&L model:

- **Income**: coupon and recovery ledger entries
- **Losses**: `−defaultOutstandingPrincipal` at `defaultDate`
- **Projected income**: scheduled coupons (not redemptions) for active instruments; expected recoveries for defaulted instruments
- Purchases and redemptions are **excluded** (principal movements, not P&L)

Returns `TimelinePoint[]` with `historical` (up to and including today) and `projected` (after today) series. Today's month has both set to connect the two lines.

### Currency Conversion (`src/services/exchangeRates/`)

Exchange rates fetched from NBRB API (`api.nbrb.by`). Cached in IndexedDB `exchangeRates` table.
PWA runtime cache: NetworkFirst strategy for the NBRB domain.
Base currency stored in Settings, UI state in Zustand (`useUIStore().baseCurrency`).

---

## Routing (React Router v7, lazy-loaded)

```
/                   → PortfolioScreen
/instruments        → InstrumentListScreen
/instruments/new    → InstrumentFormScreen
/instruments/:id    → InstrumentDetailScreen
/instruments/:id/edit → InstrumentFormScreen
/calendar           → CalendarScreen
/ledger             → LedgerScreen
/settings           → SettingsScreen
```

---

## Localisation

Languages: **Russian** (`ru`, default) and **Belarusian** (`by`).
Translation files: `src/locales/{ru,by}/translation.json`.
Currency formatting uses `ru-BY` locale via `Intl.NumberFormat`.

---

## UI Conventions

- Dark/light/system theme — class `dark` on `<html>`, toggled via `uiStore.applyTheme()`
- Tailwind v4 (no config file — configured via CSS `@import`)
- Responsive: sidebar on desktop (≥768 px), bottom tab bar on mobile
- All monetary amounts go through `formatCurrency(amount, currency)` — never raw numbers
- Dates go through `formatDate(iso)` or `formatDateRange(from, to)` — never raw ISO strings
- Status badges: green=active/paid, blue=matured/coupon-type, red=defaulted/missed, yellow=scheduled

---

## Testing

### Unit tests (Vitest)

- `fake-indexeddb/auto` imported in `src/test/setup.ts` — Dexie works without a real browser
- Coverage targets: 70% lines/functions/branches (enforced in CI)
- Key test file: `src/features/payments/generateSchedule.test.ts` — 17 tests covering the payment algorithm including 4 real-world GURMINA payments

### E2E tests (Playwright)

- Config: `playwright.config.ts` — chromium only, reuses dev server if running
- Tests in `e2e/`
- Seed strategy: `page.evaluate()` opens IndexedDB directly and puts records; call after `page.goto('/')` (app must have opened DB first to establish its current schema version)
- Payment schedule records must be seeded manually in e2e tests because `regenerateSchedule` only runs through the app's UI actions (InstrumentFormScreen save / PurchaseLotList save)

---

## LLM Whitepaper Parsing

Configured in Settings (base URL + API key + model). Any OpenAI-compatible API works.
Workflow: upload PDF → pdfjs-dist extracts text → prompt in `extractionPrompt.ts` → LLM response validated with Zod → pre-fills InstrumentFormScreen fields.
Feature disabled if LLM settings are incomplete.

---

## Key Constraints

- **No backend** — everything runs in the browser, no authentication
- **No external state management for domain data** — Dexie live queries (`useLiveQuery`) are the reactive layer
- **Zustand only for UI state** (theme, sidebar open, base currency selection) — not for domain entities
- **No ORM-style relations** — foreign keys by convention (`instrumentId`), joined manually in hooks
- **PWA** — service worker via vite-plugin-pwa, offline-capable. Icons at `public/icon-192.png` and `public/icon-512.png` (generated from `favicon.svg`). Install prompt via `useInstallPrompt` hook + `InstallBanner` component; uses `beforeinstallprompt` event (Chrome/Edge only). Dev HTTPS via `@vitejs/plugin-basic-ssl`; PWA service worker enabled in dev via `devOptions: { enabled: true }`.
- **Backup / restore** — full JSON export/import in Settings; only path to move data between devices
