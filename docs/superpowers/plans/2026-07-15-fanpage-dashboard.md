# Fanpage Metrics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a page-level metrics dashboard (follower count/growth, per-post reach/reaction/comment/share/click, posting time/content type, 7-day and 30-day period comparison) to the AutoPost Electron app.

**Architecture:** A new `page_snapshots` SQLite table (one row per page per day) captures follower count and page reach, populated by piggybacking on the existing 5-minute reconciliation cron (self-healing "snapshot exists for today?" check, no new cron job). A pure, dependency-free comparison module computes 7-day/30-day rolling-window metrics from that table plus the existing `analytics_snapshots` table. A new IPC handler exposes it all as one `analytics:forPage` call, rendered by a new `/dashboard` React route that mirrors the existing `Reports.tsx` page-selection pattern.

**Tech Stack:** TypeScript, Electron (main/preload/renderer), Kysely + better-sqlite3, node-cron, React + react-router-dom, recharts, date-fns, Vitest (new — this project has no test runner yet).

## Global Constraints

- Reference: [docs/superpowers/specs/2026-07-15-fanpage-dashboard-design.md](../specs/2026-07-15-fanpage-dashboard-design.md) — the approved design spec. Every task below implements a section of it.
- No historical backfill: `page_snapshots` starts empty and accumulates only from the day this ships (Graph API cannot provide historical daily follower counts).
- Single-page-at-a-time UI (no multi-page aggregate view) — matches the existing `Reports.tsx` pattern.
- Reaction is a single total count (no per-reaction-type breakdown).
- Follow existing code conventions exactly: snake_case DB columns / camelCase TS, repositories under `src/main/db/repositories/`, DTOs mapped in `src/main/ipc/mappers.ts`, shared types in `src/shared/types.ts`.
- This is the project's first test suite — introduce Vitest minimally (Task 1) and use it only for the two pieces of non-trivial pure logic the spec calls out (date-key formatting, comparison-window math). Everything else follows the existing (untested) repository/IPC/renderer patterns and is verified by running the app.

---

### Task 1: Add Vitest test tooling

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: `npm run test` (runs `vitest run`), available for Task 2's TDD steps.

- [ ] **Step 1: Add the `vitest` devDependency and `test` script**

Edit `package.json`: add `"vitest": "^3.0.0"` to `devDependencies`, and add a `"test"` entry to `scripts`.

```json
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "typecheck:node": "tsc --noEmit -p tsconfig.node.json",
    "typecheck:web": "tsc --noEmit -p tsconfig.web.json",
    "typecheck": "npm run typecheck:node && npm run typecheck:web",
    "test": "vitest run",
    "build:win": "electron-vite build && electron-builder --win",
    "rebuild": "electron-rebuild -f -w better-sqlite3",
    "postinstall": "electron-rebuild -f -w better-sqlite3"
  },
```

Add under `devDependencies` (alongside `typescript`/`vite`):

```json
    "vitest": "^3.0.0",
```

- [ ] **Step 2: Create the Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts']
  }
})
```

- [ ] **Step 3: Install and verify the binary runs**

Run: `npm install`
Expected: `vitest` appears under `node_modules/.bin`, no errors.

Run: `npx vitest --version`
Expected: prints a version number (e.g. `vitest/3.x.x ...`), confirming the tool is installed and runnable. (No test files exist yet — that's expected; Task 2 adds the first ones.)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest for unit testing"
```

---

### Task 2: Pure analytics logic — date-key helper and period comparison

**Files:**
- Create: `src/main/analytics/dateKey.ts`
- Create: `src/main/analytics/dateKey.test.ts`
- Create: `src/main/analytics/pageComparison.ts`
- Create: `src/main/analytics/pageComparison.test.ts`

**Interfaces:**
- Produces: `toDateKey(date: Date): string` — local-calendar-date formatter (`'YYYY-MM-DD'`), consumed by Task 3's `pageSnapshotsRepo.ts` and Task 5's scheduler wiring.
- Produces: `computeComparison(pageSnapshots: PageSnapshotPoint[], postAggregates: PostAggregatePoint[], windowDays: number, now: Date): ComparisonResult`, plus the `PageSnapshotPoint`, `PostAggregatePoint`, `WindowMetrics`, `MetricKey`, `ComparisonResult` types — consumed by Task 6's IPC handler.

This task has no DB/Electron dependency, so it's fully unit-testable — that's the point of introducing Vitest.

- [ ] **Step 1: Write the failing tests for `toDateKey`**

