import { useState, useEffect } from 'react'
import { PROVIDER_TYPES, getProviderDefaultBaseUrl } from '../types/provider'
import type { Provider } from '../types/provider'
import './ProviderForm.css'

interface ProviderFormProps {
  providerId: string | null
  onClose: () => void
  createProvider: (input: {
    name: string
    type: string
    api_key: string
    base_url: string
    model_id: string
    chat_to_responses?: boolean
  }) => Promise<void>
  updateProvider: (input: {
    id: string
    name?: string
    type?: string
    api_key?: string
    base_url?: string
    model_id?: string
    chat_to_responses?: boolean
  }) => Promise<void>
}

export function ProviderForm({ providerId, onClose, createProvider, updateProvider }: ProviderFormProps): JSX.Element {
  const [name, setName] = useState('')
  const [type, setType] = useState('openai')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [modelId, setModelId] = useState('')
  const [chatToResponses, setChatToResponses] = useState(false)
  const [saving, setSaving] = useState(false)

  const isEditing = !!providerId

  useEffect(() => {
    if (providerId) {
      window.api.provider.getById(providerId).then((provider: Provider | null) => {
        if (provider) {
          setName(provider.name)
          setType(provider.type)
          setApiKey(provider.api_key)
          setBaseUrl(provider.base_url)
          setModelId(provider.model_id || '')
          setChatToResponses(provider.chat_to_responses !== 0)
        }
      })
    }
  }, [providerId])

  const handleTypeChange = (newType: string): void => {
    setType(newType)
    const defaultUrl = getProviderDefaultBaseUrl(newType)
    if (defaultUrl && !baseUrl) {
      setBaseUrl(defaultUrl)
    }
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setSaving(true)
    try {
      if (isEditing && providerId) {
        await updateProvider({
          id: providerId,
          name,
          type,
          api_key: apiKey,
          base_url: baseUrl,
          model_id: modelId,
          chat_to_responses: type === 'openai' ? chatToResponses : false
        })
      } else {
        await createProvider({
          name,
          type,
          api_key: apiKey,
          base_url: baseUrl,
          model_id: modelId,
          chat_to_responses: type === 'openai' ? chatToResponses : false
        })
      }
      onClose()
    } catch (err) {
      console.error('Failed to save provider:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEditing ? '编辑供应商' : '添加供应商'}</h2>
          <button className="btn-icon" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-body">
            <div className="form-group">
              <label>名称 <span className="required">*</span></label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. My OpenAI"
                required
              />
            </div>

            <div className="form-group">
              <label>协议类型 <span className="required">*</span></label>
              <select value={type} onChange={(e) => handleTypeChange(e.target.value)} required>
                {PROVIDER_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Base URL <span className="required">*</span></label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={getProviderDefaultBaseUrl(type) || 'https://api.example.com/v1'}
                required
              />
              {type === 'openai' && (
                <p className="form-hint">Codex 原生只支持 Responses API；如果供应商只有 Chat Completions，请开启下方中转。</p>
              )}
            </div>

            <div className="form-group">
              <label>API Key <span className="required">*</span></label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                required
              />
            </div>

            <div className="form-group">
              <label>模型 ID <span className="required">*</span></label>
              <input
                type="text"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                placeholder="e.g. gpt-4o"
                required
              />
            </div>

            {type === 'openai' && (
              <label className="form-checkbox">
                <input
                  type="checkbox"
                  checked={chatToResponses}
                  onChange={(e) => setChatToResponses(e.target.checked)}
                />
                <span>chat 转 response（用于 Kimi/Moonshot 等 Chat Completions 供应商）</span>
              </label>
            )}
          </div>

          <div className="form-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || !name || !apiKey || !baseUrl || !modelId}>
              {saving ? '保存中...' : isEditing ? '更新' : '添加'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
