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
