import { z } from 'zod'
import { db } from './db'

const BACKUP_VERSION = 1

interface BackupData {
  version: number
  exportedAt: string
  data: {
    instruments: unknown[]
    purchaseLots: unknown[]
    paymentRecords: unknown[]
    ledgerEntries: unknown[]
    settings: unknown[]
  }
}

export async function exportBackup(): Promise<string> {
  const [instruments, purchaseLots, paymentRecords, ledgerEntries, settings] = await Promise.all([
    db.instruments.toArray(),
    db.purchaseLots.toArray(),
    db.paymentRecords.toArray(),
    db.ledgerEntries.toArray(),
    db.settings.toArray(),
  ])

  const backup: BackupData = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: { instruments, purchaseLots, paymentRecords, ledgerEntries, settings },
  }
  return JSON.stringify(backup, null, 2)
}

const backupSchema = z.object({
  version: z.number(),
  exportedAt: z.string(),
  data: z.object({
    instruments: z.array(z.unknown()),
    purchaseLots: z.array(z.unknown()),
    paymentRecords: z.array(z.unknown()),
    ledgerEntries: z.array(z.unknown()),
    settings: z.array(z.unknown()),
  }),
})

export async function importBackup(json: string): Promise<void> {
  const parsed = backupSchema.parse(JSON.parse(json))

  await db.transaction(
    'rw',
    [db.instruments, db.purchaseLots, db.paymentRecords, db.ledgerEntries, db.settings],
    async () => {
      await db.instruments.clear()
      await db.purchaseLots.clear()
      await db.paymentRecords.clear()
      await db.ledgerEntries.clear()
      await db.settings.clear()

      if (parsed.data.instruments.length > 0)
        await db.instruments.bulkAdd(parsed.data.instruments as never[])
      if (parsed.data.purchaseLots.length > 0)
        await db.purchaseLots.bulkAdd(parsed.data.purchaseLots as never[])
      if (parsed.data.paymentRecords.length > 0)
        await db.paymentRecords.bulkAdd(parsed.data.paymentRecords as never[])
      if (parsed.data.ledgerEntries.length > 0)
        await db.ledgerEntries.bulkAdd(parsed.data.ledgerEntries as never[])
      if (parsed.data.settings.length > 0)
        await db.settings.bulkAdd(parsed.data.settings as never[])
    },
  )
}

export function downloadJson(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
