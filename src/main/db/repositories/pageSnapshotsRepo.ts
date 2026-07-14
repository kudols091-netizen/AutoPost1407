import { getDb } from '../connection'

export interface NewPageSnapshot {
  pageId: number
  capturedAt: string
  followerCount: number
  pageReach: number | null
}

/** Upserts (not inserts) so re-running the same day always holds the latest captured value. */
export async function upsertPageSnapshot(snapshot: NewPageSnapshot): Promise<void> {
  const db = getDb()

  await db
    .insertInto('page_snapshots')
    .values({
      page_id: snapshot.pageId,
      captured_at: snapshot.capturedAt,
      follower_count: snapshot.followerCount,
      page_reach: snapshot.pageReach
    })
    .onConflict((oc) =>
      oc.columns(['page_id', 'captured_at']).doUpdateSet({
        follower_count: snapshot.followerCount,
        page_reach: snapshot.pageReach
      })
    )
    .execute()
}

export async function hasSnapshotForToday(pageId: number, todayDate: string): Promise<boolean> {
  const db = getDb()
  const row = await db
    .selectFrom('page_snapshots')
    .select('id')
    .where('page_id', '=', pageId)
    .where('captured_at', '=', todayDate)
    .executeTakeFirst()
  return row !== undefined
}

export async function listSnapshotsForPage(pageId: number) {
  const db = getDb()
  return db
    .selectFrom('page_snapshots')
    .selectAll()
    .where('page_id', '=', pageId)
    .orderBy('captured_at', 'asc')
    .execute()
}
