import type { Page } from '../App'
import './Sidebar.css'

const MCODING_URL = 'https://mcoding.huatongai.cn/'

interface SidebarProps {
  currentPage: Page
  onNavigate: (page: Page) => void
}

export function Sidebar({ currentPage, onNavigate }: SidebarProps): JSX.Element {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
        <span className="sidebar-title">Coding Helper</span>
      </div>
      <nav className="sidebar-nav">
        <button
          className={`sidebar-nav-item ${currentPage === 'agents' ? 'active' : ''}`}
          onClick={() => onNavigate('agents')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
          <span>Agent 配置</span>
        </button>
        <button
          className={`sidebar-nav-item ${currentPage === 'providers' ? 'active' : ''}`}
          onClick={() => onNavigate('providers')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="2" width="20" height="8" rx="2" />
            <rect x="2" y="14" width="20" height="8" rx="2" />
            <circle cx="6" cy="6" r="1" fill="currentColor" />
            <circle cx="6" cy="18" r="1" fill="currentColor" />
          </svg>
          <span>AI 供应商</span>
        </button>
      </nav>
      <div className="sidebar-footer">
        <span className="sidebar-footer-label">推荐软件</span>
        <button className="sidebar-promo-item" onClick={() => window.open(MCODING_URL, '_blank')}>
          <span className="sidebar-promo-title">mCoding</span>
          <span className="sidebar-promo-desc">手机远程编程助手</span>
        </button>
      </div>
    </aside>
  )
}
