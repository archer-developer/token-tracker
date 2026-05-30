export interface ExtractedInstrument {
  name: string | null
  currency: string | null
  couponRate: number | null
  startDate: string | null
  endDate: string | null
  paymentFrequency: string | null
  paymentDayFrom: number | null
  paymentDayTo: number | null
  platform: string | null
  whitepaperUrl: string | null
}

export function buildExtractionPrompt(pdfText: string): string {
  return `You are a financial document parser. Extract bond/token information from the text below.
Return ONLY a valid JSON object with exactly these fields. Use null for any field you cannot determine.

Fields:
- name: string — full name of the bond or token issue
- currency: string — one of "BYN", "USD", "EUR"
- couponRate: number — annual coupon rate as a decimal percentage (e.g. 18.5 for 18.5%)
- startDate: string — circulation start date in ISO format YYYY-MM-DD
- endDate: string — maturity/redemption date in ISO format YYYY-MM-DD
- paymentFrequency: string — one of "monthly", "quarterly", "custom"
- paymentDayFrom: number — first day of month when payments are expected (1-31)
- paymentDayTo: number — last day of month when payments are expected (1-31), same as paymentDayFrom if fixed day
- platform: string — platform name where the token is traded
- whitepaperUrl: string — URL to the official document or prospectus

Document text:
---
${pdfText.slice(0, 12000)}
---

Respond with ONLY the JSON object, no explanation.`
}
