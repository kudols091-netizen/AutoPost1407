import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('pages')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('fb_page_id', 'text', (col) => col.notNull().unique())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('category', 'text')
    .addColumn('picture_url', 'text')
    .addColumn('access_token_enc', 'blob', (col) => col.notNull())
    .addColumn('token_obtained_at', 'text', (col) => col.notNull())
    .addColumn('token_status', 'text', (col) => col.notNull().defaultTo('ok'))
    .addColumn('is_active', 'integer', (col) => col.notNull().defaultTo(1))
    .execute()

  await db.schema
    .createTable('posts')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('uuid', 'text', (col) => col.notNull().unique())
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn('message', 'text', (col) => col.notNull())
    .addColumn('link_url', 'text')
    .addColumn('post_type', 'text', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('draft'))
    .execute()

  await db.schema
    .createTable('media_assets')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('post_id', 'integer', (col) =>
      col.notNull().references('posts.id').onDelete('cascade')
    )
    .addColumn('local_file_path', 'text', (col) => col.notNull())
    .addColumn('fb_media_id', 'text')
    .addColumn('mime_type', 'text', (col) => col.notNull())
    .addColumn('upload_status', 'text', (col) => col.notNull().defaultTo('pending'))
    .execute()

  await db.schema
    .createTable('post_targets')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('post_id', 'integer', (col) =>
      col.notNull().references('posts.id').onDelete('cascade')
    )
    .addColumn('page_id', 'integer', (col) =>
      col.notNull().references('pages.id').onDelete('cascade')
    )
    .addColumn('fb_post_id', 'text')
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('pending'))
    .addColumn('scheduled_publish_time', 'text', (col) => col.notNull())
    .addColumn('error_message', 'text')
    .addColumn('published_at', 'text')
    .execute()

  await db.schema
    .createTable('analytics_snapshots')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('post_target_id', 'integer', (col) =>
      col.notNull().references('post_targets.id').onDelete('cascade')
    )
    .addColumn('captured_at', 'text', (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn('metric_name', 'text', (col) => col.notNull())
    .addColumn('metric_value', 'real', (col) => col.notNull())
    .addColumn('period', 'text', (col) => col.notNull())
    .execute()

  await db.schema
    .createTable('app_settings')
    .addColumn('key', 'text', (col) => col.primaryKey())
    .addColumn('value', 'text', (col) => col.notNull())
    .execute()

  await db.schema
    .createIndex('idx_post_targets_status')
    .on('post_targets')
    .column('status')
    .execute()

  await db.schema
    .createIndex('idx_analytics_snapshots_target')
    .on('analytics_snapshots')
    .column('post_target_id')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('analytics_snapshots').ifExists().execute()
  await db.schema.dropTable('post_targets').ifExists().execute()
  await db.schema.dropTable('media_assets').ifExists().execute()
  await db.schema.dropTable('posts').ifExists().execute()
  await db.schema.dropTable('app_settings').ifExists().execute()
  await db.schema.dropTable('pages').ifExists().execute()
}
