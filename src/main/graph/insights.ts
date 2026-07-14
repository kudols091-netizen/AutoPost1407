import { graphGet } from './client'

/**
 * Kept as a plain array (not hardcoded into query-building code) since Meta periodically
 * renames/deprecates Insights metrics — swap this list without touching call sites.
 */
export const POST_INSIGHT_METRICS = ['post_engaged_users', 'post_clicks', 'post_impressions']

interface InsightValue {
  value: number | Record<string, number>
}

interface InsightEntry {
  name: string
  period: string
  values: InsightValue[]
}

interface InsightsResponse {
  data: InsightEntry[]
}

export interface MetricPoint {
  metricName: string
  metricValue: number
  period: string
}

function flattenValue(value: number | Record<string, number>): number {
  if (typeof value === 'number') return value
  return Object.values(value).reduce((sum, v) => sum + v, 0)
}

export async function fetchPostInsights(
  fbPostId: string,
  pageAccessToken: string
): Promise<MetricPoint[]> {
  const res = await graphGet<InsightsResponse>(`/${fbPostId}/insights`, {
    metric: POST_INSIGHT_METRICS.join(','),
    access_token: pageAccessToken
  })

  return res.data.flatMap((entry) => {
    const latest = entry.values.at(-1)
    if (!latest) return []
    return [{ metricName: entry.name, metricValue: flattenValue(latest.value), period: entry.period }]
  })
}

interface EngagementCountsResponse {
  comments?: { summary?: { total_count?: number } }
  shares?: { count?: number }
  likes?: { summary?: { total_count?: number } }
}

export async function fetchPostEngagementCounts(
  fbPostId: string,
  pageAccessToken: string
): Promise<MetricPoint[]> {
  const res = await graphGet<EngagementCountsResponse>(`/${fbPostId}`, {
    fields: 'comments.summary(true),shares,likes.summary(true)',
    access_token: pageAccessToken
  })

  const points: MetricPoint[] = []
  if (res.comments?.summary?.total_count !== undefined) {
    points.push({ metricName: 'comments_count', metricValue: res.comments.summary.total_count, period: 'lifetime' })
  }
  if (res.shares?.count !== undefined) {
    points.push({ metricName: 'shares_count', metricValue: res.shares.count, period: 'lifetime' })
  }
  if (res.likes?.summary?.total_count !== undefined) {
    points.push({ metricName: 'likes_count', metricValue: res.likes.summary.total_count, period: 'lifetime' })
  }
  return points
}
