import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  provider: {
    list: () => ipcRenderer.invoke('provider:list'),
    getById: (id: string) => ipcRenderer.invoke('provider:getById', id),
    create: (input: {
      name: string
      type: string
      api_key: string
      base_url: string
      model_id: string
    }) => ipcRenderer.invoke('provider:create', input),
    update: (input: {
      id: string
      name?: string
      type?: string
      api_key?: string
      base_url?: string
      model_id?: string
      is_active?: boolean
    }) => ipcRenderer.invoke('provider:update', input),
    delete: (id: string) => ipcRenderer.invoke('provider:delete', id),
    toggleActive: (id: string) => ipcRenderer.invoke('provider:toggleActive', id),
    testConnection: (id: string) => ipcRenderer.invoke('provider:testConnection', id)
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
