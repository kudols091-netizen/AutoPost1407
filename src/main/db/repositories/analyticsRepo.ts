import { getDb } from '../connection'

export interface NewSnapshot {
  postTargetId: number
  metricName: string
  metricValue: number
  period: string
}

export async function insertSnapshots(snapshots: NewSnapshot[]) {
  if (snapshots.length === 0) return
  const db = getDb()
  const now = new Date().toISOString()

  await db
    .insertInto('analytics_snapshots')
    .values(
      snapshots.map((s) => ({
        post_target_id: s.postTargetId,
        captured_at: now,
        metric_name: s.metricName,
        metric_value: s.metricValue,
        period: s.period
      }))
    )
    .execute()
}

export async function listSnapshotsForTarget(postTargetId: number) {
  const db = getDb()
  return db
    .selectFrom('analytics_snapshots')
    .selectAll()
    .where('post_target_id', '=', postTargetId)
    .orderBy('captured_at', 'desc')
    .execute()
}

export async function latestSnapshotsForPost(postId: number) {
  const db = getDb()
  return db
    .selectFrom('analytics_snapshots')
    .innerJoin('post_targets', 'post_targets.id', 'analytics_snapshots.post_target_id')
    .selectAll('analytics_snapshots')
    .where('post_targets.post_id', '=', postId)
    .orderBy('analytics_snapshots.captured_at', 'desc')
    .execute()
}

export interface PagePostAnalyticsRow {
  postId: number
  postType: string
  publishedAt: string
  reach: number
  reactions: number
  comments: number
  shares: number
  clicks: number
}

/** One row per published post_target for a page, with the latest value of each metric. */
export async function listPagePostAnalytics(pageId: number): Promise<PagePostAnalyticsRow[]> {
  const db = getDb()

  const targets = await db
    .selectFrom('post_targets')
    .innerJoin('posts', 'posts.id', 'post_targets.post_id')
    .select([
      'post_targets.id as targetId',
      'post_targets.post_id as postId',
      'post_targets.published_at as publishedAt',
      'posts.post_type as postType'
    ])
    .where('post_targets.page_id', '=', pageId)
    .where('post_targets.status', '=', 'published')
    .execute()

  return Promise.all(
    targets.map(async (target) => {
      const snapshots = await db
        .selectFrom('analytics_snapshots')
        .selectAll()
        .where('post_target_id', '=', target.targetId)
        .orderBy('captured_at', 'desc')
        .execute()

      const latestByMetric = new Map<string, number>()
      for (const s of snapshots) {
        if (!latestByMetric.has(s.metric_name)) latestByMetric.set(s.metric_name, s.metric_value)
      }

      return {
        postId: target.postId,
        postType: target.postType,
        publishedAt: target.publishedAt ?? '',
        reach: latestByMetric.get('post_impressions') ?? 0,
        reactions: latestByMetric.get('likes_count') ?? 0,
        comments: latestByMetric.get('comments_count') ?? 0,
        shares: latestByMetric.get('shares_count') ?? 0,
        clicks: latestByMetric.get('post_clicks') ?? 0
      }
    })
  )
}
