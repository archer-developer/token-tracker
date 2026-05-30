import { z } from 'zod'
import { db } from '@/db/db'
import { buildExtractionPrompt, type ExtractedInstrument } from './extractionPrompt'

const extractionSchema = z.object({
  name: z.string().nullable(),
  currency: z.string().nullable(),
  couponRate: z.number().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  paymentFrequency: z.string().nullable(),
  paymentDayFrom: z.number().nullable(),
  paymentDayTo: z.number().nullable(),
  platform: z.string().nullable(),
  whitepaperUrl: z.string().nullable(),
})

async function getLLMConfig() {
  const settings = await db.settings.toCollection().first()
  if (!settings?.llmBaseUrl || !settings.llmApiKey || !settings.llmModel) {
    throw new Error('LLM not configured')
  }
  return { baseUrl: settings.llmBaseUrl, apiKey: settings.llmApiKey, model: settings.llmModel }
}

async function chatComplete(prompt: string): Promise<string> {
  const { baseUrl, apiKey, model } = await getLLMConfig()
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
    }),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`LLM API error ${response.status}: ${text}`)
  }
  const data = await response.json()
  return (data.choices[0]?.message?.content as string) ?? ''
}

export async function extractInstrumentFields(pdfText: string): Promise<ExtractedInstrument> {
  const prompt = buildExtractionPrompt(pdfText)
  const raw = await chatComplete(prompt)
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON found in LLM response')
  const parsed = JSON.parse(jsonMatch[0]) as unknown
  return extractionSchema.parse(parsed)
}

export async function testConnection(): Promise<boolean> {
  try {
    const result = await chatComplete('Reply with the single word: ok')
    return result.toLowerCase().includes('ok')
  } catch {
    return false
  }
}
