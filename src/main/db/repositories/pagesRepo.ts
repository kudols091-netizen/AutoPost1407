import type { Selectable } from 'kysely'
import { getDb } from '../connection'
import type { PagesTable } from '../schema'

export interface NewPage {
  fbPageId: string
  name: string
  category: string | null
  pictureUrl: string | null
  accessTokenEnc: Buffer
  userTokenEnc?: Buffer | null
}

export type PageRow = Omit<Selectable<PagesTable>, 'is_active'> & { is_active: boolean }

function toRow(page: Selectable<PagesTable>): PageRow {
  return { ...page, is_active: Boolean(page.is_active) }
}

export async function upsertPage(page: NewPage) {
  const db = getDb()
  const now = new Date().toISOString()

  await db
    .insertInto('pages')
    .values({
      fb_page_id: page.fbPageId,
      name: page.name,
      category: page.category,
      picture_url: page.pictureUrl,
      access_token_enc: page.accessTokenEnc,
      user_token_enc: page.userTokenEnc ?? null,
      token_obtained_at: now,
      token_status: 'ok',
      is_active: 1
    })
    .onConflict((oc) =>
      oc.column('fb_page_id').doUpdateSet({
        name: page.name,
        category: page.category,
        picture_url: page.pictureUrl,
        access_token_enc: page.accessTokenEnc,
        user_token_enc: page.userTokenEnc ?? null,
        token_obtained_at: now,
        token_status: 'ok',
        is_active: 1
      })
    )
    .execute()
}

export async function listPages() {
  const db = getDb()
  const rows = await db.selectFrom('pages').selectAll().orderBy('name').execute()
  return rows.map(toRow)
}

export async function getPageById(id: number) {
  const db = getDb()
  const row = await db.selectFrom('pages').selectAll().where('id', '=', id).executeTakeFirst()
  return row ? toRow(row) : null
}

export async function markTokenNeedsReauth(fbPageId: string) {
  const db = getDb()
  await db
    .updateTable('pages')
    .set({ token_status: 'needs_reauth' })
    .where('fb_page_id', '=', fbPageId)
    .execute()
}