Create `src/main/analytics/dateKey.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { toDateKey } from './dateKey'

describe('toDateKey', () => {
  it('formats a date as local YYYY-MM-DD', () => {
    const date = new Date(2026, 6, 15, 23, 59, 0) // July 15 2026, 23:59 local time
    expect(toDateKey(date)).toBe('2026-07-15')
  })

  it('pads single-digit month and day', () => {
    const date = new Date(2026, 0, 5, 8, 0, 0) // Jan 5 2026
    expect(toDateKey(date)).toBe('2026-01-05')
  })

  it('uses local time, not UTC, near midnight', () => {
    // A naive `date.toISOString().slice(0, 10)` implementation would shift this
    // to the 14th or 16th depending on the machine's UTC offset. toDateKey must not.
    const date = new Date(2026, 6, 15, 0, 30, 0)
    expect(toDateKey(date)).toBe('2026-07-15')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- dateKey`
Expected: FAIL — `Cannot find module './dateKey'` (file doesn't exist yet).

- [ ] **Step 3: Implement `toDateKey`**

Create `src/main/analytics/dateKey.ts`:

```ts
/** Local-calendar-date key (e.g. '2026-07-15') — used to key one page_snapshots row per day. */
export function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test -- dateKey`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing tests for `computeComparison`**

Create `src/main/analytics/pageComparison.test.ts`:

```ts
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
      { capturedAt: daysAgo(now, 14), followerCount: 80, pageReach: 300 }, // exactly satisfies hasEnoughHistory's <= boundary
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
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm run test -- pageComparison`
Expected: FAIL — `Cannot find module './pageComparison'`.

- [ ] **Step 7: Implement `computeComparison`**

Create `src/main/analytics/pageComparison.ts`:

```ts
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
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npm run test -- pageComparison`
Expected: PASS (3 tests).

- [ ] **Step 9: Run the full suite and typecheck**

Run: `npm run test && npm run typecheck`
Expected: all tests PASS, typecheck clean.

- [ ] **Step 10: Commit**

```bash
git add src/main/analytics
git commit -m "feat: add pure date-key and period-comparison logic for the dashboard"
```

---

### Task 3: `page_snapshots` table and repositories

**Files:**
- Modify: `src/main/db/schema.ts`
- Create: `src/main/db/migrations/005_page_snapshots.ts`
- Modify: `src/main/db/migrations/index.ts`
- Create: `src/main/db/repositories/pageSnapshotsRepo.ts`
- Modify: `src/main/db/repositories/analyticsRepo.ts`

**Interfaces:**
- Consumes: `toDateKey` (Task 2, used indirectly by callers, not by this file itself).
- Produces: `upsertPageSnapshot(snapshot: NewPageSnapshot): Promise<void>`, `hasSnapshotForToday(pageId: number, todayDate: string): Promise<boolean>`, `listSnapshotsForPage(pageId: number)` — consumed by Task 5 (scheduler) and Task 6 (IPC handler).
- Produces: `listPagePostAnalytics(pageId: number): Promise<PagePostAnalyticsRow[]>` (added to `analyticsRepo.ts`) — consumed by Task 6.

No unit tests here — this project's DB repositories are thin Kysely wrappers with no existing test coverage (see `analyticsRepo.ts`, `pagesRepo.ts`, `postsRepo.ts`), and `connection.ts` requires an Electron `app` context, so this task is verified by running the real app (Step 6).

- [ ] **Step 1: Add `PageSnapshotsTable` to the schema**

Edit `src/main/db/schema.ts` — add this interface after `AnalyticsSnapshotsTable` (after line 53):

```ts
export interface PageSnapshotsTable {
  id: Generated<number>
  page_id: number
  captured_at: string
  follower_count: number
  page_reach: number | null
  created_at: Generated<string>
}
```

And add it to the `Database` interface (currently lines 83-92):

```ts
export interface Database {
  pages: PagesTable
  posts: PostsTable
  media_assets: MediaAssetsTable
  post_targets: PostTargetsTable
  analytics_snapshots: AnalyticsSnapshotsTable
  page_snapshots: PageSnapshotsTable
  app_settings: AppSettingsTable
  system_logs: SystemLogsTable
  interaction_tasks: InteractionTasksTable
}
```

- [ ] **Step 2: Create the migration**

Create `src/main/db/migrations/005_page_snapshots.ts`:

```ts
import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('page_snapshots')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('page_id', 'integer', (col) =>
      col.notNull().references('pages.id').onDelete('cascade')
    )
    .addColumn('captured_at', 'text', (col) => col.notNull())
    .addColumn('follower_count', 'integer', (col) => col.notNull())
    .addColumn('page_reach', 'real')
    .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addUniqueConstraint('uq_page_snapshots_page_date', ['page_id', 'captured_at'])
    .execute()

  await db.schema
    .createIndex('idx_page_snapshots_page')
    .on('page_snapshots')
    .column('page_id')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('page_snapshots').ifExists().execute()
}
```

- [ ] **Step 3: Register the migration**

Edit `src/main/db/migrations/index.ts`:

```ts
import type { Migration, MigrationProvider } from 'kysely/migration'
import * as m001 from './001_initial'
import * as m002 from './002_system_logs'
import * as m003 from './003_interactions'
import * as m004 from './004_user_token'
import * as m005 from './005_page_snapshots'

const migrations: Record<string, Migration> = {
  '001_initial': m001,
  '002_system_logs': m002,
  '003_interactions': m003,
  '004_user_token': m004,
  '005_page_snapshots': m005
}

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations
  }
}
```

- [ ] **Step 4: Create the page snapshots repository**

Create `src/main/db/repositories/pageSnapshotsRepo.ts`:

```ts
import { getDb } from '../connection'

export interface NewPageSnapshot {
  pageId: number
  capturedAt: string
  followerCount: number
  pageReach: number | null
}

/** Upserts (not inserts) so re-running the same day always holds the latest captured value. */
export async function upsertPageSnapshot(snapshot: NewPageSnapshot): Promise<void> {
  const db = getDb()

  await db
    .insertInto('page_snapshots')
    .values({
      page_id: snapshot.pageId,
      captured_at: snapshot.capturedAt,
      follower_count: snapshot.followerCount,
      page_reach: snapshot.pageReach
    })
    .onConflict((oc) =>
      oc.columns(['page_id', 'captured_at']).doUpdateSet({
        follower_count: snapshot.followerCount,
        page_reach: snapshot.pageReach
      })
    )
    .execute()
}

export async function hasSnapshotForToday(pageId: number, todayDate: string): Promise<boolean> {
  const db = getDb()
  const row = await db
    .selectFrom('page_snapshots')
    .select('id')
    .where('page_id', '=', pageId)
    .where('captured_at', '=', todayDate)
    .executeTakeFirst()
  return row !== undefined
}

export async function listSnapshotsForPage(pageId: number) {
  const db = getDb()
  return db
    .selectFrom('page_snapshots')
    .selectAll()
    .where('page_id', '=', pageId)
    .orderBy('captured_at', 'asc')
    .execute()
}
```

- [ ] **Step 5: Add `listPagePostAnalytics` to `analyticsRepo.ts`**

Edit `src/main/db/repositories/analyticsRepo.ts` — add at the end of the file:

```ts

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
```

- [ ] **Step 6: Verify by running the app and inspecting the DB**

Run: `npm run typecheck`
Expected: clean (no type errors from the new table/repo).

Run: `npm run dev`, let it start, then stop it (Ctrl+C or close the window) after a few seconds — this applies the new migration on startup.
Expected console output includes no `[db] migration "005_page_snapshots" failed` line.

Inspect the table exists (adjust the path if `userData` differs on your machine):

```bash
node -e "const Database = require('better-sqlite3'); const db = new Database(process.env.APPDATA + '/autopost/autopost.db'); console.log(db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name='page_snapshots'\").all())"
```

Expected: prints `[ { name: 'page_snapshots' } ]`.

- [ ] **Step 7: Commit**

```bash
git add src/main/db
git commit -m "feat: add page_snapshots table and repositories"
```

---

### Task 4: Graph API — page follower/reach fetch and post reach metric

**Files:**
- Modify: `src/main/graph/pageManager.ts`
- Modify: `src/main/graph/insights.ts`

**Interfaces:**
- Produces: `fetchPageFollowerAndReach(pageFbId: string, token: string): Promise<PageSnapshotData>` (added to `pageManager.ts`) — consumed by Task 5.
- No new exports from `insights.ts` — `post_impressions` is added to the existing `POST_INSIGHT_METRICS` list, so `fetchPostInsights`'s existing return shape (`MetricPoint[]`) now includes it automatically; `analyticsRepo.ts`'s `listPagePostAnalytics` (Task 3) already reads `post_impressions` by name.

- [ ] **Step 1: Add `post_impressions` to the post insight metrics**

Edit `src/main/graph/insights.ts` line 7:

```ts
export const POST_INSIGHT_METRICS = ['post_engaged_users', 'post_clicks', 'post_impressions']
```

- [ ] **Step 2: Add the page follower/reach fetch**

Edit `src/main/graph/pageManager.ts` — add at the end of the file:

```ts

/**
 * Kept as a plain array (matches the convention in graph/insights.ts) since Meta
 * periodically renames/deprecates Page Insights metrics.
 */
export const PAGE_INSIGHT_METRICS = ['page_impressions_unique']

export interface PageSnapshotData {
  followerCount: number
  pageReach: number | null
}

interface PageFollowerResponse {
  followers_count?: number
}

interface PageInsightsResponse {
  data: Array<{ name: string; values: Array<{ value: number }> }>
}

/**
 * Fetches current follower count and (if the page/permission allows it) reach.
 * `pageReach` is null on any Insights failure rather than throwing, since not every
 * connected Page has the permission/feature required for page-level Insights.
 */
export async function fetchPageFollowerAndReach(pageFbId: string, token: string): Promise<PageSnapshotData> {
  const followerRes = await graphGet<PageFollowerResponse>(`/${pageFbId}`, {
    access_token: token,
    fields: 'followers_count'
  })

  let pageReach: number | null = null
  try {
    const insightsRes = await graphGet<PageInsightsResponse>(`/${pageFbId}/insights`, {
      access_token: token,
      metric: PAGE_INSIGHT_METRICS.join(','),
      period: 'day'
    })
    const latest = insightsRes.data[0]?.values.at(-1)
    if (latest) pageReach = latest.value
  } catch (err) {
    console.error(`[page-snapshot] reach fetch failed for ${pageFbId}`, err)
  }

  return { followerCount: followerRes.followers_count ?? 0, pageReach }
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/main/graph
git commit -m "feat: fetch page follower count and reach from the Graph API"
```

---

### Task 5: Wire the daily page snapshot into the reconciliation scheduler

**Files:**
- Modify: `src/main/scheduler/reconciliation.ts`

**Interfaces:**
- Consumes: `toDateKey` (Task 2), `hasSnapshotForToday` / `upsertPageSnapshot` (Task 3), `fetchPageFollowerAndReach` (Task 4), `listPages` (existing, `pagesRepo.ts`), `addSystemLog` (existing).
- Produces: nothing new consumed elsewhere — this is the scheduling glue.

- [ ] **Step 1: Import the new dependencies**

Edit `src/main/scheduler/reconciliation.ts` — update the import block (lines 1-16):

```ts
import cron, { type ScheduledTask } from 'node-cron'
import { getPageById, listPages } from '../db/repositories/pagesRepo'
import {
  listPostsByStatus,
  listTargetsByStatus,
  listTargetsForPost,
  updatePostStatus,
  updateTarget
} from '../db/repositories/postsRepo'
import { hasSnapshotForToday, upsertPageSnapshot } from '../db/repositories/pageSnapshotsRepo'
import { decryptToken } from '../security/safeStorage'
import { getPostPublishStatus } from '../graph/posts'
import { fetchPageFollowerAndReach } from '../graph/pageManager'
import { submitPostTargets } from '../posting/submitPost'
import { snapshotAllPublishedTargets, snapshotTarget } from './analyticsPoller'
import { addSystemLog } from '../db/repositories/systemLogsRepo'
import { listPendingDueTasks } from '../db/repositories/interactionsRepo'
import { executeInteractionTask } from '../posting/executeInteraction'
import { toDateKey } from '../analytics/dateKey'
```

- [ ] **Step 2: Add the daily snapshot function**

Edit `src/main/scheduler/reconciliation.ts` — add this function after `syncScheduledTargets` (after line 63, before `executePendingInteractions`):

```ts
/**
 * Captures one page_snapshots row per page per calendar day. Self-healing: checks
 * "does today already have a row?" rather than relying on a fixed cron time, since
 * the app isn't guaranteed to be running at any particular clock time.
 */
async function snapshotPagesIfDue(): Promise<void> {
  const today = toDateKey(new Date())
  const pages = await listPages()

  for (const page of pages) {
    if (!page.is_active || page.token_status === 'needs_reauth') continue

    const already = await hasSnapshotForToday(page.id, today)
    if (already) continue

    try {
      const token = decryptToken(page.access_token_enc)
      const { followerCount, pageReach } = await fetchPageFollowerAndReach(page.fb_page_id, token)
      await upsertPageSnapshot({ pageId: page.id, capturedAt: today, followerCount, pageReach })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[reconciliation] page snapshot failed for page ${page.id}`, err)
      await addSystemLog({
        level: 'error',
        category: 'page-snapshot',
        message: `Chụp chỉ số Page "${page.name}" thất bại`,
        detail: message
      })
    }
  }
}
```

- [ ] **Step 3: Wire it into the cron run**

Edit `src/main/scheduler/reconciliation.ts` — update the `run` function inside `startReconciliationScheduler` (currently lines 103-114):

```ts
  const run = async (): Promise<void> => {
    try {
      await resubmitDraftPosts()
      await syncScheduledTargets()
      await snapshotAllPublishedTargets()
      await snapshotPagesIfDue()
      await executePendingInteractions()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('[reconciliation] run failed', err)
      await addSystemLog({ level: 'error', category: 'reconciliation', message: 'Chu kỳ đồng bộ thất bại', detail: message })
    }
  }
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Verify by running the app**

