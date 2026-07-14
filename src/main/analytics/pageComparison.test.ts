import { describe, expect, it } from 'vitest'
import { computeComparison } from './pageComparison'

function daysAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
}

describe('computeComparison', () => {
  const now = new Date('2026-07-15T12:00:00.000Z')

  it('reports insufficient-data when history is shorter than 2x the window', () => {
    const pageSnapshots = [
      { capturedAt: daysAgo(now, 4), followerCount: 100, pageReach: 500 },
      { capturedAt: daysAgo(now, 2), followerCount: 105, pageReach: 520 },
      { capturedAt: daysAgo(now, 0), followerCount: 110, pageReach: 540 }
    ]
    const result = computeComparison(pageSnapshots, [], 7, now)
    expect(result.previous).toBeNull()
    expect(result.pctChange).toBe('insufficient-data')
    expect(result.current.followerNetChange).toBe(10) // 110 - 100
  })

  it('computes percent change across two full windows', () => {
    const pageSnapshots = [
      { capturedAt: daysAgo(now, 14), followerCount: 80, pageReach: 300 },
      { capturedAt: daysAgo(now, 7), followerCount: 100, pageReach: 400 }, // end of previous window
      { capturedAt: daysAgo(now, 6), followerCount: 102, pageReach: 410 }, // start of current window
      { capturedAt: daysAgo(now, 0), followerCount: 122, pageReach: 450 }
    ]
    const postAggregates = [
      { publishedAt: daysAgo(now, 10), reach: 1000, reactions: 50, comments: 5, shares: 2, clicks: 20 }, // previous window
      { publishedAt: daysAgo(now, 3), reach: 2000, reactions: 150, comments: 15, shares: 6, clicks: 60 } // current window
    ]

    const result = computeComparison(pageSnapshots, postAggregates, 7, now)

    expect(result.previous).not.toBeNull()
    expect(result.current.followerNetChange).toBe(20) // 122 - 102
    expect(result.current.postCount).toBe(1)
    expect(result.current.totalReach).toBe(2000)
    expect(result.previous?.postCount).toBe(1)
    expect(result.pctChange).not.toBe('insufficient-data')
    if (result.pctChange !== 'insufficient-data') {
      expect(result.pctChange.totalReach).toBe(100) // (2000-1000)/1000 * 100
    }
  })

  it('returns null pctChange for a metric whose previous value is zero', () => {
    const pageSnapshots = [
      { capturedAt: daysAgo(now, 20), followerCount: 100, pageReach: null },
      { capturedAt: daysAgo(now, 0), followerCount: 120, pageReach: null }
    ]
    const postAggregates = [
      { publishedAt: daysAgo(now, 3), reach: 500, reactions: 10, comments: 1, shares: 0, clicks: 5 }
    ]

    const result = computeComparison(pageSnapshots, postAggregates, 7, now)
    expect(result.pctChange).not.toBe('insufficient-data')
    if (result.pctChange !== 'insufficient-data') {
      expect(result.pctChange.postCount).toBeNull() // previous window had 0 posts
    }
  })
})
