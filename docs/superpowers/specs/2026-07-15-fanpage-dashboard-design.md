# Fanpage Metrics Dashboard — Design Spec

Date: 2026-07-15
Status: Approved by user, pending implementation plan

## Context

AutoPost currently has a per-post analytics view (`Reports.tsx`) that shows a
line chart of a handful of Insights metrics (`post_engaged_users`,
`post_clicks`) plus comment/share/like counts, for a single selected post.
There is no page-level view: no follower count, no follower growth over time,
no period-over-period comparison, and the post list has no reach or
posting-time/content-type breakdown surfaced anywhere.

This spec covers a new **page-level dashboard** feature only. A separate,
independent feature (inbound messages/comments + response-time tracking) was
scoped out of this spec during brainstorming — it requires new webhook/
Conversations API integration and has no code to build on today. It will get
its own design spec later.

## Goals (v1)

- Page info + current follower count
- List of a page's posts
- Per-post reach, reaction (total), comment, share, click counts
- Per-post posting time and content type
- Follower count over time (daily)
- 7-day and 30-day comparison vs. the immediately preceding period of the same
  length

## Non-goals (v1)

- Inbound messages/comments/conversations and response-time metrics (separate
  future spec)
- Reaction breakdown by type (like/love/haha/wow/sad/angry) — total reaction
  count only
- Multi-page aggregate/comparison view — v1 is single-page-at-a-time, matching
  the existing `Reports.tsx` pattern
- Backfilling historical follower/reach data — the Graph API does not expose
  historical daily follower counts, so the follower-history chart starts
  empty and accumulates from the day this feature ships

## Data model

### New table: `page_snapshots`

One row per page per calendar day, upserted (overwritten) if the job runs
again the same day so the row always holds the latest value captured that day.

| column         | type    | notes                                        |
|----------------|---------|-----------------------------------------------|
| id             | integer | PK                                             |
| page_id        | integer | FK → pages.id                                  |
| captured_at    | date    | calendar date (local), unique with page_id     |
| follower_count | integer | from `followers_count`/`fan_count` field       |
| page_reach     | real, nullable | page-level reach insight; null if the page/permission doesn't expose it |
| created_at     | text    | timestamp                                      |

Unique constraint on `(page_id, captured_at)`.

### Existing table: `analytics_snapshots`

No schema change. Add `post_impressions` (post-level reach) to the list of
Insights metrics fetched in `src/main/graph/insights.ts`
(`POST_INSIGHT_METRICS`), stored the same way as the existing
`post_engaged_users`/`post_clicks` rows.

### Reused, unchanged

- `posts.post_type` — content type ("text"/"photo"/"link")
- `post_targets.published_at` — posting time
- `pages` — page name/picture/category

## Data collection

### Page-level snapshot

New function (e.g. `fetchPageSnapshot(pageId)` in `src/main/graph/pageManager.ts`
or a new `pageInsights.ts`):
- Fetches current follower count (`followers_count`/`fan_count` field on
  `/{page-id}`)
- Fetches page-level reach via `/{page-id}/insights` where available; on
  Graph API error or missing permission, stores `page_reach = null` rather
  than failing the whole snapshot

Wired into the existing 5-minute cron tick in
`src/main/scheduler/reconciliation.ts` (no new cron job): for each active
page, check whether a `page_snapshots` row exists for today; if not, fetch and
upsert one. This self-heals regardless of what time of day the app happens to
be running, since the app is not guaranteed to be open at any fixed clock
time. Failures are logged to `system_logs` under a new category
(`'page-snapshot'`), consistent with how `'reconciliation'` and `'analytics'`
failures are already logged, and do not interrupt the rest of the
reconciliation tick.

### Post-level metrics

No scheduling change — `snapshotAllPublishedTargets` already polls every
5 minutes for all published targets. `post_impressions` is simply added to the
metric list already being fetched per target.

## Comparison logic (7-day / 30-day)

Rolling windows anchored on the current date (not calendar week/month):

- **7-day**: current window = last 7 days; comparison window = the preceding
  7 days (days 8–14 back)
- **30-day**: current window = last 30 days; comparison window = the
  preceding 30 days (days 31–60 back)

For each window pair, compute:
- Net follower change (last snapshot in window − first snapshot in window,
  from `page_snapshots`)
- Total page reach in window (sum of `page_reach`, if present)
- Post count in window
- Summed reach/reactions/comments/shares/clicks across posts published in the
  window (latest value per target from `analytics_snapshots`, summed)
- Percent change of each metric vs. the comparison window; if the comparison
  window's value is 0, or if `page_snapshots` history doesn't yet reach back
  2x the window length (14 days for the 7-day view, 60 for the 30-day view —
  a full comparison window requires data for both the current and prior
  period), display "not enough data yet" instead of a misleading percentage
  or divide-by-zero

This logic lives entirely in the IPC handler layer as an aggregation query
over the two existing/new tables — no new table is needed to represent
"periods."

## IPC layer

New handler: `analytics:forPage(pageId)` returning:

```
{
  pageInfo: { name, pictureUrl, category, followerCount },
  followerHistory: [{ date, followerCount }],
  comparison: {
    sevenDay: { current: {...}, previous: {...} | null, pctChange: {...} | 'insufficient-data' },
    thirtyDay: { current: {...}, previous: {...} | null, pctChange: {...} | 'insufficient-data' }
  },
  posts: [{ postId, publishedAt, postType, reach, reactions, comments, shares, clicks }]
}
```

`analytics:forPost` is unchanged; `Reports.tsx` continues to use it as-is.

## Renderer (UI)

New route `/dashboard` (new nav item in `App.tsx`), single-page-at-a-time,
mirroring the page-selection pattern already used in `Reports.tsx`:

- Page picker (dropdown of connected pages)
- Header: picture, name, category, current follower count, %-change badge vs.
  yesterday
- Follower-history line chart (`recharts`, styled consistently with the
  existing chart in `Reports.tsx`)
- Two comparison cards (7-day, 30-day): follower net change, total reach,
  total reactions/comments/shares/clicks, post count, each with % vs. previous
  period or "not enough data yet"
- Sortable post table: posting time, content type, reach, reactions,
  comments, shares, clicks; clicking a row navigates to `Reports.tsx` for that
  post's detailed time-series chart (no duplication of per-post charting)

## Error handling

- Missing/null `page_reach` (permission or API limitation): render "—" in the
  UI rather than 0 or an error state
- Graph API failures during the daily page snapshot: logged to `system_logs`
  (category `'page-snapshot'`), retried automatically on the next 5-minute
  tick since "snapshot exists for today?" check will still be false
- Insufficient history for a comparison window: explicit "not enough data
  yet" state, never a fabricated 0%/∞% change

## Testing

- Unit tests for the 7-day/30-day comparison aggregation logic (window
  boundaries, insufficient-data cases, divide-by-zero guard)
- Unit tests for the daily upsert-if-missing snapshot logic (idempotent
  re-run same day, creates new row on a new day)
- Manual verification in the running app: connect a page, confirm dashboard
  renders with live data, confirm follower history accumulates over multiple
  simulated days (can advance `captured_at` manually in the dev DB to verify
  multi-day charting without waiting for real days to pass)
