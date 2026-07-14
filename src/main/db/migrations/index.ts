import type { Migration, MigrationProvider } from 'kysely/migration'
import * as m001 from './001_initial'
import * as m002 from './002_system_logs'
import * as m003 from './003_interactions'
import * as m004 from './004_user_token'

const migrations: Record<string, Migration> = {
  '001_initial': m001,
  '002_system_logs': m002,
  '003_interactions': m003,
  '004_user_token': m004
}

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations
  }
}
