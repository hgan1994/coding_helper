import { ipcMain } from 'electron'
import { getDatabase } from '../database'

export interface Provider {
  id: string
  name: string
  type: string
  api_key: string
  base_url: string
  models: string
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

export function registerProviderIPC(): void {
  ipcMain.handle('provider:list', () => {
    const db = getDatabase()
    const rows = db.prepare('SELECT * FROM providers ORDER BY created_at DESC').all() as Provider[]
    return rows
  })

  ipcMain.handle('provider:getById', (_, id: string) => {
    const db = getDatabase()
    const row = db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as Provider | undefined
    return row || null
  })

  ipcMain.handle('provider:create', (_, input: CreateProviderInput) => {
    const db = getDatabase()
    const id = crypto.randomUUID()
    db.prepare(
      `INSERT INTO providers (id, name, type, api_key, base_url, model_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, input.name, input.type, input.api_key, input.base_url, input.model_id)
    return { id, ...input }
  })

  ipcMain.handle('provider:update', (_, input: UpdateProviderInput) => {
    const db = getDatabase()
    const existing = db.prepare('SELECT * FROM providers WHERE id = ?').get(input.id) as Provider | undefined
    if (!existing) throw new Error('Provider not found')

    const name = input.name ?? existing.name
    const type = input.type ?? existing.type
    const apiKey = input.api_key ?? existing.api_key
    const baseUrl = input.base_url ?? existing.base_url
    const modelId = input.model_id ?? existing.model_id
    const isActive = input.is_active !== undefined ? (input.is_active ? 1 : 0) : existing.is_active

    db.prepare(
      `UPDATE providers SET name = ?, type = ?, api_key = ?, base_url = ?, model_id = ?, is_active = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(name, type, apiKey, baseUrl, modelId, isActive, input.id)
    return { success: true }
  })

  ipcMain.handle('provider:delete', (_, id: string) => {
    const db = getDatabase()
    db.prepare('DELETE FROM providers WHERE id = ?').run(id)
    return { success: true }
  })

  ipcMain.handle('provider:toggleActive', (_, id: string) => {
    const db = getDatabase()
    db.prepare(
      `UPDATE providers SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END, updated_at = datetime('now') WHERE id = ?`
    ).run(id)
    return { success: true }
  })

  ipcMain.handle('provider:testConnection', async (_, _id: string) => {
    return { success: true, message: 'Connection test is not yet implemented' }
  })
}
