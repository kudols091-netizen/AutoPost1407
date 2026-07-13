import { deleteFbPost } from '../graph/posts'
import { decryptToken } from '../security/safeStorage'
import { getPageById } from '../db/repositories/pagesRepo'
import { deletePost as deletePostRow, listTargetsForPost } from '../db/repositories/postsRepo'
import { addSystemLog } from '../db/repositories/systemLogsRepo'

export interface DeletePostResult {
  liveDeleteErrors: string[]
}

/**
 * Deletes the live/scheduled post from every target Page (best-effort — a failure to
 * reach Meta doesn't block removing the local record), then removes the post from the
 * local database (cascades to its targets, media, and analytics snapshots).
 */
export async function deletePostEverywhere(postId: number): Promise<DeletePostResult> {
  const targets = await listTargetsForPost(postId)
  const liveDeleteErrors: string[] = []

  for (const target of targets) {
    if (!target.fb_post_id) continue

    const page = await getPageById(target.page_id)
    if (!page || page.token_status === 'needs_reauth') {
      liveDeleteErrors.push(`${page?.name ?? `Page #${target.page_id}`}: reconnect required to delete`)
      continue
    }

    try {
      const pageAccessToken = decryptToken(page.access_token_enc)
      await deleteFbPost(target.fb_post_id, pageAccessToken)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      liveDeleteErrors.push(`${page.name}: ${message}`)
    }
  }

  await deletePostRow(postId)

  await addSystemLog({
    level: liveDeleteErrors.length > 0 ? 'warn' : 'info',
    category: 'post',
    message: `Đã xóa bài viết #${postId}`,
    detail: liveDeleteErrors.length > 0 ? liveDeleteErrors.join('; ') : null
  })

  return { liveDeleteErrors }
}
