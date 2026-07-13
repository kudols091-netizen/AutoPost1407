import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import type { Page, PostDetail, PostStatus } from '@shared/types'
import { IconAlert, IconChart, IconInbox, IconPlus, IconRefresh, IconSearch, IconTrash } from '../components/Icons'

type FilterKey = PostStatus | 'all'

const FILTER_TABS: Array<{ key: FilterKey; label: string }> = [
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'draft', label: 'Waiting' },
  { key: 'publishing', label: 'Posting' },
  { key: 'published', label: 'Published' },
  { key: 'failed', label: 'Failed' },
  { key: 'all', label: 'Tất cả' }
]

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function MediaThumbnail({ path }: { path: string }): JSX.Element {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api.media.readThumbnail(path).then((url) => {
      if (!cancelled) setDataUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [path])

  if (!dataUrl) return <div className="media-thumb media-thumb-loading" />
  return <img src={dataUrl} alt="" className="media-thumb" />
}

function Schedule(): JSX.Element {
  const [posts, setPosts] = useState<PostDetail[]>([])
  const [pages, setPages] = useState<Page[]>([])
  const [filter, setFilter] = useState<FilterKey>('all')
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [busyPostId, setBusyPostId] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const pageById = useMemo(() => new Map(pages.map((p) => [p.id, p])), [pages])

  const refresh = async (): Promise<void> => {
    setIsLoading(true)
    try {
      const [postList, pageList] = await Promise.all([window.api.posts.list(), window.api.pages.list()])
      setPosts(postList)
      setPages(pageList)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const counts = useMemo(
    () => ({
      scheduled: posts.filter((p) => p.status === 'scheduled').length,
      draft: posts.filter((p) => p.status === 'draft').length,
      publishing: posts.filter((p) => p.status === 'publishing').length,
      published: posts.filter((p) => p.status === 'published').length,
      failed: posts.filter((p) => p.status === 'failed').length,
      all: posts.length
    }),
    [posts]
  )

  const visiblePosts = useMemo(() => {
    const byStatus = filter === 'all' ? posts : posts.filter((p) => p.status === filter)
    const term = search.trim().toLowerCase()
    if (!term) return byStatus

    return byStatus.filter((post) => {
      if (post.message.toLowerCase().includes(term)) return true
      return post.targets.some((t) => pageById.get(t.pageId)?.name.toLowerCase().includes(term))
    })
  }, [posts, filter, search, pageById])

  const handleDeleteOne = async (postId: number): Promise<void> => {
    const confirmed = window.confirm('Xóa bài viết này khỏi mọi Page đã đăng/lên lịch? Không thể hoàn tác.')
    if (!confirmed) return

    setBusyPostId(postId)
    setNotice(null)
    try {
      const result = await window.api.posts.delete(postId)
      setPosts((prev) => prev.filter((p) => p.id !== postId))
      if (result.liveDeleteErrors.length > 0) {
        setNotice(`Đã xóa khỏi AutoPost, nhưng một số Page báo lỗi: ${result.liveDeleteErrors.join('; ')}`)
      }
    } finally {
      setBusyPostId(null)
    }
  }

  const handleBulkDelete = async (targetPosts: PostDetail[]): Promise<void> => {
    if (targetPosts.length === 0) return
    const confirmed = window.confirm(`Xóa ${targetPosts.length} bài viết? Không thể hoàn tác.`)
    if (!confirmed) return

    setIsLoading(true)
    setNotice(null)
    const errors: string[] = []
    for (const post of targetPosts) {
      const result = await window.api.posts.delete(post.id)
      errors.push(...result.liveDeleteErrors)
    }
    if (errors.length > 0) setNotice(`Một số Page báo lỗi khi xóa: ${errors.join('; ')}`)
    await refresh()
  }

  return (
    <section className="schedule">
      <div className="page-header schedule-header">
        <div>
          <h2>Quản lý lịch</h2>
          <p>Lịch chờ, đang đăng, đã đăng, lỗi — tất cả chiến dịch của bạn.</p>
        </div>
        <div className="schedule-header-actions">
          <button className="btn btn-secondary" onClick={refresh} disabled={isLoading}>
            <IconRefresh width={16} height={16} /> Làm mới dữ liệu
          </button>
          <Link to="/compose" className="btn btn-primary">
            <IconPlus width={16} height={16} /> Tạo chiến dịch mới
          </Link>
        </div>
      </div>

      <div className="stat-tiles">
        <div className="stat-tile" style={{ ['--tile-color' as string]: 'var(--info)' }}>
          <span className="stat-tile-label">SCHEDULED</span>
          <span className="stat-tile-value">{counts.scheduled}</span>
        </div>
        <div className="stat-tile" style={{ ['--tile-color' as string]: 'var(--warning)' }}>
          <span className="stat-tile-label">WAITING</span>
          <span className="stat-tile-value">{counts.draft}</span>
        </div>
        <div className="stat-tile" style={{ ['--tile-color' as string]: '#9b7ee0' }}>
          <span className="stat-tile-label">POSTING</span>
          <span className="stat-tile-value">{counts.publishing}</span>
        </div>
        <div className="stat-tile" style={{ ['--tile-color' as string]: 'var(--success)' }}>
          <span className="stat-tile-label">PUBLISHED</span>
          <span className="stat-tile-value">{counts.published}</span>
        </div>
        <div className="stat-tile" style={{ ['--tile-color' as string]: 'var(--danger)' }}>
          <span className="stat-tile-label">FAILED</span>
          <span className="stat-tile-value">{counts.failed}</span>
        </div>
        <div className="stat-tile" style={{ ['--tile-color' as string]: 'var(--text-faint)' }}>
          <span className="stat-tile-label">ALL</span>
          <span className="stat-tile-value">{counts.all}</span>
        </div>
      </div>

      <div className="schedule-toolbar">
        <div className="filter-tabs">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              className={`filter-tab ${filter === tab.key ? 'active' : ''}`}
              onClick={() => setFilter(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="schedule-toolbar-right">
          <div className="search-box">
            <IconSearch width={14} height={14} />
            <input
              type="text"
              placeholder="Tìm page, nội dung bài viết…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            className="btn btn-danger btn-sm"
            onClick={() => handleBulkDelete(posts.filter((p) => p.status === 'failed'))}
            disabled={isLoading || counts.failed === 0}
          >
            Xóa failed
          </button>
          <button
            className="btn btn-danger btn-sm"
            onClick={() => handleBulkDelete(visiblePosts)}
            disabled={isLoading || visiblePosts.length === 0}
          >
            Xóa tất cả
          </button>
        </div>
      </div>

      {notice && (
        <div className="alert alert-danger">
          <IconAlert width={16} height={16} />
          <span>{notice}</span>
        </div>
      )}

      {visiblePosts.length === 0 ? (
        <div className="empty-state">
          <IconInbox width={22} height={22} />
          <p>Không có chiến dịch nào khớp bộ lọc hiện tại.</p>
        </div>
      ) : (
        <table className="schedule-table">
          <thead>
            <tr>
              <th>Page / Trạng thái</th>
              <th>Media</th>
              <th>Thời gian</th>
              <th>Kết quả</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visiblePosts.map((post) => {
              const publishedCount = post.targets.filter((t) => t.status === 'published').length
              const failedTarget = post.targets.find((t) => t.status === 'failed')
              const nextTime = post.targets[0]?.scheduledPublishTime

              return (
                <tr key={post.id}>
                  <td>
                    <div className="schedule-page-cell">
                      <div className="schedule-target-chips">
                        {post.targets.map((t) => {
                          const page = pageById.get(t.pageId)
                          return (
                            <span key={t.id} className="schedule-chip" title={page?.name ?? `Page #${t.pageId}`}>
                              {page?.pictureUrl ? (
                                <img src={page.pictureUrl} alt="" />
                              ) : (
                                <span className="schedule-chip-fallback">{(page?.name ?? '?').charAt(0)}</span>
                              )}
                              <span className={`status status-${t.status}`}>{statusLabel(t.status)}</span>
                            </span>
                          )
                        })}
                      </div>
                      <span className="schedule-message">{post.message.slice(0, 70) || '(không có nội dung)'}</span>
                    </div>
                  </td>
                  <td>
                    {post.postType === 'photo' && post.mediaLocalFilePath ? (
                      <MediaThumbnail path={post.mediaLocalFilePath} />
                    ) : (
                      <span className="hint">—</span>
                    )}
                  </td>
                  <td>
                    {nextTime ? format(new Date(nextTime), 'dd/MM/yyyy HH:mm') : '—'}
                  </td>
                  <td>
                    {failedTarget ? (
                      <span className="schedule-result schedule-result-failed">{failedTarget.errorMessage ?? 'Lỗi'}</span>
                    ) : (
                      <span className="schedule-result">
                        Đã đăng {publishedCount}/{post.targets.length} Page
                      </span>
                    )}
                  </td>
                  <td className="schedule-row-actions">
                    <Link to={`/reports?postId=${post.id}`} className="btn btn-secondary btn-sm">
                      <IconChart width={13} height={13} />
                    </Link>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDeleteOne(post.id)}
                      disabled={busyPostId === post.id}
                    >
                      <IconTrash width={13} height={13} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}

export default Schedule
