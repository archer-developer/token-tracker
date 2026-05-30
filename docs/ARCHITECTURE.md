# Tokens Tracker — Architecture

## Stack Summary

| Concern | Choice | Reason |
|---|---|---|
| Framework | React 18 + Vite | Fast dev server, PWA plugin available |
| Language | TypeScript | Type safety for financial data |
| Styling | Tailwind CSS v3 | Utility-first, no runtime cost |
| Routing | React Router v6 | Standard, file-based mental model |
| State | Zustand | Minimal boilerplate for UI state |
| DB | Dexie.js (IndexedDB) | Best-in-class IndexedDB wrapper, live queries |
| PDF parsing | pdfjs-dist | Client-side, no server needed |
| XIRR | Custom (Newton-Raphson) | No suitable zero-dependency library; ~40 lines |
| Icons | Lucide React | Tree-shakeable, 1000+ icons, consistent stroke style |
| Theme | Tailwind dark mode (`class` strategy) | Zero runtime cost, full control via `dark:` variants |
| i18n | react-i18next | De facto standard |
| PWA | vite-plugin-pwa | Service worker + manifest generation |

---

## Folder Structure

```
src/
├── app/
│   ├── App.tsx               # Router root
│   ├── routes.tsx            # Route definitions
│   └── i18n.ts               # i18next config
│
├── db/
│   ├── db.ts                 # Dexie instance + schema
│   ├── migrations.ts         # Version upgrades
│   └── backup.ts             # Export / import JSON
│
├── features/
│   ├── instruments/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── whitepaperParser.ts   # PDF.js + LLM extraction
│   ├── purchaseLots/
│   ├── payments/
│   ├── ledger/
│   ├── portfolio/
│   ├── calendar/
│   └── settings/
│
├── services/
│   ├── llm/
│   │   ├── LLMService.ts     # OpenAI-compatible adapter
│   │   └── extractionPrompt.ts
│   ├── exchangeRates/
│   │   ├── NBRBClient.ts     # NBRB API client
│   │   └── ratesCache.ts     # IndexedDB cache layer
│   └── xirr/
│       └── xirr.ts           # XIRR implementation
│
├── store/
│   └── uiStore.ts            # Zustand: base currency, language, active tab
│
└── shared/
    ├── components/           # Button, Modal, Table, etc.
    ├── hooks/                # useLiveQuery wrappers
    └── utils/                # formatCurrency, formatDate, etc.
```

---

## Database Schema (Dexie)

```ts
// db/db.ts

class TokensTrackerDB extends Dexie {
  instruments!: Table<Instrument>
  purchaseLots!: Table<PurchaseLot>
  paymentRecords!: Table<PaymentRecord>
  ledgerEntries!: Table<LedgerEntry>
  settings!: Table<Settings>
  exchangeRates!: Table<ExchangeRate>
}

db.version(1).stores({
  instruments:    '++id, status, platform, currency',
  purchaseLots:   '++id, instrumentId, purchaseDate',
  paymentRecords: '++id, instrumentId, paymentDate, status, type',
  ledgerEntries:  '++id, instrumentId, date, type',
  settings:       '++id',          // single-row table
  exchangeRates:  'currency, date', // compound PK
})
```

### Key Relations

```
Instrument 1──* PurchaseLot
Instrument 1──* PaymentRecord
Instrument 1──* LedgerEntry
```

LedgerEntries are the single source of truth for all calculations. PaymentRecords drive the calendar view and the "mark as paid / missed" workflow.

### Data Types

```ts
type InstrumentStatus = 'active' | 'matured' | 'defaulted' | 'sold'
type PaymentFrequency = 'monthly' | 'quarterly' | 'custom'
type PaymentStatus    = 'scheduled' | 'paid' | 'missed'
type PaymentType      = 'coupon' | 'redemption' | 'recovery'
type LedgerEntryType  = 'purchase' | 'coupon' | 'redemption' | 'recovery' | 'sale'
type Currency         = 'BYN' | 'USD' | 'EUR'
```

---

## Routing Structure

```
/                         → Portfolio Overview
/instruments              → Instrument list
/instruments/new          → Create instrument (+ PDF upload)
/instruments/:id          → Instrument detail + purchase lots
/instruments/:id/edit     → Edit instrument
/calendar                 → Payments calendar
/ledger                   → Cash flow ledger
/settings                 → Settings (general + LLM)
```

Navigation: bottom tab bar on mobile, left sidebar on desktop (responsive via Tailwind breakpoints).

See **Responsive Design** section for breakpoints and layout rules.

---

## State Management

Two layers — no mixing:

