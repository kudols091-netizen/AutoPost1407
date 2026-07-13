import { randomUUID } from 'crypto'
import { getDb } from '../connection'
import type { PostsTable, PostTargetsTable } from '../schema'

export interface NewPost {
  message: string
  linkUrl: string | null
  postType: PostsTable['post_type']
  targets: Array<{ pageId: number; scheduledPublishTime: string }>
  media?: { localFilePath: string; mimeType: string }
}

export async function createPost(input: NewPost) {
  const db = getDb()

  return db.transaction().execute(async (trx) => {
    const post = await trx
      .insertInto('posts')
      .values({
        uuid: randomUUID(),
        message: input.message,
        link_url: input.linkUrl,
        post_type: input.postType,
        status: 'draft'
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    if (input.media) {
      await trx
        .insertInto('media_assets')
        .values({
          post_id: post.id,
          local_file_path: input.media.localFilePath,
          fb_media_id: null,
          mime_type: input.media.mimeType,
          upload_status: 'pending'
        })
        .execute()
    }

    if (input.targets.length > 0) {
      await trx
        .insertInto('post_targets')
        .values(
          input.targets.map((t) => ({
            post_id: post.id,
            page_id: t.pageId,
            status: 'pending' as const,
            scheduled_publish_time: t.scheduledPublishTime
          }))
        )
        .execute()
    }

    return post
  })
}

export async function listPosts() {
  const db = getDb()
  return db.selectFrom('posts').selectAll().orderBy('created_at', 'desc').execute()
}

export async function getPostById(id: number) {
  const db = getDb()
  return db.selectFrom('posts').selectAll().where('id', '=', id).executeTakeFirst()
}

export async function updatePostStatus(id: number, status: PostsTable['status']) {
  const db = getDb()
  await db.updateTable('posts').set({ status }).where('id', '=', id).execute()
}

export async function listTargetsByStatus(status: PostTargetsTable['status']) {
  const db = getDb()
  return db.selectFrom('post_targets').selectAll().where('status', '=', status).execute()
}

export async function listPostsByStatus(status: PostsTable['status']) {
  const db = getDb()
  return db.selectFrom('posts').selectAll().where('status', '=', status).execute()
}

export async function getMediaForPost(postId: number) {
  const db = getDb()
  return db.selectFrom('media_assets').selectAll().where('post_id', '=', postId).executeTakeFirst()
}

export async function listTargetsForPost(postId: number) {
  const db = getDb()
  return db.selectFrom('post_targets').selectAll().where('post_id', '=', postId).execute()
}

export async function deletePost(postId: number) {
  const db = getDb()
  await db.deleteFrom('posts').where('id', '=', postId).execute()
}

export async function updateTarget(
  id: number,
  patch: Partial<
    Pick<PostTargetsTable, 'status' | 'fb_post_id' | 'error_message' | 'published_at'>
  >
) {
  const db = getDb()
  await db.updateTable('post_targets').set(patch).where('id', '=', id).execute()
}
