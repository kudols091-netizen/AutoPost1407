# All-Pages Overview — Design Spec

Date: 2026-07-17
Status: Approved by user, pending implementation plan

## Context

The `/dashboard` page (`src/renderer/src/pages/Dashboard.tsx`) currently shows
metrics for one selected Page at a time: header/follower stat, follower-history
chart, 7-day/30-day comparison cards, and a post table. This was an explicit
v1 non-goal in the original design spec
([2026-07-15-fanpage-dashboard-design.md](2026-07-15-fanpage-dashboard-design.md)):
"Multi-page aggregate/comparison view — v1 is single-page-at-a-time." With
multiple Pages now connected and in daily use, the user wants a combined view
across all of them without having to flip through each Page individually.

## Goal

Add an "all Pages overview" block to the top of the existing `/dashboard`
page — total stat tiles across every connected Page, plus a sortable
comparison table (one row per Page) — for a chosen 7-day/30-day window. The
existing single-page detail section below is unchanged.

## Non-goals

- No new IPC handler or backend/DB changes. Every number here is already
  produced by the existing `analytics:forPage(pageId)` handler
  ([2026-07-15-fanpage-dashboard-design.md](2026-07-15-fanpage-dashboard-design.md)'s
  IPC layer) — this feature calls it once per connected Page and
  aggregates/tabulates the results client-side. `analytics:forPage` only reads
  local SQLite data (no live Graph API calls), so calling it once per Page on
  every dashboard load is cheap and safe regardless of Page count.
- No per-reaction-type breakdown, no historical backfill, no new comparison
  math — reuses `WindowComparisonDto`/`computeComparison` output as-is.

## Data flow

On mount (same effect that already calls `window.api.pages.list()`), once the
Page list resolves, fire `window.api.analytics.forPage(page.id)` for every
Page via `Promise.all`. Each call is independently wrapped so one Page's
failure (e.g. a stale/reauth-needed token causing empty data) does not reject
the whole batch — collect `{ page, analytics }` pairs, marking a Page's entry
as unavailable if its call rejects, and skip unavailable Pages in the
table/totals rather than crashing the section.

This is a second, independent data load from the existing single-page
`selectedPageId` effect — the two do not share state or interfere with each
other.

## UI

New block rendered above the existing `dashboard-page-picker` div, only when
`pages.length > 1` (with exactly one connected Page, an all-pages overview is
redundant with the detail view below it and is skipped).

- **Window toggle**: two buttons, "7 ngày" / "30 ngày" (local state
  `overviewWindowDays: 7 | 30`), styled as a small segmented control. Drives
  both the stat tiles and the table below.
- **Total stat tiles** (reusing the existing `.stat-tile` styling): Tổng
  follower tăng ròng, Tổng bài đăng, Tổng reach, Tổng reaction — each the sum
  of that metric's `current` value (for the selected window) across every
  available Page's `analytics:forPage` result.
- **Comparison table** (reusing `.target-table` styling, sortable like the
  existing post table): one row per available Page — Tên Page (+ avatar),
  Follower hiện tại, Follower tăng ròng (with %, "—" if insufficient-data for
  that Page), Số bài đăng, Tổng reach, Tổng reaction, for the selected window.
- **Row click**: clicking a Page's row sets `selectedPageId` to that Page's
  id, which the existing detail section below already reacts to — no new
  state needed beyond calling the existing setter.
- Pages that failed to load are omitted from totals and the table; if this
  ever means zero Pages are available, show the same empty/hint treatment as
  other empty states in this file (e.g. "Không tải được dữ liệu tổng quan.").

## Testing

Purely renderer/aggregation logic with no new backend surface, consistent
with the rest of `Dashboard.tsx` (which has no test coverage — verified by
running the app, per the original spec's established pattern for renderer
code). No new automated tests planned for this feature.
