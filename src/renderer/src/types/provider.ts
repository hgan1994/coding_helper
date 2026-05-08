export interface Provider {
  id: string
  name: string
  type: string
  api_key: string
  base_url: string
  model_id: string
  is_active: number
  created_at: string
  updated_at: string
}

export interface CreateProviderInput {
  name: string
  type: string
  api_key: string
  base_url: string
  model_id: string
}

export interface UpdateProviderInput {
  id: string
  name?: string
  type?: string
  api_key?: string
  base_url?: string
  model_id?: string
  is_active?: boolean
}

export const PROVIDER_TYPES = [
  { value: 'openai', label: 'OpenAI', defaultBaseUrl: 'https://api.openai.com/v1' },
  { value: 'anthropic', label: 'Anthropic', defaultBaseUrl: 'https://api.anthropic.com' }
] as const

export function getProviderTypeLabel(type: string): string {
  return PROVIDER_TYPES.find((t) => t.value === type)?.label || type
}

export function getProviderDefaultBaseUrl(type: string): string {
  return PROVIDER_TYPES.find((t) => t.value === type)?.defaultBaseUrl || ''
}
