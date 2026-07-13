import { useEffect, useState } from 'react'
import type { AppInfo } from '@shared/types'
import { IconAlert } from '../components/Icons'

function Setup(): JSX.Element {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    window.api.app.getInfo().then(setAppInfo)
  }, [])

  return (
    <section className="setup">
      <div className="page-header">
        <h2>Setup</h2>
        <p>Thông tin cấu hình hiện tại của AutoPost trên máy này.</p>
      </div>

      {!appInfo ? (
        <p className="hint">Đang tải…</p>
      ) : (
        <div className="setup-info-grid">
          <div className="setup-info-row">
            <span className="setup-info-label">Phiên bản AutoPost</span>
            <span className="setup-info-value">{appInfo.version}</span>
          </div>
          <div className="setup-info-row">
            <span className="setup-info-label">Graph API</span>
            <span className="setup-info-value">{appInfo.graphApiVersion}</span>
          </div>
          <div className="setup-info-row">
            <span className="setup-info-label">Meta App ID</span>
            <span className="setup-info-value">{appInfo.metaAppId ?? 'Chưa cấu hình'}</span>
          </div>
        </div>
      )}

      {appInfo && !appInfo.metaAppId && (
        <div className="alert alert-danger">
          <IconAlert width={16} height={16} />
          <span>
            Chưa tìm thấy META_APP_ID / META_APP_SECRET. Sao chép .env.example thành .env và điền thông tin
            Meta App của bạn từ developers.facebook.com/apps, sau đó khởi động lại AutoPost.
          </span>
        </div>
      )}

      <p className="hint" style={{ marginTop: '1.25rem' }}>
        Đổi App ID/Secret yêu cầu sửa file .env trong thư mục cài đặt và khởi động lại ứng dụng — chưa hỗ trợ sửa
        trực tiếp trong giao diện để tránh lộ App Secret.
      </p>
    </section>
  )
}

export default Setup
