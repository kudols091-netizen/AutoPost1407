import { readFile } from 'fs/promises'
import { join, resolve } from 'path'
import { app, ipcMain } from 'electron'
import type { AppInfo, Page, PostAnalytics, PostDetail, SystemLog } from '@shared/types'
import { createPostSchema, importMediaSchema } from '@shared/ipcSchemas'
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
import { submitPostTargets } from '../posting/submitPost'
import { deletePostEverywhere, type DeletePostResult } from '../posting/deletePost'
import { importMedia } from '../media/mediaStore'
import {
  toAnalyticsSnapshotDto,
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
}
