import { IpcRendererEvent } from 'electron'

export interface ElectronAPI {
  ipcRenderer: {
    sendMessage(channel: string, ...args: unknown[]): void
    on(channel: string, callback: (...args: unknown[]) => void): () => void
    once(channel: string, callback: (...args: unknown[]) => void): () => void
  }
}

export interface ProviderAPI {
  list(): Promise<Provider[]>
  getById(id: string): Promise<Provider | null>
  create(input: CreateProviderInput): Promise<Provider>
  update(input: UpdateProviderInput): Promise<{ success: boolean }>
  delete(id: string): Promise<{ success: boolean }>
  toggleActive(id: string): Promise<{ success: boolean }>
  testConnection(id: string): Promise<{ success: boolean; message: string }>
}

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

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      provider: ProviderAPI
    }
  }
}
