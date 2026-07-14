import type { Selectable } from 'kysely'
import type { PageRow } from '../db/repositories/pagesRepo'
import type { AnalyticsSnapshotsTable, InteractionTasksTable, PostsTable, PostTargetsTable, SystemLogsTable } from '../db/schema'
import type { AnalyticsSnapshot, InteractionTask, Page, Post, PostDetail, PostTarget, SystemLog } from '@shared/types'

export function toPageDto(row: PageRow): Page {
  return {
    id: row.id,
    fbPageId: row.fb_page_id,
    name: row.name,
    category: row.category,
    pictureUrl: row.picture_url,
    tokenObtainedAt: row.token_obtained_at,
    tokenStatus: row.token_status,
    isActive: row.is_active
  }
}

export function toPostDto(row: Selectable<PostsTable>): Post {
  return {
    id: row.id,
    uuid: row.uuid,
    createdAt: row.created_at,
    message: row.message,
    linkUrl: row.link_url,
    postType: row.post_type,
    status: row.status
  }
}

export function toPostTargetDto(row: Selectable<PostTargetsTable>): PostTarget {
  return {
    id: row.id,
    postId: row.post_id,
    pageId: row.page_id,
    fbPostId: row.fb_post_id,
    status: row.status,
    scheduledPublishTime: row.scheduled_publish_time,
    errorMessage: row.error_message,
    publishedAt: row.published_at
  }
}

export function toPostDetailDto(
  post: Selectable<PostsTable>,
  targets: Selectable<PostTargetsTable>[],
  mediaLocalFilePath: string | null = null
): PostDetail {
  return { ...toPostDto(post), targets: targets.map(toPostTargetDto), mediaLocalFilePath }
}

export function toSystemLogDto(row: Selectable<SystemLogsTable>): SystemLog {
  return {
    id: row.id,
    createdAt: row.created_at,
    level: row.level,
    category: row.category,
    message: row.message,
    detail: row.detail
  }
}

export function toAnalyticsSnapshotDto(row: Selectable<AnalyticsSnapshotsTable>): AnalyticsSnapshot {
  return {
    id: row.id,
    postTargetId: row.post_target_id,
    capturedAt: row.captured_at,
    metricName: row.metric_name,
    metricValue: row.metric_value,
    period: row.period
  }
}

export function toInteractionTaskDto(row: Selectable<InteractionTasksTable>, pageName: string): InteractionTask {
  return {
    id: row.id,
    postUrl: row.post_url,
    targetObjectId: row.target_object_id,
    pageId: row.page_id,
    pageName,
    actionType: row.action_type as InteractionTask['actionType'],
    commentText: row.comment_text,
    status: row.status as InteractionTask['status'],
    errorMessage: row.error_message,
    scheduledAt: row.scheduled_at,
    executedAt: row.executed_at,
    createdAt: row.created_at
  }
}
