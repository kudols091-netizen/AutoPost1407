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
  const pct = comparison.pctChange === 'insufficient-data' ? null : comparison.pctChange

  const rows: Array<{ label: string; value: number | null; key: keyof WindowComparisonDto['current'] }> = [
    { label: 'Follower tăng ròng', value: comparison.current.followerNetChange, key: 'followerNetChange' },
    { label: 'Số bài đăng', value: comparison.current.postCount, key: 'postCount' },
    { label: 'Tổng reach', value: comparison.current.totalReach, key: 'totalReach' },
    { label: 'Tổng reach Page', value: comparison.current.totalPageReach, key: 'totalPageReach' },
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

  const followerPctChange = useMemo(() => {
    if (!analytics || analytics.followerHistory.length < 2) return null
    const history = analytics.followerHistory
    const last = history[history.length - 1]
    const secondLast = history[history.length - 2]
    if (secondLast.followerCount === 0) return null
    return ((last.followerCount - secondLast.followerCount) / secondLast.followerCount) * 100
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
                  <span className="stat-tile-value">
                    {analytics.pageInfo.followerCount ?? '—'}
                    {followerPctChange !== null && (
                      <span className="pct"> {formatPct(followerPctChange)}</span>
                    )}
                  </span>
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
