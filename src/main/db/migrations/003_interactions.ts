import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('interaction_tasks')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('post_url', 'text', (col) => col.notNull())
    .addColumn('target_object_id', 'text', (col) => col.notNull())
    .addColumn('page_id', 'integer', (col) => col.notNull().references('pages.id').onDelete('cascade'))
    .addColumn('action_type', 'text', (col) => col.notNull())
    .addColumn('comment_text', 'text')
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('pending'))
    .addColumn('error_message', 'text')
    .addColumn('scheduled_at', 'text', (col) => col.notNull())
    .addColumn('executed_at', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('interaction_tasks').ifExists().execute()
}
