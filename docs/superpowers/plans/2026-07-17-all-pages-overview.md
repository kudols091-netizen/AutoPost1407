# All-Pages Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "all connected Pages" overview block (total stat tiles + sortable per-Page comparison table, for a 7-day/30-day window) to the top of the existing `/dashboard` page.

**Architecture:** Purely a renderer-side addition to `src/renderer/src/pages/Dashboard.tsx`. On page load, once the Page list resolves, call the existing `window.api.analytics.forPage(pageId)` once per connected Page in parallel, aggregate the results client-side into stat tiles and a sortable table. No new IPC handler, no backend/DB changes — `analytics:forPage` already reads purely from local SQLite (no live Graph API calls), so calling it N times on every dashboard load is cheap regardless of Page count.

**Tech Stack:** React (renderer), TypeScript, existing `@shared/types` DTOs (`Page`, `PageAnalytics`, `WindowComparisonDto`).

## Global Constraints

- Reference: [docs/superpowers/specs/2026-07-17-all-pages-overview-design.md](../specs/2026-07-17-all-pages-overview-design.md) — the approved design spec.
- No new IPC handler or backend/DB changes — reuse `window.api.analytics.forPage(pageId)` exactly as it exists today.
- The block only renders when `pages.length > 1` (a single connected Page makes the overview redundant with the detail view already below it).
- A Page whose `analytics.forPage` call rejects must not crash the section — it's dropped from totals/table, not surfaced as a page-wide error.
- Clicking a row in the comparison table sets the existing `selectedPageId` state (no new state needed for this — it drives the existing single-page detail section unchanged).
- No new automated tests — `Dashboard.tsx` has no existing test coverage (renderer code in this project is verified by running the app, not unit-tested), consistent with the rest of the file.

---

### Task 1: All-Pages Overview block

**Files:**
- Modify: `src/renderer/src/pages/Dashboard.tsx`
- Modify: `src/renderer/src/styles/global.css`

**Interfaces:**
- Consumes: `window.api.pages.list()`, `window.api.analytics.forPage(pageId): Promise<PageAnalytics>` (both existing, unchanged), `Page`/`PageAnalytics`/`WindowComparisonDto` types from `@shared/types`, the existing `formatPct` helper and `selectedPageId`/`setSelectedPageId` state already in `Dashboard.tsx`.
- Produces: nothing consumed by other tasks — this is the only task in this plan.

- [ ] **Step 1: Add the overview sort type and state**

Edit `src/renderer/src/pages/Dashboard.tsx` — add this type right after the existing `SortKey` type (after line 8, `type SortKey = ...`):

```ts
type OverviewSortKey = 'name' | 'followerCount' | 'followerNetChange' | 'postCount' | 'totalReach' | 'totalReactions'

interface OverviewEntry {
  page: Page
  analytics: PageAnalytics | null
}
```

Add these state declarations inside `Dashboard()`, right after the existing `const [sortAsc, setSortAsc] = useState(false)` line (currently line 55):

```ts
  const [overviewData, setOverviewData] = useState<OverviewEntry[]>([])
  const [isOverviewLoading, setIsOverviewLoading] = useState(false)
  const [overviewWindowDays, setOverviewWindowDays] = useState<7 | 30>(7)
  const [overviewSortKey, setOverviewSortKey] = useState<OverviewSortKey>('followerNetChange')
  const [overviewSortAsc, setOverviewSortAsc] = useState(false)
```

- [ ] **Step 2: Add the data-fetch effect**

Add this effect right after the existing `pages`-loading effect (currently lines 57-62, the one that calls `window.api.pages.list()`), so it runs whenever `pages` changes:

```ts
  useEffect(() => {
    if (pages.length <= 1) {
      setOverviewData([])
      return
    }
    setIsOverviewLoading(true)
    Promise.all(
      pages.map((page) =>
        window.api.analytics
          .forPage(page.id)
          .then((analytics) => ({ page, analytics }))
          .catch(() => ({ page, analytics: null }))
      )
    )
      .then(setOverviewData)
      .finally(() => setIsOverviewLoading(false))
  }, [pages])
```

Note the `.catch(() => ({ page, analytics: null }))` on each individual promise, not on the `Promise.all` — this is what makes one Page's failure not reject the whole batch (Global Constraint: a failed Page is dropped, not a page-wide error).

- [ ] **Step 3: Add the aggregation/derivation useMemo values**

