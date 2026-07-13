import type { Selectable } from 'kysely'
import type { PostTargetsTable } from '../db/schema'
import { getPageById } from '../db/repositories/pagesRepo'
import { insertSnapshots } from '../db/repositories/analyticsRepo'
import { listTargetsByStatus } from '../db/repositories/postsRepo'
import { decryptToken } from '../security/safeStorage'
import { fetchPostEngagementCounts, fetchPostInsights } from '../graph/insights'

export async function snapshotTarget(target: Selectable<PostTargetsTable>): Promise<void> {
  if (!target.fb_post_id) return

  const page = await getPageById(target.page_id)
  if (!page || page.token_status === 'needs_reauth') return

  const pageAccessToken = decryptToken(page.access_token_enc)

  try {
    const [insights, engagement] = await Promise.all([
      fetchPostInsights(target.fb_post_id, pageAccessToken),
      fetchPostEngagementCounts(target.fb_post_id, pageAccessToken)
    ])

    await insertSnapshots(
      [...insights, ...engagement].map((point) => ({
        postTargetId: target.id,
        metricName: point.metricName,
        metricValue: point.metricValue,
        period: point.period
      }))
    )
  } catch (err) {
    console.error(`[analytics] snapshot failed for target ${target.id}`, err)
  }
}

export async function snapshotAllPublishedTargets(): Promise<void> {
  const targets = await listTargetsByStatus('published')
  for (const target of targets) {
    await snapshotTarget(target)
  }
}
