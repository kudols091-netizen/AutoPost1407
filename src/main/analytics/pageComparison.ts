export interface PageSnapshotPoint {
  capturedAt: string
  followerCount: number
  pageReach: number | null
}

export interface PostAggregatePoint {
  publishedAt: string
  reach: number
  reactions: number
  comments: number
  shares: number
  clicks: number
}

export interface WindowMetrics {
  followerNetChange: number
  totalPageReach: number | null
  postCount: number
  totalReach: number
  totalReactions: number
  totalComments: number
  totalShares: number
  totalClicks: number
}

export type MetricKey = keyof WindowMetrics

export interface ComparisonResult {
  current: WindowMetrics
  previous: WindowMetrics | null
  pctChange: Partial<Record<MetricKey, number | null>> | 'insufficient-data'
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

const METRIC_KEYS: MetricKey[] = [
  'followerNetChange',
  'totalPageReach',
  'postCount',
  'totalReach',
  'totalReactions',
  'totalComments',
  'totalShares',
  'totalClicks'
]

function windowMetrics(
  pageSnapshots: PageSnapshotPoint[],
  postAggregates: PostAggregatePoint[],
  start: Date,
  end: Date
): WindowMetrics {
  const inWindow = (isoDate: string): boolean => {
    const t = new Date(isoDate).getTime()
    return t > start.getTime() && t <= end.getTime()
  }

  const snapsInWindow = pageSnapshots
    .filter((s) => inWindow(s.capturedAt))
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))

  const followerNetChange =
    snapsInWindow.length >= 2
      ? snapsInWindow[snapsInWindow.length - 1].followerCount - snapsInWindow[0].followerCount
      : 0

  const reachValues = snapsInWindow.map((s) => s.pageReach).filter((v): v is number => v !== null)
  const totalPageReach = reachValues.length > 0 ? reachValues.reduce((a, b) => a + b, 0) : null

  const postsInWindow = postAggregates.filter((p) => inWindow(p.publishedAt))

  return {
    followerNetChange,
    totalPageReach,
    postCount: postsInWindow.length,
    totalReach: postsInWindow.reduce((sum, p) => sum + p.reach, 0),
    totalReactions: postsInWindow.reduce((sum, p) => sum + p.reactions, 0),
    totalComments: postsInWindow.reduce((sum, p) => sum + p.comments, 0),
    totalShares: postsInWindow.reduce((sum, p) => sum + p.shares, 0),
    totalClicks: postsInWindow.reduce((sum, p) => sum + p.clicks, 0)
  }
}

/**
 * Rolling-window comparison anchored on `now`: current = (now - windowDays, now],
 * previous = (now - 2*windowDays, now - windowDays]. Returns 'insufficient-data'
 * instead of a previous window when history doesn't reach back far enough yet
 * (page_snapshots has no backfilled history — it only accumulates going forward).
 */
export function computeComparison(
  pageSnapshots: PageSnapshotPoint[],
  postAggregates: PostAggregatePoint[],
  windowDays: number,
  now: Date
): ComparisonResult {
  const currentStart = new Date(now.getTime() - windowDays * MS_PER_DAY)
  const previousStart = new Date(now.getTime() - 2 * windowDays * MS_PER_DAY)

  const current = windowMetrics(pageSnapshots, postAggregates, currentStart, now)

  const earliestCapturedAt = pageSnapshots.reduce<string | null>((earliest, s) => {
    if (earliest === null || s.capturedAt.localeCompare(earliest) < 0) return s.capturedAt
    return earliest
  }, null)

  const hasEnoughHistory =
    earliestCapturedAt !== null && new Date(earliestCapturedAt).getTime() <= previousStart.getTime()

  if (!hasEnoughHistory) {
    return { current, previous: null, pctChange: 'insufficient-data' }
  }

  const previous = windowMetrics(pageSnapshots, postAggregates, previousStart, currentStart)

  const pctChange: Partial<Record<MetricKey, number | null>> = {}
  for (const key of METRIC_KEYS) {
    const prevValue = previous[key]
    const curValue = current[key]
    pctChange[key] = prevValue === null || curValue === null || prevValue === 0
      ? null
      : ((curValue - prevValue) / Math.abs(prevValue)) * 100
  }

  return { current, previous, pctChange }
}
