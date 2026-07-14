import { readFile } from 'fs/promises'
import { join, resolve } from 'path'
import { app, ipcMain } from 'electron'
import type { AppInfo, InteractionTask, Page, PageDetails, PostAnalytics, PostDetail, SystemLog } from '@shared/types'
import { createInteractionSchema, createPostSchema, importMediaSchema, updatePageInfoSchema, uploadPagePictureSchema } from '@shared/ipcSchemas'
import { GRAPH_API_VERSION, getMetaAppConfig } from '../config/metaApp'
import { connectFacebookPages } from '../oauth/connectFlow'
import { getPageById, listPages } from '../db/repositories/pagesRepo'
import {
  createPost,
  getMediaForPost,
  getPostById,
  listPosts,
  listTargetsForPost
} from '../db/repositories/postsRepo'
import { listSnapshotsForTarget } from '../db/repositories/analyticsRepo'
import { addSystemLog, listSystemLogs } from '../db/repositories/systemLogsRepo'
import {
  createInteractionTask,
  deleteInteractionTask,
  getInteractionTaskById,
  listInteractionTasks
} from '../db/repositories/interactionsRepo'
import { submitPostTargets } from '../posting/submitPost'
import { deletePostEverywhere, type DeletePostResult } from '../posting/deletePost'
import { executeInteractionTask } from '../posting/executeInteraction'
import { fetchPageDetails, updatePageInfo, updatePagePicture, uploadPagePicture } from '../graph/pageManager'
import { importMedia } from '../media/mediaStore'
import { decryptToken } from '../security/safeStorage'
import {
  toAnalyticsSnapshotDto,
  toInteractionTaskDto,
  toPageDto,
  toPostDetailDto,
  toPostDto,
  toPostTargetDto,
  toSystemLogDto
} from './mappers'

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
}

async function withPostMedia(post: Awaited<ReturnType<typeof getPostById>>): Promise<PostDetail | null> {
  if (!post) return null
  const [targets, media] = await Promise.all([listTargetsForPost(post.id), getMediaForPost(post.id)])
  return toPostDetailDto(post, targets, media?.local_file_path ?? null)
}

