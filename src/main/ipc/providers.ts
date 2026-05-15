import { execFile, execFileSync } from 'child_process'
import { app, ipcMain } from 'electron'
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { CODEX_PROXY_BASE_URL, startCodexProxyServer, stopCodexProxyServer } from '../codexProxy'
import { getDatabase } from '../database'

export interface Provider {
  id: string
  name: string
  type: string
  api_key: string
  base_url: string
  model_id: string
  chat_to_responses: number
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
  chat_to_responses?: boolean
}

export interface UpdateProviderInput {
  id: string
  name?: string
  type?: string
  api_key?: string
  base_url?: string
  model_id?: string
  chat_to_responses?: boolean
  is_active?: boolean
}

interface AgentProviderSelection {
  agent_id: string
  provider_id: string
  updated_at: string
}

interface GlobalConfigurationResult {
  success: boolean
  message: string
  output: string
}

const CODEX_PROVIDER_ID_PREFIX = 'coding_helper_'
const CODEX_MANAGED_BLOCK_START = '# coding-helper codex provider:start'
const CODEX_MANAGED_BLOCK_END = '# coding-helper codex provider:end'
const CODEX_CHAT_ONLY_HOSTS = ['api.moonshot.cn', 'api.moonshot.ai']
const CODEX_PROXY_LAUNCH_AGENT_LABEL = 'com.coding-helper.codex-proxy'

function getClaudeCodeEnvScriptPath(): string {
  const candidates = [
    join(process.cwd(), 'claude_code_env.sh'),
    join(app.getAppPath(), 'claude_code_env.sh'),
    join(process.resourcesPath, 'claude_code_env.sh')
  ]

  const scriptPath = candidates.find((candidate) => existsSync(candidate))
  if (!scriptPath) {
    throw new Error('Claude Code configuration script not found')
  }

  return scriptPath
}

function configureClaudeCodeGlobal(provider: Provider): Promise<GlobalConfigurationResult> {
  if (!provider.api_key) {
    throw new Error('Provider API key is required')
  }

  if (!provider.model_id) {
    throw new Error('Provider model ID is required')
  }

  const scriptPath = getClaudeCodeEnvScriptPath()

  return new Promise((resolve, reject) => {
    execFile(
      'bash',
      [scriptPath],
      {
        env: {
          ...process.env,
          CLAUDE_API_KEY: provider.api_key,
          CLAUDE_BASE_URL: provider.base_url || '',
          CLAUDE_MODEL_ID: provider.model_id
        },
        maxBuffer: 1024 * 1024,
        timeout: 10 * 60 * 1000
      },
      (error, stdout, stderr) => {
        const output = [stdout, stderr].filter(Boolean).join('\n')
        if (error) {
          reject(new Error(output || error.message))
          return
        }

        resolve({
          success: true,
          message: 'Claude Code global configuration updated',
          output
        })
      }
    )
  })
}

function escapeTomlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function windowsCmdQuote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function tomlStringArray(values: string[]): string {
  return `[${values.map((value) => `"${escapeTomlString(value)}"`).join(', ')}]`
}

