import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('page_snapshots')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('page_id', 'integer', (col) =>
      col.notNull().references('pages.id').onDelete('cascade')
    )
    .addColumn('captured_at', 'text', (col) => col.notNull())
    .addColumn('follower_count', 'integer', (col) => col.notNull())
    .addColumn('page_reach', 'real')
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addUniqueConstraint('uq_page_snapshots_page_date', ['page_id', 'captured_at'])
    .execute()

  await db.schema
    .createIndex('idx_page_snapshots_page')
    .on('page_snapshots')
    .column('page_id')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('page_snapshots').ifExists().execute()
}
