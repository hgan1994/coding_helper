import { useState } from 'react'
import { ProviderList } from './components/ProviderList'
import { AgentList } from './components/AgentList'
import './App.css'

export type Page = 'providers' | 'agents'

function App(): JSX.Element {
  const [currentPage, setCurrentPage] = useState<Page>('providers')

  return (
    <div className="app-layout">
      <header className="app-header">
        <nav className="app-tabs">
          <button
            className={`app-tab ${currentPage === 'providers' ? 'active' : ''}`}
            onClick={() => setCurrentPage('providers')}
          >
            供应商
          </button>
          <button
            className={`app-tab ${currentPage === 'agents' ? 'active' : ''}`}
            onClick={() => setCurrentPage('agents')}
          >
            Agent 配置
          </button>
        </nav>
      </header>
      <main className="app-main">
        <div className={currentPage === 'providers' ? '' : 'page-hidden'}>
          <ProviderList />
        </div>
        <div className={currentPage === 'agents' ? '' : 'page-hidden'}>
          <AgentList />
        </div>
      </main>
    </div>
  )
}

export default App