Run: `npm run dev`. If you have at least one connected Page, wait for the startup reconciliation run to complete (it fires once immediately, per `startReconciliationScheduler`'s comment on line 116-117 in the current file).

Check for a new row:

```bash
node -e "const Database = require('better-sqlite3'); const db = new Database(process.env.APPDATA + '/autopost/autopost.db'); console.log(db.prepare('SELECT * FROM page_snapshots').all())"
```

Expected: at least one row per connected, non-`needs_reauth` Page, with today's date and a `follower_count`.

Run it again (restart `npm run dev`, or just wait for the next 5-minute tick) — the row count for today should stay the same (upsert, not insert), only `follower_count`/`page_reach` values may update.

- [ ] **Step 6: Commit**

```bash
git add src/main/scheduler
git commit -m "feat: capture a daily page snapshot in the reconciliation cron"
```

---

### Task 6: `analytics:forPage` IPC handler

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/ipc/handlers.ts`
- Modify: `src/preload/index.ts`

**Interfaces:**
- Consumes: `getPageById` (existing), `listSnapshotsForPage` (Task 3), `listPagePostAnalytics` (Task 3), `computeComparison` + `PageSnapshotPoint` + `PostAggregatePoint` (Task 2).
- Produces: shared type `PageAnalytics` and IPC channel `analytics:forPage`, exposed on `window.api.analytics.forPage(pageId)` — consumed by Task 7's `Dashboard.tsx`.

- [ ] **Step 1: Add shared DTOs**

Edit `src/shared/types.ts` — add at the end of the file:

```ts

export interface PageFollowerPoint {
  date: string
  followerCount: number
}

export interface WindowMetricsDto {
  followerNetChange: number
  totalPageReach: number | null
  postCount: number
  totalReach: number
  totalReactions: number
  totalComments: number
  totalShares: number
  totalClicks: number
}

export interface WindowComparisonDto {
  current: WindowMetricsDto
  previous: WindowMetricsDto | null
  pctChange: Partial<Record<keyof WindowMetricsDto, number | null>> | 'insufficient-data'
}

export interface PagePostAnalytics {
  postId: number
  postType: PostType
  publishedAt: string
  reach: number
  reactions: number
  comments: number
  shares: number
  clicks: number
}

export interface PageAnalytics {
  pageInfo: {
    name: string
    pictureUrl: string | null
    category: string | null
    followerCount: number | null
  }
  followerHistory: PageFollowerPoint[]
  comparison: {
    sevenDay: WindowComparisonDto
    thirtyDay: WindowComparisonDto
  }
  posts: PagePostAnalytics[]
}
```

Note: `computeComparison`'s `ComparisonResult` (Task 2) is already camelCase and field-for-field identical to `WindowComparisonDto` — no separate mapper function is needed, it's passed straight through and typed as the DTO.

- [ ] **Step 2: Add the IPC handler**

Edit `src/main/ipc/handlers.ts` — add these imports (alongside the existing ones near the top of the file):

```ts
import type { PageAnalytics } from '@shared/types'
import { listPagePostAnalytics, listSnapshotsForTarget } from '../db/repositories/analyticsRepo'
import { listSnapshotsForPage } from '../db/repositories/pageSnapshotsRepo'
import { computeComparison, type PageSnapshotPoint, type PostAggregatePoint } from '../analytics/pageComparison'
```

(Note: `listSnapshotsForTarget` is already imported on line 16 today — merge it into the same `analyticsRepo` import rather than duplicating the line, and add `PageAnalytics` to the existing `@shared/types` import on line 4 rather than a new line.)

Add the handler inside `registerIpcHandlers()`, directly after the existing `analytics:forPost` handler (after line 158):

```ts
  ipcMain.handle('analytics:forPage', async (_event, pageId: number): Promise<PageAnalytics> => {
    const page = await getPageById(pageId)
    if (!page) throw new Error(`Page ${pageId} not found`)

    const snapshots = await listSnapshotsForPage(pageId)
    const postRows = await listPagePostAnalytics(pageId)

    const followerHistory = snapshots.map((s) => ({ date: s.captured_at, followerCount: s.follower_count }))
    const latestSnapshot = snapshots.at(-1) ?? null

    const pageSnapshotPoints: PageSnapshotPoint[] = snapshots.map((s) => ({
      capturedAt: s.captured_at,
      followerCount: s.follower_count,
      pageReach: s.page_reach
    }))
    const postAggregates: PostAggregatePoint[] = postRows.map((r) => ({
      publishedAt: r.publishedAt,
      reach: r.reach,
      reactions: r.reactions,
      comments: r.comments,
      shares: r.shares,
      clicks: r.clicks
    }))

    const now = new Date()

    return {
      pageInfo: {
        name: page.name,
        pictureUrl: page.picture_url,
        category: page.category,
        followerCount: latestSnapshot?.follower_count ?? null
      },
      followerHistory,
      comparison: {
        sevenDay: computeComparison(pageSnapshotPoints, postAggregates, 7, now),
        thirtyDay: computeComparison(pageSnapshotPoints, postAggregates, 30, now)
      },
      posts: postRows.map((r) => ({
        postId: r.postId,
        postType: r.postType as PageAnalytics['posts'][number]['postType'],
        publishedAt: r.publishedAt,
        reach: r.reach,
        reactions: r.reactions,
        comments: r.comments,
        shares: r.shares,
        clicks: r.clicks
      }))
    }
  })
```

- [ ] **Step 3: Expose it on the preload API**

Edit `src/preload/index.ts` — update the `PageAnalytics` type import (add to the existing `@shared/types` import on line 2) and the `analytics` block:

```ts
import type { AppInfo, InteractionTask, Page, PageAnalytics, PageDetails, PostAnalytics, PostDetail, SystemLog } from '@shared/types'
```

```ts
  analytics: {
    forPost: (postId: number): Promise<PostAnalytics> => ipcRenderer.invoke('analytics:forPost', postId),
    forPage: (pageId: number): Promise<PageAnalytics> => ipcRenderer.invoke('analytics:forPage', pageId)
  },
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Verify by running the app**

Run: `npm run dev`. Open the Electron DevTools console (Ctrl+Shift+I) and run:

```js
await window.api.pages.list().then(p => window.api.analytics.forPage(p[0].id))
```

Expected: resolves to an object with `pageInfo`, `followerHistory`, `comparison.sevenDay`/`comparison.thirtyDay`, and `posts` — no thrown error.

- [ ] **Step 6: Commit**

```bash
git add src/shared src/main/ipc src/preload
git commit -m "feat: add analytics:forPage IPC handler"
```

---

### Task 7: Dashboard page (renderer)

**Files:**
- Create: `src/renderer/src/pages/Dashboard.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/Icons.tsx`
- Modify: `src/renderer/src/styles/global.css`

**Interfaces:**
- Consumes: `window.api.pages.list()` (existing), `window.api.analytics.forPage(pageId)` (Task 6), shared types `Page`, `PageAnalytics`, `PagePostAnalytics` (Task 6 / existing).

- [ ] **Step 1: Add a dashboard nav icon**

Edit `src/renderer/src/components/Icons.tsx` — add at the end of the file:

```tsx

export function IconGauge(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4.5 19a8 8 0 1 1 15 0" />
      <path d="M12 12 15 8" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}
```

- [ ] **Step 2: Create the Dashboard page**

Create `src/renderer/src/pages/Dashboard.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { format } from 'date-fns'
import type { Page, PageAnalytics, PagePostAnalytics, WindowComparisonDto } from '@shared/types'
import { IconGauge, IconInbox } from '../components/Icons'

type SortKey = 'publishedAt' | 'postType' | 'reach' | 'reactions' | 'comments' | 'shares' | 'clicks'

function formatPct(value: number | null): string {
  if (value === null) return '—'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

function ComparisonCard({ title, comparison }: { title: string; comparison: WindowComparisonDto }): JSX.Element {
  const insufficient = comparison.pctChange === 'insufficient-data'
  // Plain `insufficient ? null : comparison.pctChange` fails tsc's strict mode (TS7053) —
  // the 'insufficient-data' literal doesn't narrow away through this assignment pattern.
  const pct = insufficient
    ? null
    : (comparison.pctChange as Partial<Record<keyof WindowComparisonDto['current'], number | null>>)

  const rows: Array<{ label: string; value: number | null; key: keyof WindowComparisonDto['current'] }> = [
    { label: 'Follower tăng ròng', value: comparison.current.followerNetChange, key: 'followerNetChange' },
    { label: 'Số bài đăng', value: comparison.current.postCount, key: 'postCount' },
    { label: 'Tổng reach', value: comparison.current.totalReach, key: 'totalReach' },
    { label: 'Tổng reaction', value: comparison.current.totalReactions, key: 'totalReactions' },
    { label: 'Tổng comment', value: comparison.current.totalComments, key: 'totalComments' },
    { label: 'Tổng share', value: comparison.current.totalShares, key: 'totalShares' },
    { label: 'Tổng click', value: comparison.current.totalClicks, key: 'totalClicks' }
  ]

  return (
    <div className="comparison-card">
      <h4>{title}</h4>
      {insufficient && <p className="hint">Chưa đủ dữ liệu để so sánh kỳ trước.</p>}
      <ul className="comparison-metrics">
        {rows.map((row) => (
          <li key={row.key}>
            <span>{row.label}</span>
            <strong>{row.value ?? '—'}</strong>
            {!insufficient && <span className="pct">{formatPct(pct ? pct[row.key] ?? null : null)}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Dashboard(): JSX.Element {
  const navigate = useNavigate()
  const [pages, setPages] = useState<Page[]>([])
  const [selectedPageId, setSelectedPageId] = useState<number | null>(null)
  const [analytics, setAnalytics] = useState<PageAnalytics | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('publishedAt')
  const [sortAsc, setSortAsc] = useState(false)

  useEffect(() => {
    window.api.pages.list().then((list) => {
      setPages(list)
      if (list.length > 0) setSelectedPageId(list[0].id)
    })
  }, [])

  useEffect(() => {
    if (selectedPageId === null) {
      setAnalytics(null)
      return
    }
    setIsLoading(true)
    window.api.analytics
      .forPage(selectedPageId)
      .then(setAnalytics)
      .finally(() => setIsLoading(false))
  }, [selectedPageId])

  const followerChartData = useMemo(() => {
    if (!analytics) return []
    return analytics.followerHistory.map((point) => ({
      ...point,
      label: format(new Date(point.date), 'MMM d')
    }))
  }, [analytics])

  const sortedPosts = useMemo(() => {
    if (!analytics) return []
    const posts = [...analytics.posts]
    posts.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      const comparison = typeof av === 'string' ? av.localeCompare(String(bv)) : Number(av) - Number(bv)
      return sortAsc ? comparison : -comparison
    })
    return posts
  }, [analytics, sortKey, sortAsc])

  function toggleSort(key: SortKey): void {
    if (key === sortKey) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(false)
    }
  }

  function sortIndicator(key: SortKey): string {
    if (key !== sortKey) return ''
    return sortAsc ? ' ▲' : ' ▼'
  }

  return (
    <section className="fanpage-dashboard">
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>Chỉ số tổng quan của fanpage: follower, reach và hiệu quả bài đăng.</p>
      </div>

      {pages.length === 0 ? (
        <div className="empty-state">
          <IconGauge width={22} height={22} />
          <p>Chưa có Page nào được kết nối. Vào Pages để kết nối fanpage đầu tiên.</p>
        </div>
      ) : (
        <>
          <div className="dashboard-page-picker">
            <select value={selectedPageId ?? ''} onChange={(e) => setSelectedPageId(Number(e.target.value))}>
              {pages.map((page) => (
                <option key={page.id} value={page.id}>
                  {page.name}
                </option>
              ))}
            </select>
          </div>

          {isLoading && <p className="hint">Đang tải...</p>}

          {!isLoading && analytics && (
            <>
              <div className="dashboard-page-header">
                {analytics.pageInfo.pictureUrl && (
                  <img src={analytics.pageInfo.pictureUrl} alt={analytics.pageInfo.name} className="page-avatar" />
                )}
                <div>
                  <h3>{analytics.pageInfo.name}</h3>
                  <p className="hint">{analytics.pageInfo.category ?? 'Chưa rõ lĩnh vực'}</p>
                </div>
                <div className="stat-tile" style={{ ['--tile-color' as string]: 'var(--accent)' }}>
                  <span className="stat-tile-label">FOLLOWER</span>
                  <span className="stat-tile-value">{analytics.pageInfo.followerCount ?? '—'}</span>
                </div>
              </div>

              <div className="chart-block">
                <h4>Follower theo ngày</h4>
                {followerChartData.length === 0 ? (
                  <p className="hint">Chưa có dữ liệu — sẽ tích lũy dần từ hôm nay.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={followerChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#242835" />
                      <XAxis dataKey="label" stroke="#656d7d" fontSize={12} />
                      <YAxis stroke="#656d7d" fontSize={12} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: '#171b24', border: '1px solid #242835', borderRadius: 8 }} />
                      <Line type="monotone" dataKey="followerCount" stroke="#5b93f0" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="comparison-cards">
                <ComparisonCard title="7 ngày gần nhất" comparison={analytics.comparison.sevenDay} />
                <ComparisonCard title="30 ngày gần nhất" comparison={analytics.comparison.thirtyDay} />
              </div>

              <div className="panel-header">
                <h3>Danh sách bài đăng</h3>
              </div>

              {sortedPosts.length === 0 ? (
                <div className="empty-state">
                  <IconInbox width={20} height={20} />
                  <p>Page này chưa có bài đăng nào được publish.</p>
                </div>
              ) : (
                <table className="target-table post-table">
                  <thead>
                    <tr>
                      <th onClick={() => toggleSort('publishedAt')}>Thời gian đăng{sortIndicator('publishedAt')}</th>
                      <th onClick={() => toggleSort('postType')}>Loại nội dung{sortIndicator('postType')}</th>
                      <th onClick={() => toggleSort('reach')}>Reach{sortIndicator('reach')}</th>
                      <th onClick={() => toggleSort('reactions')}>Reaction{sortIndicator('reactions')}</th>
                      <th onClick={() => toggleSort('comments')}>Comment{sortIndicator('comments')}</th>
                      <th onClick={() => toggleSort('shares')}>Share{sortIndicator('shares')}</th>
                      <th onClick={() => toggleSort('clicks')}>Click{sortIndicator('clicks')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPosts.map((post: PagePostAnalytics) => (
                      <tr key={post.postId} onClick={() => navigate(`/reports?postId=${post.postId}`)}>
                        <td>{post.publishedAt ? format(new Date(post.publishedAt), 'MMM d, HH:mm') : '—'}</td>
                        <td>{post.postType}</td>
                        <td>{post.reach}</td>
                        <td>{post.reactions}</td>
                        <td>{post.comments}</td>
                        <td>{post.shares}</td>
                        <td>{post.clicks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}

export default Dashboard
```

- [ ] **Step 3: Register the route and nav link**

Edit `src/renderer/src/App.tsx`:

Add the import (alongside the other page imports, after line 9 `import Reports from './pages/Reports'`):

```tsx
import Dashboard from './pages/Dashboard'
```

Add `IconGauge` to the icon import (line 4):

```tsx
import { IconCalendar, IconChart, IconEdit, IconGauge, IconGear, IconHeart, IconHome, IconLayers, IconLogs } from './components/Icons'
```

Add the nav link, directly before the existing "Báo cáo" link (before line 51):

```tsx
            <NavLink to="/dashboard" className="nav-link">
              <IconGauge /> Dashboard
            </NavLink>
```

Add the route, directly before the existing `/reports` route (before line 71):

```tsx
            <Route path="/dashboard" element={<Dashboard />} />
```

- [ ] **Step 4: Add dashboard styles**

Edit `src/renderer/src/styles/global.css` — add at the end of the file:

```css

/* ---------- Dashboard (fanpage) ---------- */

.dashboard-page-picker {
  margin-bottom: 1rem;
}

.dashboard-page-picker select {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  color: var(--text);
  padding: 0.5rem 0.75rem;
  font-size: 0.9rem;
}

.dashboard-page-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.dashboard-page-header .page-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
}

.dashboard-page-header > div:nth-child(2) {
  flex: 1;
}

.comparison-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1rem;
  margin: 1.25rem 0;
}

.comparison-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 1rem 1.25rem;
}

.comparison-card h4 {
  margin: 0 0 0.75rem;
  font-size: 0.95rem;
}

.comparison-metrics {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.comparison-metrics li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.comparison-metrics strong {
  color: var(--text);
  font-size: 0.95rem;
}

.comparison-metrics .pct {
  color: var(--text-faint);
  font-size: 0.8rem;
  min-width: 3.5rem;
  text-align: right;
}

.post-table th {
  cursor: pointer;
  user-select: none;
}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 6: Verify in the running app**

Run: `npm run dev`. In the app window, click "Dashboard" in the sidebar.
Expected: the page picker shows connected Pages; selecting one shows the header (avatar/name/category/follower count), the follower-history chart (empty state if no history yet), the two 7-day/30-day comparison cards, and the post table. Clicking a post row navigates to `/reports?postId=...` and shows that post's detail chart (existing `Reports.tsx` behavior).

- [ ] **Step 7: Commit**

```bash
git add src/renderer
git commit -m "feat: add fanpage dashboard page"
```

---

## Post-implementation

After all 7 tasks are committed, run the full verification pass:

```bash
npm run typecheck
npm run test
```

Expected: both clean/passing. Then manually exercise the dashboard end-to-end in the running app (Task 7, Step 6) before considering the feature done.
