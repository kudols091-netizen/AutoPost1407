import { useEffect, useState } from 'react'
import type { Page, PageDetails } from '@shared/types'
import { IconAlert, IconEdit, IconRefresh } from '../components/Icons'

function PageEditor(): JSX.Element {
  const [pages, setPages] = useState<Page[]>([])
  const [selectedId, setSelectedId] = useState<number | ''>('')
  const [details, setDetails] = useState<PageDetails | null>(null)
  const [loading, setLoading] = useState(false)

  const [name, setName] = useState('')
  const [about, setAbout] = useState('')
  const [pictureUrl, setPictureUrl] = useState('')

  const [savingInfo, setSavingInfo] = useState(false)
  const [savingPic, setSavingPic] = useState(false)
  const [infoMsg, setInfoMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [picMsg, setPicMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const [picMode, setPicMode] = useState<'file' | 'url'>('file')
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [fileData, setFileData] = useState<Uint8Array<ArrayBuffer> | null>(null)
  const [fileMime, setFileMime] = useState('')
  const [fileName, setFileName] = useState('')

  useEffect(() => {
    window.api.pages.list().then((list) => {
      const active = list.filter((p) => p.tokenStatus === 'ok')
      setPages(active)
    })
  }, [])

  const loadDetails = async (pageId: number): Promise<void> => {
    setLoading(true)
    setDetails(null)
    setInfoMsg(null)
    setPicMsg(null)
    try {
      const d = await window.api.pageEditor.getDetails(pageId)
      setDetails(d)
      setName(d.name)
      setAbout(d.about ?? '')
      setPictureUrl('')
    } catch (err) {
      setInfoMsg({ type: 'err', text: err instanceof Error ? err.message : 'Không tải được thông tin.' })
    } finally {
      setLoading(false)
    }
  }

  const handleSelectPage = (id: number | ''): void => {
    setSelectedId(id)
    if (id) loadDetails(id as number)
    else setDetails(null)
  }

  const handleSaveInfo = async (): Promise<void> => {
    if (!selectedId) return
    setSavingInfo(true)
    setInfoMsg(null)
    try {
      await window.api.pageEditor.updateInfo({
        pageId: selectedId as number,
        name: name.trim() || undefined,
        about: about.trim() || undefined
      })
      setInfoMsg({ type: 'ok', text: 'Cập nhật thành công!' })
      loadDetails(selectedId as number)
    } catch (err) {
      setInfoMsg({ type: 'err', text: err instanceof Error ? err.message : 'Có lỗi xảy ra.' })
    } finally {
      setSavingInfo(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setFileMime(file.type)
    const reader = new FileReader()
    reader.onload = () => {
      const buf = new Uint8Array(reader.result as ArrayBuffer) as Uint8Array<ArrayBuffer>
      setFileData(buf)
      setFilePreview(URL.createObjectURL(file))
    }
    reader.readAsArrayBuffer(file)
  }

  const handleSavePicture = async (): Promise<void> => {
    if (!selectedId) return
    setSavingPic(true)
    setPicMsg(null)
    try {
      if (picMode === 'file') {
        if (!fileData) { setPicMsg({ type: 'err', text: 'Chọn ảnh từ máy tính.' }); return }
        await window.api.pageEditor.uploadPicture({
          pageId: selectedId as number,
          imageData: fileData,
          mimeType: fileMime,
          fileName
        })
      } else {
        if (!pictureUrl.trim()) { setPicMsg({ type: 'err', text: 'Nhập URL ảnh.' }); return }
        await window.api.pageEditor.updatePicture({
          pageId: selectedId as number,
          pictureUrl: pictureUrl.trim()
        })
      }
      setPicMsg({ type: 'ok', text: 'Cập nhật avatar thành công!' })
      setPictureUrl('')
      setFileData(null)
      setFilePreview(null)
      loadDetails(selectedId as number)
    } catch (err) {
      setPicMsg({ type: 'err', text: err instanceof Error ? err.message : 'Có lỗi xảy ra.' })
    } finally {
      setSavingPic(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text)',
    padding: '0.6rem 0.7rem',
    fontSize: '0.9rem',
    width: '100%'
  }

  return (
    <section>
      <div className="page-header">
        <h2>Chỉnh sửa Trang</h2>
        <p>Đổi tên, bio và avatar Facebook Page của bạn trực tiếp qua API.</p>
      </div>

      <div className="composer" style={{ maxWidth: 580 }}>
        {/* Chọn Page */}
        <div className="field">
          <label>Chọn Page</label>
          <select
            value={selectedId}
            onChange={(e) => handleSelectPage(e.target.value ? Number(e.target.value) : '')}
            style={{ ...inputStyle, color: selectedId ? 'var(--text)' : 'var(--text-faint)' }}
          >
            <option value="">-- Chọn Page --</option>
            {pages.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {loading && <p style={{ color: 'var(--text-faint)', fontSize: '0.9rem' }}>Đang tải thông tin...</p>}

        {details && !loading && (
          <>
            {/* Avatar hiện tại */}
            <div className="field" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {details.pictureUrl && (
                <img
                  src={details.pictureUrl}
                  alt=""
                  width={64}
                  height={64}
                  style={{ borderRadius: '50%', border: '2px solid var(--border)', objectFit: 'cover' }}
                />
              )}
              <div>
                <p style={{ margin: 0, fontWeight: 600, fontSize: '1rem' }}>{details.name}</p>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: 'var(--text-faint)' }}>
                  {details.fbPageId}
                </p>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                style={{ marginLeft: 'auto' }}
                onClick={() => loadDetails(selectedId as number)}
              >
                <IconRefresh width={13} height={13} />
              </button>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '0.25rem 0 1rem' }} />

            {/* Tên */}
            <div className="field">
              <label>Tên Page</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={75}
                style={inputStyle}
              />
              <p className="hint">Facebook giới hạn đổi tên mỗi 7 ngày và có thể cần review.</p>
            </div>

            {/* Bio / About */}
            <div className="field">
              <label>Bio / Mô tả ngắn</label>
              <textarea
                rows={3}
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                maxLength={255}
                style={{ ...inputStyle, resize: 'vertical' }}
                placeholder="Mô tả ngắn về Page..."
              />
              <p className="hint">{about.length} / 255 ký tự</p>
            </div>

            <button className="btn btn-primary" onClick={handleSaveInfo} disabled={savingInfo}>
              <IconEdit width={14} height={14} />
              {savingInfo ? 'Đang lưu...' : 'Lưu tên & bio'}
            </button>

            {infoMsg && (
              <div
                className={infoMsg.type === 'err' ? 'alert alert-danger' : 'alert'}
                style={{
                  marginTop: '0.75rem',
                  ...(infoMsg.type === 'ok'
                    ? { background: 'var(--success-soft)', color: '#6dcf9a', border: '1px solid rgba(79,179,122,0.3)' }
                    : {})
                }}
              >
                {infoMsg.type === 'err' && <IconAlert width={15} height={15} />}
                <span>{infoMsg.text}</span>
              </div>
            )}

            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1.5rem 0 1rem' }} />

            {/* Avatar */}
            <div className="field">
              <label>Đổi Avatar</label>
              <div className="filter-tabs" style={{ marginBottom: '0.75rem' }}>
                <button className={`filter-tab ${picMode === 'file' ? 'active' : ''}`} onClick={() => setPicMode('file')}>
                  Từ máy tính
                </button>
                <button className={`filter-tab ${picMode === 'url' ? 'active' : ''}`} onClick={() => setPicMode('url')}>
                  Từ URL
                </button>
              </div>

              {picMode === 'file' ? (
                <div>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                    id="avatar-file-input"
                  />
                  <label
                    htmlFor="avatar-file-input"
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.75rem',
                      cursor: 'pointer', padding: '0.75rem 1rem',
                      border: '1px dashed var(--border)', borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface-2)', color: 'var(--text-faint)'
                    }}
                  >
                    {filePreview
                      ? <img src={filePreview} alt="" width={48} height={48} style={{ borderRadius: '50%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: '2rem' }}>🖼️</span>
                    }
                    <span style={{ fontSize: '0.88rem' }}>
                      {fileName || 'Nhấn để chọn ảnh từ máy tính...'}
                    </span>
                  </label>
                  <p className="hint">Tối thiểu 180×180px, định dạng JPG / PNG / WEBP.</p>
                </div>
              ) : (
                <div>
                  <input
                    type="url"
                    value={pictureUrl}
                    onChange={(e) => setPictureUrl(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                    style={inputStyle}
                  />
                  <p className="hint">Ảnh phải công khai, tối thiểu 180×180px.</p>
                </div>
              )}
            </div>

            <button
              className="btn btn-primary"
              onClick={handleSavePicture}
              disabled={savingPic || (picMode === 'file' ? !fileData : !pictureUrl.trim())}
            >
              {savingPic ? 'Đang tải lên...' : 'Cập nhật Avatar'}
            </button>

            {picMsg && (
              <div
                className={picMsg.type === 'err' ? 'alert alert-danger' : 'alert'}
                style={{
                  marginTop: '0.75rem',
                  ...(picMsg.type === 'ok'
                    ? { background: 'var(--success-soft)', color: '#6dcf9a', border: '1px solid rgba(79,179,122,0.3)' }
                    : {})
                }}
              >
                {picMsg.type === 'err' && <IconAlert width={15} height={15} />}
                <span>{picMsg.text}</span>
              </div>
            )}
          </>
        )}

        {!details && !loading && selectedId && (
          <div className="empty-state">
            <IconEdit />
            <p>Không tải được thông tin Page.</p>
          </div>
        )}

        {!selectedId && !loading && (
          <div className="empty-state" style={{ marginTop: '1.5rem' }}>
            <IconEdit />
            <p>Chọn một Page để chỉnh sửa thông tin.</p>
          </div>
        )}
      </div>
    </section>
  )
}

export default PageEditor
