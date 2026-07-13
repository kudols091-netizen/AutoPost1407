import { getDb } from '../connection'
import type { SystemLogsTable } from '../schema'

export interface NewSystemLog {
  level: SystemLogsTable['level']
  category: string
  message: string
  detail?: string | null
}

/** Fire-and-forget event log for the "Nhật ký hệ thống" screen — never throws. */
export async function addSystemLog(entry: NewSystemLog): Promise<void> {
  try {
    const db = getDb()
    await db
      .insertInto('system_logs')
      .values({
        level: entry.level,
        category: entry.category,
        message: entry.message,
        detail: entry.detail ?? null
      })
      .execute()
  } catch (err) {
    console.error('[systemLogsRepo] failed to write log', err)
  }
}

export async function listSystemLogs(limit = 200) {
  const db = getDb()
  return db.selectFrom('system_logs').selectAll().orderBy('created_at', 'desc').limit(limit).execute()
}
