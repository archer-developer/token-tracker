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
├── locales/          # ru/, be/ translation JSONs
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
СПД = principal × (rate / 100) × daysInPeriod / daysInCalYear
```

- `daysInCalYear` = 365, or **366** for leap years (2024, 2028…)
- `daysInPeriod` = actual calendar days in the accrual period (inclusive)
- Rounding: **round half up** to 2 decimal places on the final sum (not per-day)
- Period 1 starts on `instrument.startDate`, not on 1st of the month
- Last period ends on `instrument.endDate`; if `endDate` is mid-month, the payment is in the **same** month (not the next)

**❌ Wrong (old):** `principal × annualRate / 12` — ignores actual day counts and leap years  
**✓ Correct (current):** day-count formula above

**Verified against real GURMINA.USD.2024.01 payments** (see `docs/examples/gurnima-algorithm.md`):
| Payment date | Period | Days | KDG | Principal | Amount |
|---|---|---|---|---|---|
| 15.02.2025 | Jan 2025 | 31 | 365 | 5 058 USD | **47.25** |
| 15.03.2026 | Feb 2026 | 28 | 365 | 10 040 USD | **84.72** |
| 15.04.2026 | Mar 2026 | 31 | 365 | 10 040 USD | **93.80** |
| 15.05.2026 | Apr 2026 | 30 | 365 | 10 040 USD | **90.77** |

### Schedule Regeneration (`src/features/payments/scheduleUtils.ts`)

`regenerateSchedule(instrument)` is called:

- When saving an instrument (InstrumentFormScreen)
- When adding / editing / deleting a purchase lot (PurchaseLotList)

It **preserves** records with `status: 'paid' | 'missed'` (matched by `${periodIndex}:${type}`).
Principal = sum of all purchase lot `totalCost` values.

### XIRR (`src/services/xirr/xirr.ts`)

Newton-Raphson solver for internal rate of return on irregular cash flows.
Used in PortfolioScreen for portfolio-level performance.
Inputs: ledger entries (historical) + future scheduled payments projected to today.

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

Languages: **Russian** (`ru`, default) and **Belarusian** (`be`).
Translation files: `src/locales/{ru,be}/translation.json`.
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
- **PWA** — service worker via vite-plugin-pwa, offline-capable, `@/icon-{192,512}.png` needed for install
- **Backup / restore** — full JSON export/import in Settings; only path to move data between devices

---

## Recent Changes (last session)

**Fixed coupon calculation algorithm** (was using simplified `rate/12`, now uses correct day-count formula per the White Paper):

- `src/features/payments/generateSchedule.ts` — full rewrite
- `src/features/payments/generateSchedule.test.ts` — 17 tests, 4 GURMINA real-payment checks
- `docs/examples/gurnima-algorithm.md` — extracted formula, schedule table, and example calculations from the PDF

**Added Playwright**:

- `playwright.config.ts`, `e2e/gurmina-schedule.spec.ts` — 3 e2e tests verifying UI shows correct amounts
- `npm run test:e2e` script added

**GURMINA.USD.2024.01 token** — the reference instrument in this codebase:

- startDate: 2024-12-30, endDate: 2026-12-14
- Rate: 11% p.a., monthly, payment window 15th–18th of following month
- Current DB has ~502 tokens (10 040 USD); prior to top-up: ~253 tokens (5 058 USD)