Add these right after the existing `sortedPosts` useMemo (currently ends at line 103, right before `function toggleSort`):

```ts
  const availableOverview = useMemo(
    () => overviewData.filter((entry): entry is OverviewEntry & { analytics: PageAnalytics } => entry.analytics !== null),
    [overviewData]
  )

  const overviewTotals = useMemo(() => {
    const windowKey = overviewWindowDays === 7 ? 'sevenDay' : 'thirtyDay'
    return availableOverview.reduce(
      (acc, { analytics }) => {
        const current = analytics.comparison[windowKey].current
        return {
          followerNetChange: acc.followerNetChange + current.followerNetChange,
          postCount: acc.postCount + current.postCount,
          totalReach: acc.totalReach + current.totalReach,
          totalReactions: acc.totalReactions + current.totalReactions
        }
      },
      { followerNetChange: 0, postCount: 0, totalReach: 0, totalReactions: 0 }
    )
  }, [availableOverview, overviewWindowDays])

  const overviewRows = useMemo(() => {
    const windowKey = overviewWindowDays === 7 ? 'sevenDay' : 'thirtyDay'
    return availableOverview.map(({ page, analytics }) => {
      const comparison = analytics.comparison[windowKey]
      const pct = comparison.pctChange === 'insufficient-data' ? null : comparison.pctChange
      return {
        pageId: page.id,
        name: page.name,
        pictureUrl: page.pictureUrl,
        followerCount: analytics.pageInfo.followerCount,
        followerNetChange: comparison.current.followerNetChange,
        followerPct: pct ? pct.followerNetChange ?? null : null,
        postCount: comparison.current.postCount,
        totalReach: comparison.current.totalReach,
        totalReactions: comparison.current.totalReactions
      }
    })
  }, [availableOverview, overviewWindowDays])

  const sortedOverviewRows = useMemo(() => {
    const rows = [...overviewRows]
    rows.sort((a, b) => {
      const av = a[overviewSortKey]
      const bv = b[overviewSortKey]
      const comparison = typeof av === 'string' ? av.localeCompare(String(bv)) : Number(av ?? 0) - Number(bv ?? 0)
      return overviewSortAsc ? comparison : -comparison
    })
    return rows
  }, [overviewRows, overviewSortKey, overviewSortAsc])
```

- [ ] **Step 4: Add the overview sort toggle functions**

Add these right after the existing `sortIndicator` function (currently lines 114-117, right before the `return (` of the component):

```ts
  function toggleOverviewSort(key: OverviewSortKey): void {
    if (key === overviewSortKey) {
      setOverviewSortAsc(!overviewSortAsc)
    } else {
      setOverviewSortKey(key)
      setOverviewSortAsc(false)
    }
  }

  function overviewSortIndicator(key: OverviewSortKey): string {
    if (key !== overviewSortKey) return ''
    return overviewSortAsc ? ' ▲' : ' ▼'
  }
```

- [ ] **Step 5: Render the overview block**

In the JSX, insert this block right after the `{pages.length === 0 ? (` ... `) : (` opening — i.e., as the first child inside the `<>` fragment for the "pages exist" branch, right before the existing `<div className="dashboard-page-picker">` (currently line 133):

