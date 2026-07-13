import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { format } from 'date-fns'
import type { PostAnalytics, PostDetail } from '@shared/types'
import { IconChart, IconInbox } from '../components/Icons'

const METRIC_COLORS: Record<string, string> = {
  post_engaged_users: '#5b93f0',
  post_clicks: '#4fb37a',
  comments_count: '#e0a94f',
  shares_count: '#e0636b',
  likes_count: '#9b7ee0'
}

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function Reports(): JSX.Element {
  const [searchParams] = useSearchParams()
  const [posts, setPosts] = useState<PostDetail[]>([])
  const [selectedPostId, setSelectedPostId] = useState<number | null>(null)
  const [analytics, setAnalytics] = useState<PostAnalytics | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    window.api.posts.list().then((list) => {
      setPosts(list)
      const requestedId = Number(searchParams.get('postId'))
      const requested = requestedId ? list.find((p) => p.id === requestedId) : undefined
      const fallback = list.find((p) => p.status === 'scheduled' || p.status === 'published')
      if (requested) setSelectedPostId(requested.id)
      else if (fallback) setSelectedPostId(fallback.id)
    })
  }, [searchParams])

  useEffect(() => {
    if (selectedPostId === null) {
      setAnalytics(null)
      return
    }
    setIsLoading(true)
    window.api.analytics
      .forPost(selectedPostId)
      .then(setAnalytics)
      .finally(() => setIsLoading(false))
  }, [selectedPostId])

  const chartSeries = useMemo(() => {
    if (!analytics) return []

    const byMetric = new Map<string, Array<{ capturedAt: string; value: number }>>()
    for (const target of analytics.targets) {
      for (const snap of target.snapshots) {
        const points = byMetric.get(snap.metricName) ?? []
        points.push({ capturedAt: snap.capturedAt, value: snap.metricValue })
        byMetric.set(snap.metricName, points)
      }
    }

    return Array.from(byMetric.entries()).map(([metricName, points]) => ({
      metricName,
      data: points
        .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
        .map((p) => ({ ...p, label: format(new Date(p.capturedAt), 'MMM d HH:mm') }))
    }))
  }, [analytics])

  return (
    <section className="reports">
      <div className="page-header">
        <h2>Báo cáo</h2>
        <p>Theo dõi hiệu quả tương tác của từng bài viết sau khi đăng.</p>
      </div>

      {posts.length === 0 ? (
        <div className="empty-state">
          <IconChart width={22} height={22} />
          <p>Chưa có bài viết nào. Vào Lên lịch đăng để tạo bài đầu tiên.</p>
        </div>
      ) : (
        <div className="dashboard-layout">
          <ul className="post-list">
            {posts.map((post) => (
              <li key={post.id}>
                <button
                  className={post.id === selectedPostId ? 'active' : ''}
                  onClick={() => setSelectedPostId(post.id)}
                >
                  <span className="post-message">{post.message.slice(0, 60) || '(no message)'}</span>
                  <span className={`status status-${post.status}`}>{statusLabel(post.status)}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="analytics-panel">
            {isLoading && <p className="hint">Loading…</p>}

            {!isLoading && analytics && (
              <>
                <div className="panel-header">
                  <h3>{analytics.post.message.slice(0, 80) || '(no message)'}</h3>
                </div>

                <table className="target-table">
                  <thead>
                    <tr>
                      <th>Page</th>
                      <th>Status</th>
                      <th>Scheduled for</th>
                      <th>Published</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.targets.map((t) => (
                      <tr key={t.id}>
                        <td>{t.pageName}</td>
                        <td>{statusLabel(t.status)}</td>
                        <td>{format(new Date(t.scheduledPublishTime), 'MMM d, HH:mm')}</td>
                        <td>{t.publishedAt ? format(new Date(t.publishedAt), 'MMM d, HH:mm') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {chartSeries.length === 0 && (
                  <p className="hint">No analytics yet — data appears once Meta publishes the post.</p>
                )}

                {chartSeries.map((series) => (
                  <div key={series.metricName} className="chart-block">
                    <h4>{series.metricName.replace(/_/g, ' ')}</h4>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={series.data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#242835" />
                        <XAxis dataKey="label" stroke="#656d7d" fontSize={12} />
                        <YAxis stroke="#656d7d" fontSize={12} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{
                            background: '#171b24',
                            border: '1px solid #242835',
                            borderRadius: 8
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke={METRIC_COLORS[series.metricName] ?? '#5b93f0'}
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ))}
              </>
            )}

            {!isLoading && !analytics && (
              <div className="empty-state">
                <IconInbox width={20} height={20} />
                <p>Chọn một bài viết ở bên trái để xem báo cáo.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

export default Reports
