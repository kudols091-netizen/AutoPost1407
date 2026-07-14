import { useEffect, useState } from 'react'
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import type { AppInfo } from '@shared/types'
import { IconCalendar, IconChart, IconEdit, IconGear, IconHeart, IconHome, IconLayers, IconLogs } from './components/Icons'
import ConnectPages from './pages/ConnectPages'
import Composer from './pages/Composer'
import Overview from './pages/Overview'
import Schedule from './pages/Schedule'
import Reports from './pages/Reports'
import SystemLogs from './pages/SystemLogs'
import Setup from './pages/Setup'
import LikeComment from './pages/LikeComment'
import PageEditor from './pages/PageEditor'

function App(): JSX.Element {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    window.api.app.getInfo().then(setAppInfo)
  }, [])

  return (
    <HashRouter>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">
              <IconBoltGlyph />
            </div>
            <h1>AutoPost</h1>
          </div>
          <nav>
            <NavLink to="/" end className="nav-link">
              <IconHome /> Tổng quan
            </NavLink>
            <NavLink to="/compose" className="nav-link">
              <IconEdit /> Lên lịch đăng
            </NavLink>
            <NavLink to="/schedule" className="nav-link">
              <IconCalendar /> Quản lý lịch
            </NavLink>
            <NavLink to="/pages" className="nav-link">
              <IconLayers /> Pages
            </NavLink>
            <NavLink to="/page-editor" className="nav-link">
              <IconEdit /> Chỉnh sửa Trang
            </NavLink>
            <NavLink to="/interactions" className="nav-link">
              <IconHeart /> Comment
            </NavLink>
            <NavLink to="/reports" className="nav-link">
              <IconChart /> Báo cáo
            </NavLink>
            <NavLink to="/logs" className="nav-link">
              <IconLogs /> Nhật ký hệ thống
            </NavLink>
            <NavLink to="/setup" className="nav-link">
              <IconGear /> Setup
            </NavLink>
          </nav>
          <div className="sidebar-footer">{appInfo && <p className="version">v{appInfo.version}</p>}</div>
        </aside>
        <main className="content">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/compose" element={<Composer />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/pages" element={<ConnectPages />} />
            <Route path="/page-editor" element={<PageEditor />} />
            <Route path="/interactions" element={<LikeComment />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/logs" element={<SystemLogs />} />
            <Route path="/setup" element={<Setup />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}

function IconBoltGlyph(): JSX.Element {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25}>
      <path d="M11 21 15 12H9L13 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default App
