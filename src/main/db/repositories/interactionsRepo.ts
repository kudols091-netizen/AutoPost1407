import type { Selectable } from 'kysely'
import { sql } from 'kysely'
import { getDb } from '../connection'
import type { InteractionTasksTable } from '../schema'

export type InteractionTaskRow = Selectable<InteractionTasksTable>

export interface NewInteractionTask {
  postUrl: string
  targetObjectId: string
  pageId: number
  actionType: string
  commentText: string | null
  scheduledAt: string
}

export async function createInteractionTask(input: NewInteractionTask): Promise<InteractionTaskRow> {
  const db = getDb()
  const result = await db
    .insertInto('interaction_tasks')
    .values({
      post_url: input.postUrl,
      target_object_id: input.targetObjectId,
      page_id: input.pageId,
      action_type: input.actionType,
      comment_text: input.commentText,
      scheduled_at: input.scheduledAt
    })
    .executeTakeFirstOrThrow()

  return db
    .selectFrom('interaction_tasks')
    .selectAll()
    .where('id', '=', Number(result.insertId))
    .executeTakeFirstOrThrow()
}

export async function listInteractionTasks(): Promise<InteractionTaskRow[]> {
  const db = getDb()
  return db.selectFrom('interaction_tasks').selectAll().orderBy('created_at', 'desc').execute()
}

export async function getInteractionTaskById(id: number): Promise<InteractionTaskRow | undefined> {
  const db = getDb()
  return db.selectFrom('interaction_tasks').selectAll().where('id', '=', id).executeTakeFirst()
}

export async function updateInteractionTask(
  id: number,
  patch: Partial<{ status: string; error_message: string | null; executed_at: string | null }>
): Promise<void> {
  const db = getDb()
  await db.updateTable('interaction_tasks').set(patch).where('id', '=', id).execute()
}

export async function listPendingDueTasks(): Promise<InteractionTaskRow[]> {
  const db = getDb()
  return db
    .selectFrom('interaction_tasks')
    .selectAll()
    .where('status', '=', 'pending')
    .where(sql`datetime(scheduled_at)`, '<=', sql`datetime('now')`)
    .execute()
}

export async function deleteInteractionTask(id: number): Promise<void> {
  const db = getDb()
  await db.deleteFrom('interaction_tasks').where('id', '=', id).execute()
}
