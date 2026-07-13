import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('system_logs')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn('level', 'text', (col) => col.notNull())
    .addColumn('category', 'text', (col) => col.notNull())
    .addColumn('message', 'text', (col) => col.notNull())
    .addColumn('detail', 'text')
    .execute()

  await db.schema.createIndex('idx_system_logs_created_at').on('system_logs').column('created_at').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('system_logs').ifExists().execute()
}