export function registerIpcHandlers(): void {
  ipcMain.handle(
    'app:getInfo',
    (): AppInfo => {
      let metaAppId: string | null = null
      try {
        metaAppId = getMetaAppConfig().appId
      } catch {
        metaAppId = null
      }
      return { version: app.getVersion(), metaAppId, graphApiVersion: GRAPH_API_VERSION }
    }
  )

  ipcMain.handle('pages:connect', async (): Promise<Page[]> => {
    try {
      const pages = await connectFacebookPages()
      return pages.map(toPageDto)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      await addSystemLog({ level: 'error', category: 'oauth', message: 'Kết nối Facebook thất bại', detail: message })
      throw err
    }
  })

  ipcMain.handle('pages:list', async (): Promise<Page[]> => {
    const pages = await listPages()
    return pages.map(toPageDto)
  })

  ipcMain.handle('media:import', (_event, rawInput: unknown) => {
    const input = importMediaSchema.parse(rawInput)
    return importMedia(Buffer.from(input.data), input.name, input.mimeType)
  })

  ipcMain.handle('posts:create', async (_event, rawInput: unknown): Promise<PostDetail> => {
    const input = createPostSchema.parse(rawInput)

    const post = await createPost({
      message: input.message,
      linkUrl: input.linkUrl,
      postType: input.postType,
      media: input.media ?? undefined,
      targets: input.pageIds.map((pageId) => ({
        pageId,
        scheduledPublishTime: input.scheduledPublishTime
      }))
    })

    await submitPostTargets(post.id, { publishNow: input.publishNow })

    const detail = await withPostMedia(await getPostById(post.id))
    if (detail) return detail

    const targets = await listTargetsForPost(post.id)
    return toPostDetailDto(post, targets)
  })

  ipcMain.handle('posts:list', async (): Promise<PostDetail[]> => {
    const posts = await listPosts()
    const withMedia = await Promise.all(posts.map((post) => withPostMedia(post)))
    return withMedia.filter((post): post is PostDetail => post !== null)
  })

  ipcMain.handle('posts:delete', (_event, postId: number): Promise<DeletePostResult> => {
    return deletePostEverywhere(postId)
  })

  ipcMain.handle('logs:list', async (_event, limit?: number): Promise<SystemLog[]> => {
    const rows = await listSystemLogs(limit)
    return rows.map(toSystemLogDto)
  })

  ipcMain.handle('media:readThumbnail', async (_event, localFilePath: string): Promise<string> => {
    const mediaDir = join(app.getPath('userData'), 'media')
    const resolvedPath = resolve(localFilePath)
    if (!resolvedPath.startsWith(mediaDir)) {
      throw new Error('Refusing to read a file outside the media directory.')
    }

    const buffer = await readFile(resolvedPath)
    const ext = resolvedPath.slice(resolvedPath.lastIndexOf('.')).toLowerCase()
    const mimeType = MIME_BY_EXT[ext] ?? 'application/octet-stream'
    return `data:${mimeType};base64,${buffer.toString('base64')}`
  })

  ipcMain.handle('analytics:forPost', async (_event, postId: number): Promise<PostAnalytics> => {
    const post = await getPostById(postId)
    if (!post) throw new Error(`Post ${postId} not found`)

    const targets = await listTargetsForPost(postId)
    const targetsWithAnalytics = await Promise.all(
      targets.map(async (target) => {
        const page = await getPageById(target.page_id)
        const snapshots = await listSnapshotsForTarget(target.id)
        return {
          ...toPostTargetDto(target),
          pageName: page?.name ?? `Page #${target.page_id}`,
          snapshots: snapshots.map(toAnalyticsSnapshotDto)
        }
      })
    )

    return { post: toPostDto(post), targets: targetsWithAnalytics }
  })

  ipcMain.handle('interactions:create', async (_event, rawInput: unknown): Promise<InteractionTask> => {
    const input = createInteractionSchema.parse(rawInput)
    const task = await createInteractionTask({
      postUrl: input.postUrl,
      targetObjectId: input.targetObjectId,
      pageId: input.pageId,
      actionType: input.actionType,
      commentText: input.commentText ?? null,
      scheduledAt: input.scheduledAt
    })
    if (input.executeNow) {
      await executeInteractionTask(task.id)
      const updated = await getInteractionTaskById(task.id)
      if (updated) {
        const page = await getPageById(updated.page_id)
        return toInteractionTaskDto(updated, page?.name ?? `Page #${updated.page_id}`)
      }
    }
    const page = await getPageById(task.page_id)
    return toInteractionTaskDto(task, page?.name ?? `Page #${task.page_id}`)
  })

  ipcMain.handle('interactions:list', async (): Promise<InteractionTask[]> => {
    const tasks = await listInteractionTasks()
    return Promise.all(
      tasks.map(async (task) => {
        const page = await getPageById(task.page_id)
        return toInteractionTaskDto(task, page?.name ?? `Page #${task.page_id}`)
      })
    )
  })

  ipcMain.handle('interactions:execute', async (_event, taskId: number): Promise<InteractionTask> => {
    await executeInteractionTask(taskId)
    const task = await getInteractionTaskById(taskId)
    if (!task) throw new Error(`Task ${taskId} not found`)
    const page = await getPageById(task.page_id)
    return toInteractionTaskDto(task, page?.name ?? `Page #${task.page_id}`)
  })

  ipcMain.handle('interactions:delete', async (_event, taskId: number): Promise<void> => {
    await deleteInteractionTask(taskId)
  })

  ipcMain.handle('pageEditor:getDetails', async (_event, pageId: number): Promise<PageDetails> => {
    const page = await getPageById(pageId)
    if (!page) throw new Error(`Page ${pageId} not found`)
    const token = decryptToken(page.access_token_enc)
    const details = await fetchPageDetails(page.fb_page_id, token)
    return {
      fbPageId: details.id,
      name: details.name,
      about: details.about ?? null,
      pictureUrl: details.picture?.data?.url ?? null
    }
  })

  ipcMain.handle('pageEditor:updateInfo', async (_event, rawInput: unknown): Promise<void> => {
    const input = updatePageInfoSchema.parse(rawInput)
    const page = await getPageById(input.pageId)
    if (!page) throw new Error(`Page ${input.pageId} not found`)
    const token = decryptToken(page.access_token_enc)
    const patch: { name?: string; about?: string } = {}
    if (input.name !== undefined) patch.name = input.name
    if (input.about !== undefined) patch.about = input.about
    if (Object.keys(patch).length > 0) {
      await updatePageInfo(page.fb_page_id, token, patch)
    }
    await addSystemLog({
      level: 'info',
      category: 'page-editor',
      message: `Đã cập nhật thông tin Page "${page.name}"`
    })
  })

  ipcMain.handle('pageEditor:updatePicture', async (_event, rawInput: unknown): Promise<void> => {
    const input = updatePageInfoSchema.parse(rawInput)
    if (!input.pictureUrl) throw new Error('pictureUrl là bắt buộc')
    const page = await getPageById(input.pageId)
    if (!page) throw new Error(`Page ${input.pageId} not found`)
    const token = decryptToken(page.access_token_enc)
    await updatePagePicture(page.fb_page_id, token, input.pictureUrl)
    await addSystemLog({
      level: 'info',
      category: 'page-editor',
      message: `Đã cập nhật avatar Page "${page.name}"`
    })
  })

  ipcMain.handle('pageEditor:uploadPicture', async (_event, rawInput: unknown): Promise<void> => {
    const input = uploadPagePictureSchema.parse(rawInput)
    const page = await getPageById(input.pageId)
    if (!page) throw new Error(`Page ${input.pageId} not found`)
    const token = decryptToken(page.access_token_enc)
    await uploadPagePicture(page.fb_page_id, token, Buffer.from(input.imageData), input.mimeType, input.fileName)
    await addSystemLog({
      level: 'info',
      category: 'page-editor',
      message: `Đã tải lên avatar mới cho Page "${page.name}"`
    })
  })
}