```tsx
          {pages.length > 1 && (
            <div className="overview-all-pages">
              <div className="panel-header">
                <h3>Tổng quan tất cả Page</h3>
                <div className="window-toggle">
                  <button
                    className={overviewWindowDays === 7 ? 'active' : ''}
                    onClick={() => setOverviewWindowDays(7)}
                  >
                    7 ngày
                  </button>
                  <button
                    className={overviewWindowDays === 30 ? 'active' : ''}
                    onClick={() => setOverviewWindowDays(30)}
                  >
                    30 ngày
                  </button>
                </div>
              </div>

              {isOverviewLoading && <p className="hint">Đang tải tổng quan...</p>}

              {!isOverviewLoading && availableOverview.length === 0 && (
                <p className="hint">Không tải được dữ liệu tổng quan.</p>
              )}

              {!isOverviewLoading && availableOverview.length > 0 && (
                <>
                  <div className="stat-tiles">
                    <div className="stat-tile" style={{ ['--tile-color' as string]: 'var(--accent)' }}>
                      <span className="stat-tile-label">FOLLOWER TĂNG RÒNG</span>
                      <span className="stat-tile-value">{overviewTotals.followerNetChange}</span>
                    </div>
                    <div className="stat-tile" style={{ ['--tile-color' as string]: 'var(--success)' }}>
                      <span className="stat-tile-label">SỐ BÀI ĐĂNG</span>
                      <span className="stat-tile-value">{overviewTotals.postCount}</span>
                    </div>
                    <div className="stat-tile" style={{ ['--tile-color' as string]: 'var(--info)' }}>
                      <span className="stat-tile-label">TỔNG REACH</span>
                      <span className="stat-tile-value">{overviewTotals.totalReach}</span>
                    </div>
                    <div className="stat-tile" style={{ ['--tile-color' as string]: 'var(--warning)' }}>
                      <span className="stat-tile-label">TỔNG REACTION</span>
                      <span className="stat-tile-value">{overviewTotals.totalReactions}</span>
                    </div>
                  </div>

                  <table className="target-table overview-table">
                    <thead>
                      <tr>
                        <th onClick={() => toggleOverviewSort('name')}>Page{overviewSortIndicator('name')}</th>
                        <th onClick={() => toggleOverviewSort('followerCount')}>
                          Follower{overviewSortIndicator('followerCount')}
                        </th>
                        <th onClick={() => toggleOverviewSort('followerNetChange')}>
                          Follower tăng ròng{overviewSortIndicator('followerNetChange')}
                        </th>
                        <th onClick={() => toggleOverviewSort('postCount')}>
                          Số bài đăng{overviewSortIndicator('postCount')}
                        </th>
                        <th onClick={() => toggleOverviewSort('totalReach')}>
                          Tổng reach{overviewSortIndicator('totalReach')}
                        </th>
                        <th onClick={() => toggleOverviewSort('totalReactions')}>
                          Tổng reaction{overviewSortIndicator('totalReactions')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedOverviewRows.map((row) => (
                        <tr
                          key={row.pageId}
                          className={row.pageId === selectedPageId ? 'active' : ''}
                          onClick={() => setSelectedPageId(row.pageId)}
                        >
                          <td className="overview-page-cell">
                            {row.pictureUrl && (
                              <img src={row.pictureUrl} alt={row.name} className="overview-page-avatar" />
                            )}
                            {row.name}
                          </td>
                          <td>{row.followerCount ?? '—'}</td>
                          <td>
                            {row.followerNetChange} <span className="pct">{formatPct(row.followerPct)}</span>
                          </td>
                          <td>{row.postCount}</td>
                          <td>{row.totalReach}</td>
                          <td>{row.totalReactions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}

```

- [ ] **Step 6: Add the CSS**

Edit `src/renderer/src/styles/global.css` — add at the end of the file:

```css

/* ---------- All-Pages Overview ---------- */

.overview-all-pages {
  margin-bottom: 2rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--border);
}

.window-toggle {
  display: flex;
  gap: 0.4rem;
}

.window-toggle button {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  color: var(--text-muted);
  padding: 0.35rem 0.85rem;
  font-size: 0.82rem;
  cursor: pointer;
}

.window-toggle button.active {
  background: var(--accent-soft);
  border-color: var(--accent-border);
  color: var(--accent);
}

.overview-table tbody tr {
  cursor: pointer;
}

.overview-table tbody tr.active {
  background: var(--accent-soft);
}

.overview-page-cell {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.overview-page-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
}
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: clean (no type errors).

- [ ] **Step 8: Verify in the running app**

Run: `npm run dev` (remember to `unset ELECTRON_RUN_AS_NODE` first if running in this sandbox). Open the Dashboard.

Expected, with more than one connected Page:
- An "Tổng quan tất cả Page" block appears above the existing Page picker, with a working 7 ngày/30 ngày toggle.
- Total stat tiles show numbers that look like plausible sums across your connected Pages.
- The comparison table lists one row per Page, sortable by clicking any column header.
- Clicking a Page's row updates the existing Page picker/detail section below to that Page (verify the dropdown's selection and detail content below change accordingly).

With only one connected Page (or by temporarily filtering the `pages` array in devtools if you want to test this path without disconnecting a real Page): the overview block does not render at all.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/pages/Dashboard.tsx src/renderer/src/styles/global.css
git commit -m "feat: add all-pages overview to the fanpage dashboard"
```

---

## Post-implementation

```bash
npm run typecheck
```

Expected: clean. Then manually exercise the new overview block end-to-end in the running app (Step 8) before considering this done.