function getCodexAuthConfigLines(tokenPath: string): string[] {
  if (process.platform === 'win32') {
    return ['command = "cmd.exe"', `args = ${tomlStringArray(['/d', '/s', '/c', `type ${windowsCmdQuote(tokenPath)}`])}`]
  }

  return ['command = "sh"', `args = ${tomlStringArray(['-c', `cat ${shellSingleQuote(tokenPath)}`])}`]
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function getCodexProviderId(provider: Provider): string {
  return `${CODEX_PROVIDER_ID_PREFIX}${provider.id.replace(/[^A-Za-z0-9_]/g, '_')}`
}

function cleanupCodexTokenFiles(tokenDir: string, keepFileName?: string): void {
  if (!existsSync(tokenDir)) return

  for (const fileName of readdirSync(tokenDir)) {
    if (!fileName.startsWith(CODEX_PROVIDER_ID_PREFIX) || !fileName.endsWith('.token')) continue
    if (fileName === keepFileName) continue

    unlinkSync(join(tokenDir, fileName))
  }
}

function getCodexProxyLaunchAgentPath(): string {
  return join(homedir(), 'Library', 'LaunchAgents', `${CODEX_PROXY_LAUNCH_AGENT_LABEL}.plist`)
}

function getCodexProxyDaemonArgs(): string[] {
  const defaultAppProcess = process as NodeJS.Process & { defaultApp?: boolean }
  if (defaultAppProcess.defaultApp) {
    return [process.execPath, app.getAppPath(), '--codex-proxy-daemon']
  }

  return [process.execPath, '--codex-proxy-daemon']
}

function writeCodexProxyLaunchAgent(): string {
  const launchAgentsDir = join(homedir(), 'Library', 'LaunchAgents')
  const logDir = join(homedir(), '.coding-helper', 'codex', 'logs')
  const plistPath = getCodexProxyLaunchAgentPath()
  const argsXml = getCodexProxyDaemonArgs()
    .map((arg) => `    <string>${xmlEscape(arg)}</string>`)
    .join('\n')

  mkdirSync(launchAgentsDir, { recursive: true })
  mkdirSync(logDir, { recursive: true })
  writeFileSync(
    plistPath,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${CODEX_PROXY_LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${argsXml}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xmlEscape(join(logDir, 'codex-proxy.out.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(join(logDir, 'codex-proxy.err.log'))}</string>
</dict>
</plist>
`,
    'utf-8'
  )

  return plistPath
}

function launchctlDomain(): string {
  const uid = typeof process.getuid === 'function' ? process.getuid() : 501
  return `gui/${uid}`
}

function runLaunchctl(args: string[], allowFailure = false): void {
  try {
    execFileSync('launchctl', args, { stdio: 'ignore' })
  } catch (error) {
    if (!allowFailure) throw error
  }
}

async function installCodexProxyLaunchAgent(): Promise<void> {
  if (process.platform !== 'darwin') {
    startCodexProxyServer()
    return
  }

  const plistPath = writeCodexProxyLaunchAgent()
  const domain = launchctlDomain()
  await stopCodexProxyServer()
  try {
    runLaunchctl(['bootout', domain, plistPath], true)
    runLaunchctl(['bootstrap', domain, plistPath])
    runLaunchctl(['kickstart', '-k', `${domain}/${CODEX_PROXY_LAUNCH_AGENT_LABEL}`], true)
  } catch (error) {
    startCodexProxyServer()
    throw error
  }
}

function uninstallCodexProxyLaunchAgent(): void {
  if (process.platform !== 'darwin') {
    return
  }

  const plistPath = getCodexProxyLaunchAgentPath()
  runLaunchctl(['bootout', launchctlDomain(), plistPath], true)
  if (existsSync(plistPath)) unlinkSync(plistPath)
}

function removeCodexManagedBlock(content: string): string {
  const start = CODEX_MANAGED_BLOCK_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const end = CODEX_MANAGED_BLOCK_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return content.replace(new RegExp(`\\n?${start}[\\s\\S]*?${end}\\n?`, 'g'), '\n').trimStart()
}

function isCodexProviderSectionHeader(line: string): boolean {
  const match = line.trim().match(/^\[([^\]]+)\]$/)
  if (!match) return false

  const sectionName = match[1].replace(/"/g, '')
  return sectionName.startsWith(`model_providers.${CODEX_PROVIDER_ID_PREFIX}`)
}

function removeCodexProviderSections(content: string): string {
  const lines: string[] = []
  let skippingCodexProviderSection = false

  for (const line of content.split('\n')) {
    const isSectionHeader = /^\s*\[[^\]]+\]\s*$/.test(line)

    if (isSectionHeader) {
      skippingCodexProviderSection = isCodexProviderSectionHeader(line)
      if (skippingCodexProviderSection) continue
    }

    if (!skippingCodexProviderSection) {
      lines.push(line)
    }
  }

  return lines.join('\n').trimStart()
}

function removeTopLevelTomlKeys(content: string, keys: string[]): string {
  let isTopLevel = true
  const keyPattern = new RegExp(`^\\s*(${keys.join('|')})\\s*=`)

  return content
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim()
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        isTopLevel = false
      }

      return !(isTopLevel && keyPattern.test(line))
    })
    .join('\n')
}

function setTopLevelTomlKeys(content: string, entries: Record<string, string>): string {
  const body = removeTopLevelTomlKeys(content, Object.keys(entries)).trimStart()
  const header = Object.entries(entries)
    .map(([key, value]) => `${key} = "${escapeTomlString(value)}"`)
    .join('\n')

  return `${header}\n\n${body}`.trimEnd() + '\n'
}

async function configureCodexGlobal(provider: Provider): Promise<GlobalConfigurationResult> {
  if (!provider.api_key) {
    throw new Error('Provider API key is required')
  }

  if (!provider.base_url) {
    throw new Error('Provider base URL is required')
  }

  if (!provider.model_id) {
    throw new Error('Provider model ID is required')
  }

  let normalizedBaseUrl: URL
  try {
    normalizedBaseUrl = new URL(provider.base_url)
  } catch {
    throw new Error('Provider base URL is invalid')
  }

  if (!provider.chat_to_responses && normalizedBaseUrl.pathname.includes('/chat/completions')) {
    throw new Error('Codex 直连不支持 Chat Completions 地址。请开启 chat 转 response，或填写兼容 Responses API 的 Base URL')
  }

  if (!provider.chat_to_responses && CODEX_CHAT_ONLY_HOSTS.includes(normalizedBaseUrl.host)) {
    throw new Error('Kimi/Moonshot 当前是 Chat Completions 接口。请开启 chat 转 response 后再写入 Codex 全局配置')
  }

  const codexConfigDir = join(homedir(), '.codex')
  const tokenDir = join(homedir(), '.coding-helper', 'codex')
  const providerId = getCodexProviderId(provider)
  const tokenFileName = `${providerId}.token`
  const tokenPath = join(tokenDir, tokenFileName)
  const configPath = join(codexConfigDir, 'config.toml')

  mkdirSync(codexConfigDir, { recursive: true })
  mkdirSync(tokenDir, { recursive: true })
  writeFileSync(tokenPath, provider.api_key, { encoding: 'utf-8', mode: 0o600 })
  chmodSync(tokenPath, 0o600)
  cleanupCodexTokenFiles(tokenDir, tokenFileName)

  const existingConfig = existsSync(configPath) ? readFileSync(configPath, 'utf-8') : ''
  const unmanagedConfig = removeTopLevelTomlKeys(removeCodexProviderSections(removeCodexManagedBlock(existingConfig)), [
    'model',
    'model_provider'
  ])
  const codexBaseUrl = provider.chat_to_responses
    ? `${CODEX_PROXY_BASE_URL}/codex/${provider.id}/v1`
    : provider.base_url
  const authConfigLines = getCodexAuthConfigLines(tokenPath)
  const managedBlock = [
    CODEX_MANAGED_BLOCK_START,
    `[model_providers.${providerId}]`,
    `name = "${escapeTomlString(provider.name)}"`,
    `base_url = "${escapeTomlString(codexBaseUrl)}"`,
    'wire_api = "responses"',
    '',
    `[model_providers.${providerId}.auth]`,
    ...authConfigLines,
    CODEX_MANAGED_BLOCK_END
  ].join('\n')
  const nextConfig = setTopLevelTomlKeys(`${unmanagedConfig.trimEnd()}\n\n${managedBlock}\n`, {
    model: provider.model_id,
    model_provider: providerId
  })

  writeFileSync(configPath, nextConfig, 'utf-8')
  if (provider.chat_to_responses) {
    await installCodexProxyLaunchAgent()
  } else {
    uninstallCodexProxyLaunchAgent()
  }

  return {
    success: true,
    message: 'Codex global configuration updated',
    output: ''
  }
}

function restoreClaudeCodeNativeGlobal(): GlobalConfigurationResult {
  const settingsPath = join(homedir(), '.claude', 'settings.json')
  if (!existsSync(settingsPath)) {
    return {
      success: true,
      message: 'Claude Code native global configuration restored',
      output: ''
    }
  }

  const content = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>
  const env = { ...((content.env as Record<string, unknown> | undefined) ?? {}) }

  delete env.ANTHROPIC_AUTH_TOKEN
  delete env.ANTHROPIC_BASE_URL
  delete env.ANTHROPIC_MODEL
  delete env.API_TIMEOUT_MS
  delete env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC

  if (Object.keys(env).length > 0) {
    content.env = env
  } else {
    delete content.env
  }

  writeFileSync(settingsPath, JSON.stringify(content, null, 2), 'utf-8')

  return {
    success: true,
    message: 'Claude Code native global configuration restored',
    output: ''
  }
}

function restoreCodexNativeGlobal(): GlobalConfigurationResult {
  const configPath = join(homedir(), '.codex', 'config.toml')
  const tokenDir = join(homedir(), '.coding-helper', 'codex')

  if (existsSync(configPath)) {
    const existingConfig = readFileSync(configPath, 'utf-8')
    const nextConfig = removeTopLevelTomlKeys(removeCodexManagedBlock(existingConfig), ['model', 'model_provider']).trim()
    writeFileSync(configPath, nextConfig ? `${nextConfig}\n` : '', 'utf-8')
  }
  cleanupCodexTokenFiles(tokenDir)
  uninstallCodexProxyLaunchAgent()

  return {
    success: true,
    message: 'Codex native global configuration restored',
    output: ''
  }
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
      `INSERT INTO providers (id, name, type, api_key, base_url, model_id, chat_to_responses)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, input.name, input.type, input.api_key, input.base_url, input.model_id, input.chat_to_responses ? 1 : 0)
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
    const chatToResponses =
      input.chat_to_responses !== undefined ? (input.chat_to_responses ? 1 : 0) : existing.chat_to_responses
    const isActive = input.is_active !== undefined ? (input.is_active ? 1 : 0) : existing.is_active

    db.prepare(
      `UPDATE providers SET name = ?, type = ?, api_key = ?, base_url = ?, model_id = ?, chat_to_responses = ?, is_active = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(name, type, apiKey, baseUrl, modelId, chatToResponses, isActive, input.id)
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

  ipcMain.handle('provider:configureClaudeGlobal', async (_, id: string) => {
    const db = getDatabase()
    const provider = db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as Provider | undefined
    if (!provider) throw new Error('Provider not found')

    return configureClaudeCodeGlobal(provider)
  })

  ipcMain.handle('provider:configureCodexGlobal', async (_, id: string) => {
    const db = getDatabase()
    const provider = db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as Provider | undefined
    if (!provider) throw new Error('Provider not found')

    return await configureCodexGlobal(provider)
  })

  ipcMain.handle('provider:restoreNativeGlobal', async (_, agentId: string) => {
    if (agentId === 'claude') {
      return restoreClaudeCodeNativeGlobal()
    }

    if (agentId === 'codex') {
      return restoreCodexNativeGlobal()
    }

    throw new Error('Unsupported agent')
  })

  ipcMain.handle('agent:listProviderSelections', () => {
    const db = getDatabase()
    return db
      .prepare('SELECT agent_id, provider_id, updated_at FROM agent_provider_configs ORDER BY agent_id ASC')
      .all() as AgentProviderSelection[]
  })

  ipcMain.handle('agent:setProviderSelection', (_, input: { agent_id: string; provider_id: string }) => {
    if (!input.agent_id) {
      throw new Error('Agent ID is required')
    }

    if (!input.provider_id) {
      throw new Error('Provider ID is required')
    }

    const db = getDatabase()
    db.prepare(
      `INSERT INTO agent_provider_configs (agent_id, provider_id)
       VALUES (?, ?)
       ON CONFLICT(agent_id) DO UPDATE SET provider_id = excluded.provider_id, updated_at = datetime('now')`
    ).run(input.agent_id, input.provider_id)

    return { success: true }
  })
}
