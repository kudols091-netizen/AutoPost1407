import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Page, PostDetail, SystemLog } from '@shared/types'
import { IconCalendar, IconChart, IconEdit, IconLayers } from '../components/Icons'

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function Overview(): JSX.Element {
  const [pages, setPages] = useState<Page[]>([])
  const [posts, setPosts] = useState<PostDetail[]>([])
  const [logs, setLogs] = useState<SystemLog[]>([])

  useEffect(() => {
    window.api.pages.list().then(setPages)
    window.api.posts.list().then(setPosts)
    window.api.logs.list(6).then(setLogs)
  }, [])

  const scheduled = posts.filter((p) => p.status === 'scheduled').length
  const published = posts.filter((p) => p.status === 'published').length
  const failed = posts.filter((p) => p.status === 'failed').length
  const waiting = posts.filter((p) => p.status === 'draft').length

  return (
    <section className="overview">
      <div className="page-header">
        <h2>Tổng quan</h2>
        <p>Toàn cảnh các Page đã kết nối và tiến độ đăng bài gần đây.</p>
      </div>

      <div className="stat-tiles">
        <div className="stat-tile" style={{ ['--tile-color' as string]: 'var(--accent)' }}>
          <span className="stat-tile-label">PAGES</span>
          <span className="stat-tile-value">{pages.length}</span>
        </div>
        <div className="stat-tile" style={{ ['--tile-color' as string]: 'var(--warning)' }}>
          <span className="stat-tile-label">WAITING</span>
          <span className="stat-tile-value">{waiting}</span>
        </div>
        <div className="stat-tile" style={{ ['--tile-color' as string]: 'var(--info)' }}>
          <span className="stat-tile-label">SCHEDULED</span>
          <span className="stat-tile-value">{scheduled}</span>
        </div>
        <div className="stat-tile" style={{ ['--tile-color' as string]: 'var(--success)' }}>
          <span className="stat-tile-label">PUBLISHED</span>
          <span className="stat-tile-value">{published}</span>
        </div>
        <div className="stat-tile" style={{ ['--tile-color' as string]: 'var(--danger)' }}>
          <span className="stat-tile-label">FAILED</span>
          <span className="stat-tile-value">{failed}</span>
        </div>
        <div className="stat-tile" style={{ ['--tile-color' as string]: 'var(--text-faint)' }}>
          <span className="stat-tile-label">ALL</span>
          <span className="stat-tile-value">{posts.length}</span>
        </div>
      </div>

      <div className="overview-actions">
        <Link to="/compose" className="btn btn-primary">
          <IconEdit width={16} height={16} /> Lên lịch đăng
        </Link>
        <Link to="/schedule" className="btn btn-secondary">
          <IconCalendar width={16} height={16} /> Quản lý lịch
        </Link>
        <Link to="/pages" className="btn btn-secondary">
          <IconLayers width={16} height={16} /> Quản lý Pages
        </Link>
      </div>

      <div className="overview-recent">
        <div className="panel-header">
          <h3>Hoạt động gần đây</h3>
          <Link to="/logs" className="btn btn-secondary btn-sm">
            <IconChart width={14} height={14} /> Xem tất cả
          </Link>
        </div>

        {logs.length === 0 ? (
          <p className="hint">Chưa có hoạt động nào được ghi lại.</p>
        ) : (
          <ul className="recent-log-list">
            {logs.map((log) => (
              <li key={log.id}>
                <span className={`status status-log-${log.level}`}>{statusLabel(log.level)}</span>
                <span className="recent-log-message">{log.message}</span>
                <span className="recent-log-time">{new Date(log.createdAt).toLocaleString('vi-VN')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

export default Overview
