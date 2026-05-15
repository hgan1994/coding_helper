import { useState } from 'react'
import { ProviderList } from './components/ProviderList'
import { AgentList } from './components/AgentList'
import { Sidebar } from './components/Sidebar'
import './App.css'

export type Page = 'providers' | 'agents'

function App(): JSX.Element {
  const [currentPage, setCurrentPage] = useState<Page>('agents')

  return (
    <div className="app-layout">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <main className="app-main">
        <div className={`app-page ${currentPage === 'providers' ? '' : 'page-hidden'}`}>
          <ProviderList />
        </div>
        <div className={`app-page ${currentPage === 'agents' ? '' : 'page-hidden'}`}>
          <AgentList />
        </div>
      </main>
    </div>
  )
}

export default App
