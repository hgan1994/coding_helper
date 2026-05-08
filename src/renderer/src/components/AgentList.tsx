import { useState } from 'react'
import { useProviders } from '../hooks/useProviders'
import './AgentList.css'

interface Agent {
  id: string
  name: string
  description: string
  provider_id: string
}

const DEFAULT_AGENTS: Agent[] = [
  {
    id: 'claude',
    name: 'Claude',
    description: 'Anthropic Claude 智能助手',
    provider_id: ''
  },
  {
    id: 'codex',
    name: 'Codex',
    description: 'OpenAI Codex 编程助手',
    provider_id: ''
  }
]

export function AgentList(): JSX.Element {
  const { providers } = useProviders()
  const [agents, setAgents] = useState<Agent[]>(DEFAULT_AGENTS)

  const updateAgent = (id: string, field: string, value: string): void => {
    setAgents(agents.map((a) => (a.id === id ? { ...a, [field]: value } : a)))
  }

  return (
    <div className="agent-list-page">
      <div className="agent-list-header">
        <div>
          <h1>Agent 配置</h1>
          <p className="agent-list-subtitle">配置 AI Agent 的供应商</p>
        </div>
      </div>

      <div className="agent-grid">
        {agents.map((agent) => (
          <div key={agent.id} className="agent-card">
            <div className="agent-card-left">
              <h3 className="agent-card-name">{agent.name}</h3>
              <span className="agent-card-desc">{agent.description}</span>
            </div>
            <div className="agent-card-right">
              <select
                value={agent.provider_id}
                onChange={(e) => updateAgent(agent.id, 'provider_id', e.target.value)}
              >
                <option value="">供应商</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button className="btn-outline" onClick={() => { /* TODO */ }}>
                局部窗口
              </button>
              <button className="btn-outline" onClick={() => { /* TODO */ }}>
                全局配置
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
