import { useEffect, useState } from 'react'
import type { SystemLog } from '@shared/types'
import { IconInbox, IconRefresh } from '../components/Icons'

function levelLabel(level: string): string {
  return level.charAt(0).toUpperCase() + level.slice(1)
}

function SystemLogs(): JSX.Element {
  const [logs, setLogs] = useState<SystemLog[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const refresh = async (): Promise<void> => {
    setIsLoading(true)
    try {
      setLogs(await window.api.logs.list(200))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  return (
    <section className="system-logs">
      <div className="page-header schedule-header">
        <div>
          <h2>Nhật ký hệ thống</h2>
          <p>Lịch sử kết nối Page, đăng bài, lỗi và đồng bộ trạng thái.</p>
        </div>
        <button className="btn btn-secondary" onClick={refresh} disabled={isLoading}>
          <IconRefresh width={16} height={16} /> Làm mới
        </button>
      </div>

      {logs.length === 0 ? (
        <div className="empty-state">
          <IconInbox width={22} height={22} />
          <p>Chưa có sự kiện nào được ghi lại.</p>
        </div>
      ) : (
        <table className="log-table">
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Mức độ</th>
              <th>Nhóm</th>
              <th>Nội dung</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="log-time">{new Date(log.createdAt).toLocaleString('vi-VN')}</td>
                <td>
                  <span className={`status status-log-${log.level}`}>{levelLabel(log.level)}</span>
                </td>
                <td className="log-category">{log.category}</td>
                <td>
                  {log.message}
                  {log.detail && <div className="log-detail">{log.detail}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

export default SystemLogs
