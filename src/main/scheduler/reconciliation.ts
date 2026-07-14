import cron, { type ScheduledTask } from 'node-cron'
import { getPageById, listPages } from '../db/repositories/pagesRepo'
import {
  listPostsByStatus,
  listTargetsByStatus,
  listTargetsForPost,
  updatePostStatus,
  updateTarget
} from '../db/repositories/postsRepo'
import { hasSnapshotForToday, upsertPageSnapshot } from '../db/repositories/pageSnapshotsRepo'
import { decryptToken } from '../security/safeStorage'
import { getPostPublishStatus } from '../graph/posts'
import { fetchPageFollowerAndReach } from '../graph/pageManager'
import { submitPostTargets } from '../posting/submitPost'
import { snapshotAllPublishedTargets, snapshotTarget } from './analyticsPoller'
import { addSystemLog } from '../db/repositories/systemLogsRepo'
import { listPendingDueTasks } from '../db/repositories/interactionsRepo'
import { executeInteractionTask } from '../posting/executeInteraction'
import { toDateKey } from '../analytics/dateKey'

/** Re-attempts posts left in `draft` because their schedule was outside the 30-day window. */
async function resubmitDraftPosts(): Promise<void> {
  const draftPosts = await listPostsByStatus('draft')
  for (const post of draftPosts) {
    await submitPostTargets(post.id)
  }
}

/** Confirms Meta actually published scheduled posts, and captures the first analytics snapshot. */
async function syncScheduledTargets(): Promise<void> {
  const scheduledTargets = await listTargetsByStatus('scheduled')

  for (const target of scheduledTargets) {
    if (!target.fb_post_id) continue

    const page = await getPageById(target.page_id)
    if (!page || page.token_status === 'needs_reauth') continue

    try {
      const pageAccessToken = decryptToken(page.access_token_enc)
      const { isPublished } = await getPostPublishStatus(target.fb_post_id, pageAccessToken)

      if (isPublished) {
        const publishedAt = new Date().toISOString()
        await updateTarget(target.id, { status: 'published', published_at: publishedAt })
        await snapshotTarget({ ...target, status: 'published', published_at: publishedAt })
        await addSystemLog({
          level: 'info',
          category: 'reconciliation',
          message: `Xác nhận đã đăng lên "${page.name}"`
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[reconciliation] status check failed for target ${target.id}`, err)
      await addSystemLog({
        level: 'error',
        category: 'reconciliation',
        message: `Kiểm tra trạng thái đăng bài cho "${page.name}" thất bại`,
        detail: message
      })
    }
  }

  await reconcilePostStatuses()
}

/**
 * Captures one page_snapshots row per page per calendar day. Self-healing: checks
 * "does today already have a row?" rather than relying on a fixed cron time, since
 * the app isn't guaranteed to be running at any particular clock time.
 */
async function snapshotPagesIfDue(): Promise<void> {
  const today = toDateKey(new Date())
  const pages = await listPages()

  for (const page of pages) {
    if (!page.is_active || page.token_status === 'needs_reauth') continue

    const already = await hasSnapshotForToday(page.id, today)
    if (already) continue

    try {
      const token = decryptToken(page.access_token_enc)
      const { followerCount, pageReach } = await fetchPageFollowerAndReach(page.fb_page_id, token)
      await upsertPageSnapshot({ pageId: page.id, capturedAt: today, followerCount, pageReach })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[reconciliation] page snapshot failed for page ${page.id}`, err)
      await addSystemLog({
        level: 'error',
        category: 'page-snapshot',
        message: `Chụp chỉ số Page "${page.name}" thất bại`,
        detail: message
      })
    }
  }
}

/** Executes interaction tasks (react/comment) whose scheduled_at is now due. */
async function executePendingInteractions(): Promise<void> {
  const tasks = await listPendingDueTasks()
  for (const task of tasks) {
    try {
      await executeInteractionTask(task.id)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[reconciliation] interaction task ${task.id} failed`, err)
      await addSystemLog({
        level: 'error',
        category: 'interaction',
        message: `Lỗi thực hiện tác vụ tương tác #${task.id}`,
        detail: message
      })
    }
  }
}

/** Once none of a post's targets are still `scheduled`, roll the post up to `published`. */
async function reconcilePostStatuses(): Promise<void> {
  const scheduledPosts = await listPostsByStatus('scheduled')
  for (const post of scheduledPosts) {
    const targets = await listTargetsForPost(post.id)
    const hasScheduledLeft = targets.some((t) => t.status === 'scheduled')
    const hasPublished = targets.some((t) => t.status === 'published')

    if (!hasScheduledLeft && hasPublished) {
      await updatePostStatus(post.id, 'published')
    }
  }
}

let task: ScheduledTask | null = null

export function startReconciliationScheduler(): void {
  if (task) return

  const run = async (): Promise<void> => {
    try {
      await resubmitDraftPosts()
      await syncScheduledTargets()
      await snapshotAllPublishedTargets()
      await snapshotPagesIfDue()
      await executePendingInteractions()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('[reconciliation] run failed', err)
      await addSystemLog({ level: 'error', category: 'reconciliation', message: 'Chu kỳ đồng bộ thất bại', detail: message })
    }
  }

  // Fire once on startup, then every 5 minutes.
  run()
  task = cron.schedule('*/5 * * * *', run)
}

export function stopReconciliationScheduler(): void {
  task?.stop()
  task = null
}
