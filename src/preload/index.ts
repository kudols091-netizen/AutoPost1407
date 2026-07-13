import { contextBridge, ipcRenderer } from 'electron'
import type { AppInfo, Page, PostAnalytics, PostDetail, SystemLog } from '@shared/types'
import type { CreatePostInput } from '@shared/ipcSchemas'

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
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
