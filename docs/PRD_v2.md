# Tokens Tracker App — Product Requirements Document (PRD)

## Overview

A local-first personal finance application for tracking tokenized bond investments, coupon payments, defaults, recoveries, and portfolio performance.

The application must not depend on any proprietary backend service after installation. All portfolio data is stored locally on the user's device.

---

# Constraints

## Application Independence

- No proprietary backend dependency
- All user data stored locally
- Fully functional without the author's infrastructure

## Internet Connectivity

Internet access may be used for:

- Exchange rate retrieval
- Opening external links
- Checking for application updates

The application must continue operating offline using cached data.

## Backup & Restore

- Export all data into a single JSON file
- Restore from exported JSON
- Backup file must be portable between devices

---

# Technical Stack

| Concern | Choice |
|----------|----------|
| App Type | PWA |
| Framework | React |
| Styling | Tailwind CSS |
| Storage | IndexedDB |
| Backup Format | JSON |

---

# Domain Glossary

| Term | Description |
|--------|--------|
| Instrument | Bond / token issuer |
| Purchase Lot | Individual purchase transaction |
| Cash Flow Ledger | Source of truth for all cash movements |
| Coupon Payment | Interest payment |
| Redemption | Principal repayment at maturity |
| Recovery | Repayment after default |
| Default | Issuer default event |
| Outstanding Principal | Unrecovered principal amount |
| XIRR | Effective annual return |

---

# Data Model

## Instrument

| Field | Description |
|---------|---------|
| Name | Token/Bond name |
| Whitepaper URL | Documentation |
| Platform | Finstore / Fainex / Bynex |
| Currency | BYN / USD / EUR |
| Coupon Rate | Annual rate |
| Start Date | Circulation start |
| End Date | Maturity date |
| Payment Frequency | Monthly / Quarterly / Custom |
| Payment Day (from) | First day of the expected payment window (e.g. 10) |
| Payment Day (to) | Last day of the expected payment window (e.g. 15); equal to "from" for a fixed day |
| Status | Active / Matured / Defaulted / Sold |

---

## Payment Schedule Generation

Payment schedules are **auto-generated** from the instrument fields — no manual entry of individual dates.

### Inputs
- Start Date
- End Date
- Payment Frequency (Monthly / Quarterly / Custom interval)
- Payment Day from / Payment Day to

### Logic
1. Starting from Start Date, advance by the frequency interval to get each period's month.
2. Within that month, the expected payment window is `[Payment Day from … Payment Day to]`.
3. If Payment Day from == Payment Day to, the payment is expected on that exact day.
4. The last period always coincides with End Date (final coupon + redemption).

### Example
> Frequency: Monthly, Payment Day: 10–15, Start: 2024-01-01, End: 2025-01-01
>
> Generated windows: Feb 10–15, Mar 10–15, … Jan 10–15 2025 (final)

The generated schedule populates the Payment Records table with Status = **Scheduled**.

---

## Purchase Lot

| Field | Description |
|---------|---------|
| Instrument ID | Reference |
| Purchase Date | Purchase date |
| Quantity | Purchased amount |
| Price Per Token | Purchase price |
| Total Cost | Calculated |
| Notes | Optional |

Supports multiple purchases of the same instrument.

---

## Payment Record

| Field | Description |
|---------|---------|
| Instrument ID | Reference |
| Payment Date | Date |
| Payment Type | Coupon / Redemption / Recovery |
| Expected Amount | Planned amount |
| Actual Amount | Received amount |
| Status | Scheduled / Paid / Missed |

---

## Default Information

| Field | Description |
|---------|---------|
| Default Date | Date of default |
| Outstanding Principal | Remaining principal |
| Expected Recovery Rate | 0–100% |
| Expected Recovery Date | Optional |
| Notes | Optional |

---

# Cash Flow Ledger

The Cash Flow Ledger is the single source of truth for all portfolio calculations.

## Ledger Entry Types

- Purchase
- Coupon
- Redemption
- Recovery
- Sale

Example:

| Date | Type | Instrument | Amount |
|--------|--------|--------|--------|
| 2024-01-01 | Purchase | Bond A | -1000 |
| 2024-06-01 | Coupon | Bond A | +50 |
| 2025-01-01 | Coupon | Bond A | +50 |
| 2026-01-01 | Redemption | Bond A | +1000 |

All analytics, profits, losses and XIRR calculations must be derived from the ledger.

---

# Currency Conversion

## Supported Currencies

- BYN
- USD
- EUR

## Base Currency

The user can select:

- BYN
- USD
- EUR

