import { useEffect, useMemo, useState } from 'react'
import type { InteractionTask, Page } from '@shared/types'
import { IconAlert, IconBolt, IconClock, IconTrash, IconRefresh, IconHeart } from '../components/Icons'

const ACTION_LABELS: Record<string, string> = {
  like: '👍 Like',
  love: '❤️ Love',
  haha: '😆 Haha',
  wow: '😮 Wow',
  sad: '😢 Sad',
  angry: '😡 Angry',
  comment: '💬 Comment'
}

const STATUS_CLASS: Record<InteractionTask['status'], string> = {
  pending: 'status-pending',
  done: 'status-published',
  failed: 'status-failed'
}

const STATUS_LABEL: Record<InteractionTask['status'], string> = {
  pending: 'Đang chờ',
  done: 'Hoàn thành',
  failed: 'Thất bại'
}

function extractObjectId(url: string): string | null {
  try {
    const u = new URL(url)
    for (const key of ['fbid', 'story_fbid', 'v']) {
      const val = u.searchParams.get(key)
      if (val && /^\d{8,}$/.test(val)) return val
    }
    const m = u.pathname.match(/\/(\d{8,})\/?$/)
    if (m) return m[1]
  } catch {
    const p = url.match(/[?&](?:fbid|story_fbid|v)=(\d{8,})/)
    if (p) return p[1]
    const m = url.match(/\/(\d{8,})\/?(?:[?#].*)?$/)
    if (m) return m[1]
  }
  return null
}

const URL_EXAMPLES = [
  { label: 'Ảnh', url: 'facebook.com/photo/?fbid=151446…', tip: 'Copy URL khi đang xem ảnh' },
  { label: 'Video', url: 'facebook.com/page/videos/902244…', tip: 'Click video → copy URL' },
  { label: 'Bài viết', url: 'facebook.com/page/posts/1234…', tip: '"..." → Sao chép liên kết' },
  { label: 'Permalink', url: 'facebook.com/permalink.php?story_fbid=…', tip: '"..." → Nhúng → lấy URL' }
]

function UrlGuide(): JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.8rem', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
      >
        {open ? 'Ẩn hướng dẫn' : 'Cách lấy URL bài viết?'}
      </button>
      {open && (
        <div style={{ marginTop: '0.6rem', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem', fontSize: '0.82rem' }}>
          <p style={{ margin: '0 0 0.6rem', color: 'var(--text-muted)', fontWeight: 500 }}>Paste URL từ trình duyệt — tool tự nhận dạng:</p>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {URL_EXAMPLES.map((ex) => (
                <tr key={ex.label} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.4rem 0.5rem 0.4rem 0', color: 'var(--text)', fontWeight: 500, whiteSpace: 'nowrap', width: 80 }}>{ex.label}</td>
                  <td style={{ padding: '0.4rem 0.5rem', color: 'var(--accent)', fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>{ex.url}</td>
                  <td style={{ padding: '0.4rem 0 0.4rem 0.5rem', color: 'var(--text-faint)', fontSize: '0.75rem' }}>{ex.tip}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ margin: '0.5rem 0 0', color: 'var(--text-faint)', fontSize: '0.78rem' }}>
            Bài viết phải <strong style={{ color: 'var(--text-muted)' }}>public</strong> thì Page mới like/comment được.
          </p>
        </div>
      )}
    </div>
  )
}

function defaultSchedule(): string {
  const d = new Date(Date.now() + 5 * 60 * 1000)
  d.setSeconds(0, 0)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
}

function LikeComment(): JSX.Element {
  const [pages, setPages] = useState<Page[]>([])
  const [tasks, setTasks] = useState<InteractionTask[]>([])

  const [postUrl, setPostUrl] = useState('')
  const [pageId, setPageId] = useState<number | ''>('')
  const [commentText, setCommentText] = useState('')
  const [executeNow, setExecuteNow] = useState(true)
  const [scheduleValue, setScheduleValue] = useState(defaultSchedule())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const [filterStatus, setFilterStatus] = useState<InteractionTask['status'] | 'all'>('all')
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [executingId, setExecutingId] = useState<number | null>(null)

  useEffect(() => {
    window.api.pages.list().then(setPages)
    window.api.interactions.list().then(setTasks)
  }, [])

  const extractedId = useMemo(() => extractObjectId(postUrl), [postUrl])

  const counts = useMemo(() => ({
    all: tasks.length,
    pending: tasks.filter((t) => t.status === 'pending').length,
    done: tasks.filter((t) => t.status === 'done').length,
    failed: tasks.filter((t) => t.status === 'failed').length
  }), [tasks])

  const filtered = useMemo(
    () => filterStatus === 'all' ? tasks : tasks.filter((t) => t.status === filterStatus),
    [tasks, filterStatus]
  )

  const handleSubmit = async (): Promise<void> => {
    setError(null); setSuccessMsg(null)
    if (!postUrl.trim()) { setError('Nhập URL bài viết.'); return }
    if (!extractedId) { setError('Không tìm thấy Object ID từ URL.'); return }
    if (!pageId) { setError('Chọn Page thực hiện hành động.'); return }
    if (!commentText.trim()) { setError('Nhập nội dung comment.'); return }

    setIsSubmitting(true)
    try {
      const scheduledAt = executeNow ? new Date().toISOString() : new Date(scheduleValue).toISOString()

      const task = await window.api.interactions.create({
        postUrl: postUrl.trim(), targetObjectId: extractedId,
        pageId: pageId as number, actionType: 'comment',
        commentText: commentText.trim(), scheduledAt, executeNow
      })

      setTasks((prev) => [task, ...prev.filter((t) => t.id !== task.id)])
      setPostUrl(''); setCommentText('')

      setSuccessMsg(executeNow
        ? 'Đã comment thành công!'
        : `Đã lên lịch comment vào ${formatTime(scheduledAt)}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: number): Promise<void> => {
    setDeletingId(id)
    try { await window.api.interactions.delete(id); setTasks((p) => p.filter((t) => t.id !== id)) }
    finally { setDeletingId(null) }
  }

  const handleExecute = async (id: number): Promise<void> => {
    setExecutingId(id)
    try {
      const updated = await window.api.interactions.execute(id)
      setTasks((p) => p.map((t) => (t.id === id ? updated : t)))
    } catch (err) { console.error(err) }
    finally { setExecutingId(null) }
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--text)',
    padding: '0.6rem 0.7rem', fontSize: '0.9rem', width: '100%'
  }

  return (
    <section>
      <div className="page-header">
        <h2>Comment</h2>
        <p>Dùng Facebook Page của bạn để comment vào bài viết của Page khác.</p>
      </div>

      <div className="composer" style={{ maxWidth: 620 }}>
        {/* URL */}
        <div className="field">
          <label>URL bài viết Facebook</label>
          <input type="url" value={postUrl} onChange={(e) => setPostUrl(e.target.value)}
            placeholder="https://www.facebook.com/..." style={inputStyle} />
          {postUrl ? (
            <p className="hint" style={{ color: extractedId ? 'var(--success)' : 'var(--danger)' }}>
              {extractedId ? `Object ID: ${extractedId}` : 'Không tìm thấy ID — xem hướng dẫn'}
            </p>
          ) : <UrlGuide />}
        </div>

        {/* Page */}
        <div className="field">
          <label>Page thực hiện hành động</label>
          <select value={pageId} onChange={(e) => setPageId(e.target.value ? Number(e.target.value) : '')}
            style={{ ...inputStyle, color: pageId ? 'var(--text)' : 'var(--text-faint)' }}>
            <option value="">-- Chọn Page --</option>
            {pages.filter((p) => p.tokenStatus === 'ok').map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {pages.some((p) => p.tokenStatus === 'needs_reauth') && (
            <p className="hint">Một số Page cần kết nối lại và đã bị ẩn.</p>
          )}
        </div>

        {/* Comment textarea */}
        <div className="field">
          <label htmlFor="cmt">
            Nội dung bình luận <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>(tùy chọn)</span>
          </label>
          <textarea id="cmt" rows={4} value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Nhập nội dung comment... (để trống nếu chỉ muốn thả biểu cảm)" />
          <p className="hint">{commentText.length} / 8000 ký tự</p>
        </div>

        {/* Schedule */}
        <div className="field">
          <label className="checkbox">
            <input type="checkbox" checked={executeNow} onChange={(e) => setExecuteNow(e.target.checked)} />
            <IconBolt width={14} height={14} /> Thực hiện ngay
          </label>
        </div>
        {!executeNow && (
          <div className="field">
            <label className="field-label-row"><IconClock width={14} height={14} /> Lên lịch vào</label>
            <input type="datetime-local" value={scheduleValue} onChange={(e) => setScheduleValue(e.target.value)} />
          </div>
        )}

        <button className="btn btn-primary" onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? 'Đang xử lý…' : executeNow ? 'Thực hiện ngay' : 'Lên lịch'}
        </button>

        {error && (
          <div className="alert alert-danger" style={{ marginTop: '0.75rem' }}>
            <IconAlert width={16} height={16} /><span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="alert" style={{ marginTop: '0.75rem', background: 'var(--success-soft)', color: '#6dcf9a', border: '1px solid rgba(79,179,122,0.3)' }}>
            <span>{successMsg}</span>
          </div>
        )}
      </div>

      {/* History */}
      <div style={{ marginTop: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Lịch sử tác vụ</h3>
          <button className="btn btn-secondary btn-sm" onClick={() => window.api.interactions.list().then(setTasks)}>
            <IconRefresh width={14} height={14} /> Làm mới
          </button>
        </div>

        <div className="filter-tabs" style={{ marginBottom: '1rem' }}>
          {(['all', 'pending', 'done', 'failed'] as const).map((s) => (
            <button key={s} className={`filter-tab ${filterStatus === s ? 'active' : ''}`} onClick={() => setFilterStatus(s)}>
              {s === 'all' ? 'Tất cả' : s === 'pending' ? 'Đang chờ' : s === 'done' ? 'Hoàn thành' : 'Thất bại'}
              <span style={{ marginLeft: '0.35rem', opacity: 0.6 }}>{counts[s]}</span>
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <IconHeart />
            <p>Chưa có tác vụ nào{filterStatus !== 'all' ? ' trong bộ lọc này' : ''}.</p>
          </div>
        ) : (
          <table className="schedule-table">
            <thead>
              <tr>
                <th>Page</th>
                <th>Hành động</th>
                <th>Bài viết</th>
                <th>Trạng thái</th>
                <th>Thời gian</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((task) => (
                <tr key={task.id}>
                  <td style={{ color: 'var(--text)', fontWeight: 500 }}>{task.pageName}</td>
                  <td>{ACTION_LABELS[task.actionType] ?? task.actionType}</td>
                  <td>
                    <span style={{ color: 'var(--accent)', fontSize: '0.8rem', cursor: 'pointer' }}
                      onClick={() => window.open(task.postUrl)} title={task.postUrl}>
                      {task.targetObjectId}
                    </span>
                    {task.commentText && (
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--text-faint)' }}>
                        "{task.commentText.slice(0, 60)}{task.commentText.length > 60 ? '…' : ''}"
                      </p>
                    )}
                  </td>
                  <td>
                    <span className={`status ${STATUS_CLASS[task.status]}`}>{STATUS_LABEL[task.status]}</span>
                    {task.errorMessage && (
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: 'var(--danger)' }}>{task.errorMessage}</p>
                    )}
                  </td>
                  <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                    {task.executedAt
                      ? <span style={{ color: 'var(--success)' }}>{formatTime(task.executedAt)}</span>
                      : <span style={{ color: 'var(--text-faint)' }}>{formatTime(task.scheduledAt)}</span>}
                  </td>
                  <td>
                    <div className="schedule-row-actions">
                      {task.status === 'failed' && (
                        <button className="btn btn-secondary btn-sm" disabled={executingId === task.id}
                          onClick={() => handleExecute(task.id)} title="Thử lại">
                          <IconRefresh width={13} height={13} />
                        </button>
                      )}
                      <button className="btn btn-danger btn-sm" disabled={deletingId === task.id}
                        onClick={() => handleDelete(task.id)} title="Xóa">
                        <IconTrash width={13} height={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

export default LikeComment
