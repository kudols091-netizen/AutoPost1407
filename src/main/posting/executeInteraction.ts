import { getInteractionTaskById, updateInteractionTask } from '../db/repositories/interactionsRepo'
import { getPageById, markTokenNeedsReauth } from '../db/repositories/pagesRepo'
import { decryptToken } from '../security/safeStorage'
import { reactToPost, commentOnPost } from '../graph/interactions'
import { addSystemLog } from '../db/repositories/systemLogsRepo'
import { GraphApiError } from '../graph/client'

export async function executeInteractionTask(taskId: number): Promise<void> {
  const task = await getInteractionTaskById(taskId)
  if (!task) throw new Error(`Interaction task ${taskId} not found`)
  if (task.status !== 'pending') return

  const page = await getPageById(task.page_id)
  if (!page) {
    await updateInteractionTask(taskId, { status: 'failed', error_message: 'Page not found' })
    return
  }
  if (page.token_status === 'needs_reauth') {
    await updateInteractionTask(taskId, { status: 'failed', error_message: 'Page token needs reauthorization' })
    return
  }

  try {
    const pageToken = decryptToken(page.access_token_enc)
    if (task.action_type === 'comment') {
      await commentOnPost(task.target_object_id, pageToken, task.comment_text ?? '')
    } else {
      if (!page.user_token_enc) {
        throw new Error('Chưa có User token — vui lòng kết nối lại Page để lấy quyền react.')
      }
      const userToken = decryptToken(page.user_token_enc)
      await reactToPost(task.target_object_id, userToken, task.action_type, page.fb_page_id)
    }
    const now = new Date().toISOString()
    await updateInteractionTask(taskId, { status: 'done', executed_at: now })
    await addSystemLog({
      level: 'info',
      category: 'interaction',
      message: `Thực hiện ${task.action_type} thành công lên bài ${task.target_object_id} bởi "${page.name}"`
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await updateInteractionTask(taskId, { status: 'failed', error_message: message })
    if (err instanceof GraphApiError && err.isAuthError) {
      await markTokenNeedsReauth(page.fb_page_id)
    }
    await addSystemLog({
      level: 'error',
      category: 'interaction',
      message: `Thực hiện ${task.action_type} thất bại cho "${page.name}"`,
      detail: message
    })
  }
}
