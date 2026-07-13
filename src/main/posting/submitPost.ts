import { GraphApiError } from '../graph/client'
import { createFeedPost, createPhotoPost, isTooFarToSchedule, isTooSoonToSchedule } from '../graph/posts'
import { decryptToken } from '../security/safeStorage'
import { getPageById, markTokenNeedsReauth } from '../db/repositories/pagesRepo'
import {
  getMediaForPost,
  getPostById,
  listTargetsForPost,
  updatePostStatus,
  updateTarget
} from '../db/repositories/postsRepo'
import { addSystemLog } from '../db/repositories/systemLogsRepo'

export interface SubmitPostOptions {
  /** Publish immediately instead of using scheduled_publish_time. */
  publishNow?: boolean
}

/**
 * Pushes every pending target of a post to the Graph API using each Page's own token.
 * Meta's `scheduled_publish_time` does the actual publishing server-side — this only
 * has to succeed once per target, not keep the app running until publish time.
 */
export async function submitPostTargets(postId: number, options: SubmitPostOptions = {}): Promise<void> {
  const post = await getPostById(postId)
  if (!post) throw new Error(`Post ${postId} not found`)

  const [targets, media] = await Promise.all([listTargetsForPost(postId), getMediaForPost(postId)])

  let scheduledCount = 0
  let stillPendingCount = 0

  for (const target of targets) {
    if (target.status !== 'pending') continue

    const page = await getPageById(target.page_id)
    if (!page) {
      await updateTarget(target.id, { status: 'failed', error_message: 'Page not found' })
      continue
    }

    const scheduledUnix = Math.floor(new Date(target.scheduled_publish_time).getTime() / 1000)

    if (!options.publishNow) {
      if (isTooSoonToSchedule(scheduledUnix)) {
        await updateTarget(target.id, {
          status: 'failed',
          error_message: 'Schedule time must be at least 10 minutes from now.'
        })
        continue
      }

      // Too far out for Meta's 30-day scheduling window — leave pending; the reconciliation
      // job auto-submits it once the post crosses into that window.
      if (isTooFarToSchedule(scheduledUnix)) {
        stillPendingCount += 1
        continue
      }
    }

    const publishTimeUnix = options.publishNow ? null : scheduledUnix

    try {
      const pageAccessToken = decryptToken(page.access_token_enc)

      const fbPostId =
        post.post_type === 'photo' && media
          ? await createPhotoPost({
              pageAccessToken,
              fbPageId: page.fb_page_id,
              message: post.message,
              localFilePath: media.local_file_path,
              scheduledPublishTimeUnix: publishTimeUnix
            })
          : await createFeedPost({
              pageAccessToken,
              fbPageId: page.fb_page_id,
              message: post.message,
              linkUrl: post.link_url,
              scheduledPublishTimeUnix: publishTimeUnix
            })

      if (options.publishNow) {
        await updateTarget(target.id, {
          status: 'published',
          fb_post_id: fbPostId,
          error_message: null,
          published_at: new Date().toISOString()
        })
        await addSystemLog({
          level: 'info',
          category: 'post',
          message: `Đã đăng ngay lên "${page.name}"`
        })
      } else {
        await updateTarget(target.id, { status: 'scheduled', fb_post_id: fbPostId, error_message: null })
        await addSystemLog({
          level: 'info',
          category: 'post',
          message: `Đã lên lịch bài viết cho "${page.name}"`,
          detail: target.scheduled_publish_time
        })
      }
      scheduledCount += 1
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      await updateTarget(target.id, { status: 'failed', error_message: message })
      await addSystemLog({
        level: 'error',
        category: 'post',
        message: `Đăng bài lên "${page.name}" thất bại`,
        detail: message
      })

      if (err instanceof GraphApiError && err.isAuthError) {
        await markTokenNeedsReauth(page.fb_page_id)
        await addSystemLog({
          level: 'warn',
          category: 'oauth',
          message: `"${page.name}" cần kết nối lại (token hết hạn/bị thu hồi)`
        })
      }
    }
  }

  const status =
    scheduledCount > 0
      ? options.publishNow
        ? 'published'
        : 'scheduled'
      : stillPendingCount > 0
        ? 'draft'
        : 'failed'
  await updatePostStatus(postId, status)
}
