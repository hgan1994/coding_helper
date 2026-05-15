import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  agent: {
    listProviderSelections: () => ipcRenderer.invoke('agent:listProviderSelections'),
    setProviderSelection: (input: { agent_id: string; provider_id: string }) => ipcRenderer.invoke('agent:setProviderSelection', input)
  },
  provider: {
    list: () => ipcRenderer.invoke('provider:list'),
    getById: (id: string) => ipcRenderer.invoke('provider:getById', id),
    create: (input: {
      name: string
      type: string
      api_key: string
      base_url: string
      model_id: string
      chat_to_responses?: boolean
    }) => ipcRenderer.invoke('provider:create', input),
    update: (input: {
      id: string
      name?: string
      type?: string
      api_key?: string
      base_url?: string
      model_id?: string
      chat_to_responses?: boolean
      is_active?: boolean
    }) => ipcRenderer.invoke('provider:update', input),
    delete: (id: string) => ipcRenderer.invoke('provider:delete', id),
    toggleActive: (id: string) => ipcRenderer.invoke('provider:toggleActive', id),
    testConnection: (id: string) => ipcRenderer.invoke('provider:testConnection', id),
    configureClaudeGlobal: (id: string) => ipcRenderer.invoke('provider:configureClaudeGlobal', id),
    configureCodexGlobal: (id: string) => ipcRenderer.invoke('provider:configureCodexGlobal', id),
    restoreNativeGlobal: (agentId: string) => ipcRenderer.invoke('provider:restoreNativeGlobal', agentId)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
