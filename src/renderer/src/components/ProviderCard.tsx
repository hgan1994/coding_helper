import { getProviderTypeLabel } from '../types/provider'
import type { Provider } from '../types/provider'
import './ProviderCard.css'

interface ProviderCardProps {
  provider: Provider
  onEdit: () => void
  onDelete: () => void
  onCopy: () => void
}

function CopyIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function ClipboardButton({ text }: { text: string }): JSX.Element {
  const handleCopy = (): void => {
    navigator.clipboard.writeText(text)
  }

  return (
    <button className="btn-clipboard" title="复制到剪贴板" onClick={handleCopy}>
      <CopyIcon />
    </button>
  )
}

export function ProviderCard({ provider, onEdit, onDelete, onCopy }: ProviderCardProps): JSX.Element {
  const typeLabel = getProviderTypeLabel(provider.type)

  return (
    <div className="provider-card">
      <div className="provider-card-header">
        <div className="provider-card-info">
          <div className="provider-card-name-row">
            <h3 className="provider-card-name">{provider.name}</h3>
          </div>
          <span className="provider-card-type">{typeLabel}</span>
          {provider.type === 'openai' && provider.chat_to_responses !== 0 && (
            <span className="provider-card-type">chat 转 response</span>
          )}
        </div>
        <div className="provider-card-actions">
          <button className="btn-icon" title="编辑" onClick={onEdit}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button className="btn-icon btn-danger" title="删除" onClick={onDelete}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
          <button className="btn-icon" title="克隆配置" onClick={onCopy}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
            </svg>
          </button>
        </div>
      </div>

      <div className="provider-card-body">
        {provider.base_url && (
          <div className="provider-card-field">
            <span className="field-label">Base URL</span>
            <div className="field-value-row">
              <span className="field-value field-url">{provider.base_url}</span>
              <ClipboardButton text={provider.base_url} />
            </div>
          </div>
        )}
        <div className="provider-card-field">
          <span className="field-label">API Key</span>
          <div className="field-value-row">
            <span className="field-value">{maskApiKey(provider.api_key)}</span>
            <ClipboardButton text={provider.api_key} />
          </div>
        </div>
        {provider.model_id && (
          <div className="provider-card-field">
            <span className="field-label">模型 ID</span>
            <div className="field-value-row">
              <span className="field-value">{provider.model_id}</span>
              <ClipboardButton text={provider.model_id} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function maskApiKey(key: string): string {
  if (!key) return 'Not set'
  if (key.length <= 8) return '••••••••'
  return key.substring(0, 4) + '••••••••' + key.substring(key.length - 4)
}
