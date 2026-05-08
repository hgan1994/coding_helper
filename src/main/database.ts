import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

let db: Database.Database

export function initDatabase(): void {
  const dbPath = join(app.getPath('userData'), 'coding-helper.db')
  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'openai',
      api_key TEXT NOT NULL DEFAULT '',
      base_url TEXT NOT NULL DEFAULT '',
      model_id TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const columns = db.prepare("PRAGMA table_info(providers)").all() as { name: string }[]
  const hasModelId = columns.some((col) => col.name === 'model_id')
  const hasModels = columns.some((col) => col.name === 'models')
  if (!hasModelId && hasModels) {
    db.exec(`ALTER TABLE providers ADD COLUMN model_id TEXT NOT NULL DEFAULT ''`)
  }

  console.log('Database initialized at:', dbPath)
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized')
  }
  return db
}
