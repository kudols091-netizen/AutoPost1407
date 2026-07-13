export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed'
export type PostType = 'text' | 'photo' | 'link'
export type PostTargetStatus = 'pending' | 'scheduled' | 'published' | 'failed'

export interface Page {
  id: number
  fbPageId: string
  name: string
  category: string | null
  pictureUrl: string | null
  tokenObtainedAt: string
  tokenStatus: 'ok' | 'needs_reauth'
  isActive: boolean
}

export interface Post {
  id: number
  uuid: string
  createdAt: string
  message: string
  linkUrl: string | null
  postType: PostType
  status: PostStatus
}

export type SystemLogLevel = 'info' | 'warn' | 'error'

export interface SystemLog {
  id: number
  createdAt: string
  level: SystemLogLevel
  category: string
  message: string
  detail: string | null
}

export interface MediaAsset {
  id: number
  postId: number
  localFilePath: string
  fbMediaId: string | null
  mimeType: string
  uploadStatus: 'pending' | 'uploaded' | 'failed'
}

export interface PostTarget {
  id: number
  postId: number
  pageId: number
  fbPostId: string | null
  status: PostTargetStatus
  scheduledPublishTime: string
  errorMessage: string | null
  publishedAt: string | null
}

export interface AnalyticsSnapshot {
  id: number
  postTargetId: number
  capturedAt: string
  metricName: string
  metricValue: number
  period: string
}

export interface PostDetail extends Post {
  targets: PostTarget[]
  mediaLocalFilePath: string | null
}

export interface TargetAnalytics extends PostTarget {
  pageName: string
  snapshots: AnalyticsSnapshot[]
}

export interface PostAnalytics {
  post: Post
  targets: TargetAnalytics[]
}

export interface AppInfo {
  version: string
  metaAppId: string | null
  graphApiVersion: string
}
