import { app } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'
import { Kysely, SqliteDialect } from 'kysely'
import { Migrator } from 'kysely/migration'
import type { Database as Schema } from './schema'
import { migrationProvider } from './migrations'

let dbInstance: Kysely<Schema> | null = null

function resolveDbPath(): string {
  return join(app.getPath('userData'), 'autopost.db')
}

export function getDb(): Kysely<Schema> {
  if (dbInstance) return dbInstance

  const sqlite = new Database(resolveDbPath())
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  dbInstance = new Kysely<Schema>({
    dialect: new SqliteDialect({ database: sqlite })
  })

  return dbInstance
}

export async function migrateToLatest(): Promise<void> {
  const db = getDb()
  const migrator = new Migrator({ db, provider: migrationProvider })
  const { error, results } = await migrator.migrateToLatest()

  results?.forEach((result: { status: string; migrationName: string }) => {
    if (result.status === 'Error') {
      console.error(`[db] migration "${result.migrationName}" failed`)
    }
  })

  if (error) {
    console.error('[db] migration failed', error)
    throw error
  }
}