| Layer | Tool | What lives here |
|---|---|---|
| Persistent data | Dexie (IndexedDB) | All domain data |
| UI state | Zustand | Base currency, language, theme, sidebar open/closed |

All data access goes through `useLiveQuery` hooks (Dexie's reactive wrapper). Components never call `db.*` directly — always through a hook in `features/*/hooks/`.

```ts
// Example: features/instruments/hooks/useInstruments.ts
export function useInstruments() {
  return useLiveQuery(() => db.instruments.orderBy('name').toArray(), [])
}
```

---

## Theme

### Strategy

Tailwind `darkMode: 'class'` — the `dark` class on `<html>` activates all `dark:` variants. Zero runtime cost, no CSS-in-JS overhead.

### Options

Three choices available in Settings:

| Option | Behaviour |
|---|---|
| Light | Always light — `dark` class removed from `<html>` |
| Dark | Always dark — `dark` class added to `<html>` |
| System | Follows OS preference via `prefers-color-scheme` media query |

Default: **Dark**.

### Implementation

```ts
// store/uiStore.ts
type Theme = 'light' | 'dark' | 'system'

// On theme change:
function applyTheme(theme: Theme) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const isDark = theme === 'dark' || (theme === 'system' && prefersDark)
  document.documentElement.classList.toggle('dark', isDark)
}
```

- Preference is persisted in the `settings` IndexedDB table.
- `applyTheme()` is called once on app load (before first render) to prevent flash of wrong theme.
- When theme is `system`, a `matchMedia` listener updates the class if the OS preference changes while the app is open.

### Component Conventions

All components must declare both light and dark variants:

```tsx
// ✓ correct
<div className="bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">

// ✗ wrong — no dark variant
<div className="bg-white text-gray-900">
```

Financial positive values: `text-green-600 dark:text-green-400`
Financial negative values: `text-red-600 dark:text-red-400`

---

## Payment Schedule Generation

When an instrument is created or edited, the app auto-generates PaymentRecords:

```
generateSchedule(instrument) →
  for each period (start → end, step = frequency):
    create PaymentRecord {
      type: 'coupon',
      paymentDate: <period month> + paymentDayFrom,   // window start
      paymentDateTo: <period month> + paymentDayTo,   // window end (null if same day)
      expectedAmount: principal × (couponRate / periodsPerYear),
      status: 'scheduled'
    }
  create final PaymentRecord { type: 'redemption', date: endDate }
```

Schedule is regenerated on any change to dates, frequency, or payment day fields. Paid/missed records are preserved by matching on `(instrumentId, type, period index)`.

---

## XIRR Implementation

```ts
// services/xirr/xirr.ts

// Newton-Raphson iteration on NPV(rate) = 0
export function xirr(cashFlows: { date: Date; amount: number }[]): number
```

- Input: array of `{ date, amount }` — negative for outflows, positive for inflows
- Returns: annualized rate (e.g. `0.12` = 12%)
- Future scheduled payments use `expectedAmount`; paid ones use `actualAmount`
- For defaulted instruments: future coupons are excluded, recovery is added as a future inflow at `expectedRecoveryDate`
- Portfolio XIRR aggregates all ledger entries across all instruments

---

## LLM Service

Thin adapter — UI code never knows which provider is used.

```ts
// services/llm/LLMService.ts

interface LLMConfig {
  baseUrl: string   // e.g. https://api.openai.com/v1
  apiKey: string
  model: string
}

class LLMService {
  async extractInstrumentFields(pdfText: string): Promise<Partial<Instrument>>
  async testConnection(): Promise<boolean>
}
```

The extraction prompt (in `extractionPrompt.ts`) instructs the model to return a strict JSON object. Any field not found in the PDF is returned as `null`. The app validates the JSON with Zod before applying it to the form.

Config is loaded from `settings` table at call time — no singleton with stale config.

---

## Whitepaper Parsing Flow

```
User uploads PDF
  → PDF.js extracts text (Web Worker, non-blocking)
  → LLMService.extractInstrumentFields(text)
  → Zod validates response JSON
  → Form fields pre-filled (nulls stay empty)
  → User reviews + saves
```

PDF.js is loaded lazily (`import('pdfjs-dist')`) — not bundled in the main chunk.

---

## Exchange Rates

```
NBRBClient.fetchRates()
  → GET https://api.nbrb.by/exrates/rates?periodicity=0
  → Store in exchangeRates table with date stamp
  → UI reads from table (always offline-capable)
  → Settings screen shows "Last updated: <timestamp>"
```

Rates are fetched on demand (manual refresh button) and on app start if cached data is older than 24 hours.

---

## Backup & Restore

```ts
// db/backup.ts

export async function exportBackup(): Promise<string>   // → JSON string
export async function importBackup(json: string): Promise<void>
```

Export serializes all tables to a single JSON object. Import validates the schema with Zod, then replaces all table data in a single Dexie transaction. The backup file is versioned (`{ version: 1, exportedAt: "...", data: { ... } }`) for future migration compatibility.

---

## PWA Configuration

- Service worker via `vite-plugin-pwa` (Workbox)
- Cache strategy: NetworkFirst for NBRB API, CacheFirst for app shell
- Manifest: standalone display, icons for iOS + Android
- No push notifications (out of scope v1)

---

## Code Quality

### Tools

| Tool | Purpose |
|---|---|
| ESLint | Static analysis and rule enforcement |
| Prettier | Code formatting |
| Husky | Git hooks runner |
| lint-staged | Run checks only on staged files |

### ESLint Plugins

| Plugin | Purpose |
|---|---|
| `@typescript-eslint` | Type-aware linting rules |
| `eslint-plugin-react-hooks` | Enforce hooks rules (exhaustive-deps, etc.) |
| `eslint-plugin-react-refresh` | Vite HMR compatibility |
| `eslint-plugin-import` | Import ordering and no-unused-imports |
| `eslint-plugin-tailwindcss` | Tailwind class validation and ordering |

### Prettier Plugins

| Plugin | Purpose |
|---|---|
| `prettier-plugin-tailwindcss` | Auto-sorts Tailwind classes (canonical order) |

### Pre-commit Hook (Husky)

Two hooks run on every commit:

1. **lint-staged** — runs against staged files only:
```
*.{ts,tsx}        → eslint --fix → prettier --write
*.{js,json,md,css} → prettier --write
```

2. **vitest run** — runs the full test suite. Commit is blocked if any test fails.

This keeps the main branch always green without a separate CI pipeline.

---

## Testing

### Stack

| Tool | Purpose |
|---|---|
| Vitest | Test runner — same config as Vite, Jest-compatible API |
| React Testing Library | Component and integration tests |
| `@testing-library/user-event` | Realistic user interaction simulation |
| `@testing-library/jest-dom` | Additional DOM matchers (`toBeInTheDocument`, etc.) |
| jsdom | Browser environment for Vitest |
| `fake-indexeddb` | In-memory IndexedDB — Dexie works without a real browser |

### Watch Mode

During development, Vitest runs in watch mode and re-runs only affected tests on every file change:

```
vitest --watch
```

This is the default `npm test` script. Run `npm run test:run` for a single full-suite pass.

### Test Types

#### Unit tests — pure functions

Cover all logic that has no side effects:

| Module | What to test |
|---|---|
| `services/xirr/xirr.ts` | Known cash flow sequences with verified IRR results |
| `features/payments/generateSchedule.ts` | Correct dates, counts, amounts for monthly / quarterly / custom |
| `services/exchangeRates/convert.ts` | Currency conversion math, missing rate handling |
| `db/backup.ts` | Serialization round-trip (export → import → same data) |
| `services/llm/extractionPrompt.ts` | Prompt output shape, null handling for missing fields |

#### Integration tests — data layer

Use `fake-indexeddb` to run Dexie hooks against a real IndexedDB API in memory:

```ts
// Example
import 'fake-indexeddb/auto'
import { renderHook } from '@testing-library/react'
import { useInstruments } from '@/features/instruments/hooks/useInstruments'
```

Cover: CRUD operations, schedule regeneration on instrument edit, ledger entry creation on payment mark.

#### Component tests — UI

Use React Testing Library to render components and assert on visible output and user interactions:

| Feature | Key scenarios |
|---|---|
| Instrument form | Field validation, PDF parse button visibility when LLM not configured |
| Payment record | Mark as paid, mark as missed, amounts update |
| Portfolio overview | Metrics render correctly for empty state and populated state |
| Settings | Theme toggle applies `dark` class to `<html>`, LLM test connection feedback |
| Backup | Export triggers download, import parses and confirms |
| Calendar | Correct months highlighted, correct amounts shown |

### File Conventions

Tests live next to the code they test:

```
src/
├── services/xirr/
│   ├── xirr.ts
│   └── xirr.test.ts
├── features/instruments/
│   ├── components/
│   │   ├── InstrumentForm.tsx
│   │   └── InstrumentForm.test.tsx
│   └── hooks/
│       ├── useInstruments.ts
│       └── useInstruments.test.ts
```

### Coverage

Vitest collects coverage via v8. Aim for:

- **Services / utils**: 90%+
- **Hooks**: 80%+
- **Components**: 70%+

Run `npm run test:coverage` to generate the report.

### TypeScript Config

`tsconfig.json` uses `strict: true`, which enables:

- `strictNullChecks` — prevents null/undefined bugs in financial calculations
- `noUncheckedIndexedAccess` — array access returns `T | undefined`
- `noImplicitAny` — all types must be explicit

---

## Responsive Design

### Approach

**Mobile-first.** All base styles target mobile. Larger breakpoints add complexity via Tailwind modifiers (`md:`, `lg:`). Never write desktop-first styles and override downward.

### Breakpoints (Tailwind defaults)

| Name | Min width | Target device |
|---|---|---|
| _(base)_ | 0px | Phone (360px–480px) |
| `sm` | 640px | Large phone / small tablet |
| `md` | 768px | Tablet (portrait) |
| `lg` | 1024px | Tablet (landscape) / small desktop |
| `xl` | 1280px | Desktop |

### Layout by Breakpoint

| Area | Mobile (base) | Tablet (`md`) | Desktop (`lg`) |
|---|---|---|---|
| Navigation | Bottom tab bar (5 tabs, fixed) | Bottom tab bar | Left sidebar (collapsible, 240px) |
| Content | Full width, single column | Full width, single column | Fluid, max-width 1280px, centered |
| Forms | Full-screen modal / page | Centered modal (max 600px) | Centered modal (max 600px) |
| Tables | Card list (stacked rows) | Table with horizontal scroll | Full table |
| Portfolio metrics | 2-column stat grid | 3-column stat grid | 4-column stat grid |
| Calendar | Month grid, compact cells | Month grid, normal cells | Month grid, wide cells + amounts |

### Navigation Tabs (all breakpoints)

Five primary destinations — always visible:

1. Portfolio
2. Instruments
3. Calendar
4. Ledger
5. Settings

On mobile the tab bar is fixed to the bottom (safe-area-inset aware for iOS). On desktop it becomes a left sidebar with labels always visible.

### Touch & Interaction

- Tap targets minimum **44×44px** on all interactive elements
- Swipe-to-dismiss on modals (mobile)
- No hover-only affordances — every interaction must work on touch
- Forms use appropriate `inputmode` attributes (`numeric`, `decimal`, `url`) to trigger the right mobile keyboard

### Icons

**Library: Lucide React** — tree-shakeable (only imported icons end up in the bundle), uniform 24px stroke-based style, works at all sizes.

#### Usage Rules

- Every interactive control (button, action, nav item) must have an icon.
- Icon + label on desktop; icon-only on mobile where space is tight, with a `title` / `aria-label` for accessibility.
- Never use icon-only for destructive actions — always pair with a visible label to prevent misclicks.
- Size scale:

| Context | Size | Tailwind class |
|---|---|---|
| Navigation tabs | 24px | `size-6` |
| Buttons (default) | 20px | `size-5` |
| Buttons (small) | 16px | `size-4` |
| Empty state illustrations | 48px | `size-12` |
| Status badges | 14px | `size-3.5` |

#### Icon Map (key controls)

| Action / Concept | Lucide Icon |
|---|---|
| Add / Create | `Plus` |
| Edit | `Pencil` |
| Delete | `Trash2` |
| Save | `Save` |
| Back | `ArrowLeft` |
| Settings | `Settings` |
| Portfolio | `LayoutDashboard` |
| Instruments | `Landmark` |
| Calendar | `CalendarDays` |
| Ledger | `ScrollText` |
| Backup export | `Download` |
| Backup import | `Upload` |
| Paid / confirmed | `CircleCheck` |
| Missed payment | `CircleX` |
| Defaulted | `TriangleAlert` |
| Matured | `BadgeCheck` |
| Sold | `TrendingUp` |
| Parse PDF | `ScanText` |
| LLM / AI | `Sparkles` |
| Currency / money | `Coins` |
| Refresh rates | `RefreshCw` |
| Coupon payment | `Banknote` |
| Redemption | `CircleDollarSign` |
| Recovery | `ShieldCheck` |

---

### Typography Scale (mobile-first)

- Base font size: `16px` (prevents iOS auto-zoom on inputs)
- Financial values: `font-variant-numeric: tabular-nums` (numbers align in tables)

---

## Key Constraints & Decisions

| Decision | Rationale |
|---|---|
| Dexie over raw IndexedDB | Live queries make React integration trivial |
| Zustand over Redux/Context | Minimal boilerplate; only UI state, not domain data |
| Custom XIRR over library | Most npm XIRR packages have no TypeScript support or incorrect date handling |
| PDF.js lazy-loaded | ~2MB bundle — must not block initial load |
| Zod for LLM output validation | LLM responses are untrusted external input |
| No React Query | Dexie's `useLiveQuery` covers all reactive data needs; adding RQ would duplicate the caching layer |