import type { Migration, MigrationProvider } from 'kysely/migration'
import * as m001 from './001_initial'
import * as m002 from './002_system_logs'

const migrations: Record<string, Migration> = {
  '001_initial': m001,
  '002_system_logs': m002
}

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations
  }
}
