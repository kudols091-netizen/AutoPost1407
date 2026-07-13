import { useEffect, useState } from 'react'
import type { Page, PostDetail } from '@shared/types'
import { IconAlert, IconBolt, IconClock, IconImage, IconLink } from '../components/Icons'

function toIsoLocal(value: string): string {
  // value from <input type="datetime-local"> has no timezone; treat it as local time.
  return new Date(value).toISOString()
}

function defaultScheduleValue(): string {
  const d = new Date(Date.now() + 30 * 60 * 1000) // +30 min, safely inside the 10min-30day window
  d.setSeconds(0, 0)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function Composer(): JSX.Element {
  const [pages, setPages] = useState<Page[]>([])
  const [selectedPageIds, setSelectedPageIds] = useState<number[]>([])
  const [message, setMessage] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [publishNow, setPublishNow] = useState(false)
  const [scheduleValue, setScheduleValue] = useState(defaultScheduleValue())
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PostDetail | null>(null)

  useEffect(() => {
    window.api.pages.list().then(setPages)
  }, [])

  const togglePage = (id: number): void => {
    setSelectedPageIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
  }

  const handleSubmit = async (): Promise<void> => {
    setError(null)
    setResult(null)

    if (selectedPageIds.length === 0) {
      setError('Select at least one Page.')
      return
    }
    if (!message.trim()) {
      setError('Write a message first.')
      return
    }

    setIsSubmitting(true)
    try {
      let media: { localFilePath: string; mimeType: string } | null = null
      if (photoFile) {
        const buffer = new Uint8Array(await photoFile.arrayBuffer())
        media = await window.api.media.import({
          name: photoFile.name,
          mimeType: photoFile.type || 'image/jpeg',
          data: buffer
        })
      }

      const created = await window.api.posts.create({
        message: message.trim(),
        linkUrl: linkUrl.trim() ? linkUrl.trim() : null,
        postType: media ? 'photo' : linkUrl.trim() ? 'link' : 'text',
        pageIds: selectedPageIds,
        scheduledPublishTime: publishNow ? new Date().toISOString() : toIsoLocal(scheduleValue),
        publishNow,
        media
      })

      setResult(created)
      if (created.status === 'scheduled' || created.status === 'published') {
        setMessage('')
        setLinkUrl('')
        setPhotoFile(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule post.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="composer">
      <div className="page-header">
        <h2>Compose post</h2>
        <p>Write once, target as many connected Pages as you like.</p>
      </div>

      <div className="field">
        <label>Target Pages</label>
        <div className="page-checkboxes">
          {pages.map((page) => (
            <label key={page.id} className="checkbox">
              <input
                type="checkbox"
                checked={selectedPageIds.includes(page.id)}
                onChange={() => togglePage(page.id)}
                disabled={page.tokenStatus === 'needs_reauth'}
              />
              {page.name}
              {page.tokenStatus === 'needs_reauth' && ' (reconnect needed)'}
            </label>
          ))}
          {pages.length === 0 && <p className="hint">Connect a Page first.</p>}
        </div>
      </div>

      <div className="field">
        <label htmlFor="message">Message</label>
        <textarea
          id="message"
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What do you want to post?"
        />
      </div>

      <div className="field">
        <label htmlFor="link" className="field-label-row">
          <IconLink width={14} height={14} /> Link (optional)
        </label>
        <input
          id="link"
          type="url"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="https://…"
          disabled={!!photoFile}
        />
      </div>

      <div className="field">
        <label htmlFor="photo" className="field-label-row">
          <IconImage width={14} height={14} /> Photo (optional)
        </label>
        <input
          id="photo"
          type="file"
          accept="image/*"
          onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <div className="field">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={publishNow}
            onChange={(e) => setPublishNow(e.target.checked)}
          />
          <IconBolt width={14} height={14} /> Post now instead of scheduling
        </label>
      </div>

      {!publishNow && (
        <div className="field">
          <label htmlFor="schedule" className="field-label-row">
            <IconClock width={14} height={14} /> Schedule for
          </label>
          <input
            id="schedule"
            type="datetime-local"
            value={scheduleValue}
            onChange={(e) => setScheduleValue(e.target.value)}
          />
          <p className="hint">Meta allows 10 minutes to 30 days from now.</p>
        </div>
      )}

      <button className="btn btn-primary" onClick={handleSubmit} disabled={isSubmitting}>
        {isSubmitting ? (publishNow ? 'Posting…' : 'Scheduling…') : publishNow ? 'Post Now' : 'Schedule Post'}
      </button>

      {error && (
        <div className="alert alert-danger">
          <IconAlert width={16} height={16} />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="result">
          <p>
            Post status: <strong>{result.status}</strong>
          </p>
          <ul>
            {result.targets.map((t) => (
              <li key={t.id}>
                Page #{t.pageId}: {t.status}
                {t.errorMessage && ` — ${t.errorMessage}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

export default Composer
