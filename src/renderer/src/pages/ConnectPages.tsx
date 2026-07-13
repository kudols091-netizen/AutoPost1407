import { useCallback, useEffect, useState } from 'react'
import type { Page } from '@shared/types'
import { IconAlert, IconInbox } from '../components/Icons'

function ConnectPages(): JSX.Element {
  const [pages, setPages] = useState<Page[]>([])
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setPages(await window.api.pages.list())
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleConnect = async (): Promise<void> => {
    setIsConnecting(true)
    setError(null)
    try {
      const connected = await window.api.pages.connect()
      setPages(connected)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to Facebook.')
    } finally {
      setIsConnecting(false)
    }
  }

  return (
    <section className="connect-pages">
      <div className="page-header">
        <h2>Connect Facebook Pages</h2>
        <p>
          Connect the Pages you manage. This opens your browser to log in with Facebook — AutoPost
          never sees your password, only the Page access it's granted.
        </p>
      </div>

      <button className="btn btn-primary" onClick={handleConnect} disabled={isConnecting}>
        {isConnecting ? 'Connecting…' : 'Connect a Facebook Page'}
      </button>

      {error && (
        <div className="alert alert-danger">
          <IconAlert width={16} height={16} />
          <span>{error}</span>
        </div>
      )}

      {pages.length > 0 && (
        <ul className="page-list">
          {pages.map((page) => (
            <li key={page.id} className={page.tokenStatus === 'needs_reauth' ? 'needs-reauth' : ''}>
              {page.pictureUrl && <img src={page.pictureUrl} alt="" width={32} height={32} />}
              <span>{page.name}</span>
              {page.tokenStatus === 'needs_reauth' && (
                <span className="badge">Reconnect needed</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {pages.length === 0 && (
        <div className="empty-state" style={{ marginTop: '1.5rem', maxWidth: 520 }}>
          <IconInbox width={22} height={22} />
          <p>No Pages connected yet. Connect one above to start scheduling posts.</p>
        </div>
      )}
    </section>
  )
}

export default ConnectPages
