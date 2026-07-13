import type { Generated } from 'kysely'

export interface PagesTable {
  id: Generated<number>
  fb_page_id: string
  name: string
  category: string | null
  picture_url: string | null
  access_token_enc: Buffer
  token_obtained_at: string
  token_status: 'ok' | 'needs_reauth'
  is_active: number
}

export interface PostsTable {
  id: Generated<number>
  uuid: string
  created_at: Generated<string>
  message: string
  link_url: string | null
  post_type: 'text' | 'photo' | 'link'
  status: 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed'
}

export interface MediaAssetsTable {
  id: Generated<number>
  post_id: number
  local_file_path: string
  fb_media_id: string | null
  mime_type: string
  upload_status: 'pending' | 'uploaded' | 'failed'
}

export interface PostTargetsTable {
  id: Generated<number>
  post_id: number
  page_id: number
  fb_post_id: string | null
  status: 'pending' | 'scheduled' | 'published' | 'failed'
  scheduled_publish_time: string
  error_message: string | null
  published_at: string | null
}

export interface AnalyticsSnapshotsTable {
  id: Generated<number>
  post_target_id: number
  captured_at: string
  metric_name: string
  metric_value: number
  period: string
}

export interface AppSettingsTable {
  key: string
  value: string
}

export interface SystemLogsTable {
  id: Generated<number>
  created_at: Generated<string>
  level: 'info' | 'warn' | 'error'
  category: string
  message: string
  detail: string | null
}

export interface Database {
  pages: PagesTable
  posts: PostsTable
  media_assets: MediaAssetsTable
  post_targets: PostTargetsTable
  analytics_snapshots: AnalyticsSnapshotsTable
  app_settings: AppSettingsTable
  system_logs: SystemLogsTable
}