Portfolio-wide metrics are displayed in the selected base currency.

## Exchange Rates

Exchange rates must be retrieved from the National Bank of the Republic of Belarus.

Requirements:

- Download current rates on demand
- Cache rates locally
- Continue working offline using cached rates
- Display timestamp of last update

---

# Features

## 1. Instrument Management

- Create instrument
- Edit instrument
- Delete instrument
- Mark as Matured
- Mark as Defaulted
- Mark as Sold
- View instrument details
- **Parse whitepaper PDF** to auto-fill instrument fields (requires LLM configured in Settings)

## 2. Purchase Lot Management

- Add purchase lot
- Edit purchase lot
- Delete purchase lot

## 3. Cash Flow Management

- Record coupon payments
- Record redemption payments
- Record recovery payments
- Record sales
- Mark expected payments as paid or missed

## 4. Portfolio Overview

Display:

- Total Capital Invested
- Active Principal
- Repaid Principal
- Defaulted Principal
- Current Portfolio Value
- Portfolio XIRR
- Realized Profit/Loss
- Unrealized Profit/Loss

### Risk Metrics

- Number of Active Instruments
- Number of Matured Instruments
- Number of Defaulted Instruments
- Number of Sold Instruments
- Recovered Principal
- Recovery Ratio
- Largest Single Loss

## 5. Payments Calendar

- Upcoming coupon dates
- Upcoming redemption dates
- Expected payment amounts

## 6. Cash Flow Ledger Screen

- Chronological cash flow history
- Filtering
- Search
- Export

## 7. Backup & Restore

- Export JSON
- Import JSON

## 8. Localization

Supported languages:

- Russian
- Belarusian

## 9. Settings

### General
- Base currency selection (BYN / USD / EUR)
- Language selection (Russian / Belarusian)
- Theme selection (Light / Dark / System)

### LLM Integration
- API Base URL (OpenAI-compatible endpoint, e.g. `https://api.openai.com/v1`)
- API Key
- Model name (e.g. `gpt-4o`, `gpt-4.1-mini`)
- The API key is stored locally and never sent anywhere except the configured endpoint.
- Connection test button

---

# LLM Whitepaper Parsing

## Goal

Allow the user to upload a whitepaper PDF when creating an instrument. The app extracts text from the PDF client-side and sends it to the configured LLM to auto-fill all instrument fields.

## Prerequisites

LLM API must be configured in Settings. If not configured, the feature is hidden.

## Flow

1. User opens the Create Instrument form.
2. User uploads a whitepaper PDF.
3. App extracts full text from the PDF using **PDF.js** (client-side, no server required).
4. App sends the extracted text to the LLM with a structured extraction prompt.
5. LLM returns a JSON object with instrument fields.
6. App pre-fills the form with the extracted values.
7. User reviews, corrects if needed, and saves.

## Extracted Fields

The LLM is prompted to extract:

- Name
- Currency
- Coupon Rate (% annual)
- Start Date
- End Date
- Payment Frequency
- Payment Day range
- Platform (if detectable)

## Prompt Strategy

- System prompt instructs the LLM to return only a valid JSON object with a fixed schema.
- If a field cannot be determined, the LLM returns `null` for that field.
- The app validates the JSON before applying it to the form.

## CORS Considerations

Most hosted OpenAI-compatible APIs (OpenAI, OpenRouter, etc.) support browser-to-API calls. Local providers (Ollama) also work. If a provider blocks CORS, the feature will fail gracefully with an explanatory error message.

---

# Portfolio XIRR Calculation

## Goal

Calculate effective annual return based on actual and expected cash flows.

## Included Cash Flows

- Purchases
- Coupon payments
- Redemptions
- Recoveries
- Sales

## Default Handling

When an instrument defaults:

1. Future coupon payments are removed.
2. Principal is not assumed to be repaid in full.
3. Recovery is calculated from Outstanding Principal.
4. Recovery cash flow is added when expected.

## Portfolio Valuation

For active instruments:

- Outstanding Principal (default)
- User-entered Market Value (optional)

The selected value is used as terminal cash flow for XIRR calculations.

## Formula

XIRR is calculated from the complete ledger cash flow history.

## Scenario Analysis

Recovery scenarios:

| Scenario | Recovery |
|----------|----------|
| Worst Case | 0% |
| Conservative | 25% |
| Moderate | 50% |
| Optimistic | 75% |
| Full Recovery | 100% |

The application recalculates portfolio XIRR for each scenario.

---

# Out of Scope (v1)

- Cloud sync
- Multi-user support
- Push notifications
- Proprietary backend
- App Store / Google Play publication
