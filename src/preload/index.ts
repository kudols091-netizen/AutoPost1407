import { contextBridge, ipcRenderer } from 'electron'
import type { AppInfo, InteractionTask, Page, PageDetails, PostAnalytics, PostDetail, SystemLog } from '@shared/types'
import type { CreateInteractionInput, CreatePostInput, UpdatePageInfoInput, UploadPagePictureInput } from '@shared/ipcSchemas'

export interface ImportMediaResult {
  localFilePath: string
  mimeType: string
}

export interface DeletePostResult {
  liveDeleteErrors: string[]
}

const api = {
  app: {
    getInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:getInfo')
  },
  pages: {
    connect: (): Promise<Page[]> => ipcRenderer.invoke('pages:connect'),
    list: (): Promise<Page[]> => ipcRenderer.invoke('pages:list')
  },
  media: {
    import: (input: { name: string; mimeType: string; data: Uint8Array }): Promise<ImportMediaResult> =>
      ipcRenderer.invoke('media:import', input),
    readThumbnail: (localFilePath: string): Promise<string> =>
      ipcRenderer.invoke('media:readThumbnail', localFilePath)
  },
  posts: {
    create: (input: CreatePostInput): Promise<PostDetail> => ipcRenderer.invoke('posts:create', input),
    list: (): Promise<PostDetail[]> => ipcRenderer.invoke('posts:list'),
    delete: (postId: number): Promise<DeletePostResult> => ipcRenderer.invoke('posts:delete', postId)
  },
  analytics: {
    forPost: (postId: number): Promise<PostAnalytics> => ipcRenderer.invoke('analytics:forPost', postId)
  },
  logs: {
    list: (limit?: number): Promise<SystemLog[]> => ipcRenderer.invoke('logs:list', limit)
  },
  interactions: {
    create: (input: CreateInteractionInput): Promise<InteractionTask> =>
      ipcRenderer.invoke('interactions:create', input),
    list: (): Promise<InteractionTask[]> => ipcRenderer.invoke('interactions:list'),
    execute: (taskId: number): Promise<InteractionTask> => ipcRenderer.invoke('interactions:execute', taskId),
    delete: (taskId: number): Promise<void> => ipcRenderer.invoke('interactions:delete', taskId)
  },
  pageEditor: {
    getDetails: (pageId: number): Promise<PageDetails> => ipcRenderer.invoke('pageEditor:getDetails', pageId),
    updateInfo: (input: UpdatePageInfoInput): Promise<void> => ipcRenderer.invoke('pageEditor:updateInfo', input),
    updatePicture: (input: UpdatePageInfoInput): Promise<void> => ipcRenderer.invoke('pageEditor:updatePicture', input),
    uploadPicture: (input: UploadPagePictureInput): Promise<void> => ipcRenderer.invoke('pageEditor:uploadPicture', input)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
