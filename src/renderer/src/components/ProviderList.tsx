import { useState } from 'react'
import { useProviders } from '../hooks/useProviders'
import { ProviderCard } from './ProviderCard'
import { ProviderForm } from './ProviderForm'
import './ProviderList.css'

export function ProviderList(): JSX.Element {
  const { providers, loading, error, createProvider, updateProvider, deleteProvider, refresh } = useProviders()
  const [showForm, setShowForm] = useState(false)
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null)

  const handleCopy = async (provider: {
    name: string
    type: string
    api_key: string
    base_url: string
    model_id: string
    chat_to_responses: number
  }): Promise<void> => {
    const confirmed = window.confirm(`确认复制一份「${provider.name}」的配置？`)
    if (!confirmed) return
    await createProvider({
      name: provider.name,
      type: provider.type,
      api_key: provider.api_key,
      base_url: provider.base_url,
      model_id: provider.model_id,
      chat_to_responses: provider.chat_to_responses !== 0
    })
  }

  if (loading) {
    return <div className="provider-loading">Loading...</div>
  }

  if (error) {
    return (
      <div className="provider-error">
        <p>Error: {error}</p>
        <button onClick={refresh}>Retry</button>
      </div>
    )
  }

  return (
    <div className="provider-list-page">
      <div className="provider-list-header">
        <div>
          <h1>AI 模型供应商</h1>
          <p className="provider-list-subtitle">
            管理你的 AI 模型供应商配置
          </p>
        </div>
        <button className="btn-add-icon" onClick={() => { setEditingProviderId(null); setShowForm(true) }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {providers.length === 0 ? (
        <div className="provider-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.3">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          </svg>
          <h3>还没有配置任何供应商</h3>
          <p>点击上方按钮添加你的第一个 AI 模型供应商</p>
        </div>
      ) : (
        <div className="provider-grid">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              onEdit={() => { setEditingProviderId(provider.id); setShowForm(true) }}
              onDelete={() => deleteProvider(provider.id)}
              onCopy={() => handleCopy(provider)}
            />
          ))}
        </div>
      )}

      {showForm && (
        <ProviderForm
          providerId={editingProviderId}
          onClose={() => { setShowForm(false); setEditingProviderId(null) }}
          createProvider={createProvider}
          updateProvider={updateProvider}
        />
      )}
    </div>
  )
}
