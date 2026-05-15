import { useEffect, useState } from 'react'
import { useProviders } from '../hooks/useProviders'
import './AgentList.css'

const NATIVE_PROVIDER_ID = '__native__'
const AGENT_PROVIDER_STORAGE_KEY = 'coding-helper:agent-provider-selection'
type AgentProviderType = 'anthropic' | 'openai'

interface AgentConfig {
  id: string
  name: string
  description: string
  providerType: AgentProviderType
}

const AGENT_CONFIGS: AgentConfig[] = [
  { id: 'claude', name: 'Claude', description: 'Anthropic Claude 智能助手', providerType: 'anthropic' },
  { id: 'codex', name: 'Codex', description: 'OpenAI Codex 编程助手', providerType: 'openai' }
]

interface Agent extends AgentConfig {
  provider_id: string
}

const DEFAULT_AGENTS: Agent[] = AGENT_CONFIGS.map((config) => ({ ...config, provider_id: NATIVE_PROVIDER_ID }))

function readPersistedProviderSelections(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(AGENT_PROVIDER_STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}

    return Object.entries(parsed).reduce<Record<string, string>>((result, [agentId, providerId]) => {
      if (typeof providerId === 'string') {
        result[agentId] = providerId
      }
      return result
    }, {})
  } catch {
    return {}
  }
}

function buildInitialAgents(): Agent[] {
  const persistedSelections = readPersistedProviderSelections()

  return DEFAULT_AGENTS.map((agent) => ({
    ...agent,
    provider_id: persistedSelections[agent.id] || NATIVE_PROVIDER_ID
  }))
}

export function AgentList(): JSX.Element {
  const { providers, loading: providersLoading, error: providersError } = useProviders()
  const [agents, setAgents] = useState<Agent[]>(DEFAULT_AGENTS)
  const [agentSelectionsLoading, setAgentSelectionsLoading] = useState(true)
  const [configuringAgentId, setConfiguringAgentId] = useState<string | null>(null)
  const [statusByAgentId, setStatusByAgentId] = useState<Record<string, string>>({})
  const [statusTypeByAgentId, setStatusTypeByAgentId] = useState<Record<string, 'success' | 'info' | 'error'>>({})

  useEffect(() => {
    let cancelled = false

    async function loadAgentSelections(): Promise<void> {
      try {
        const dbSelections = await window.api.agent.listProviderSelections()
        const localSelections = readPersistedProviderSelections()
        const dbSelectionByAgentId = dbSelections.reduce<Record<string, string>>((result, selection) => {
          result[selection.agent_id] = selection.provider_id
          return result
        }, {})

        const nextAgents = DEFAULT_AGENTS.map((agent) => {
          const providerId = dbSelectionByAgentId[agent.id] || localSelections[agent.id] || NATIVE_PROVIDER_ID
          return { ...agent, provider_id: providerId }
        })

        if (cancelled) return
        setAgents(nextAgents)

        for (const agent of nextAgents) {
          if (dbSelectionByAgentId[agent.id] !== agent.provider_id) {
            await window.api.agent.setProviderSelection({ agent_id: agent.id, provider_id: agent.provider_id })
          }
        }
      } catch (err) {
        if (!cancelled) {
          setAgents(buildInitialAgents())
          setStatusByAgentId((currentStatus) => ({
            ...currentStatus,
            codex: err instanceof Error ? `Agent 配置读取失败：${err.message}` : 'Agent 配置读取失败'
          }))
          setStatusTypeByAgentId((currentStatus) => ({ ...currentStatus, codex: 'error' }))
        }
      } finally {
        if (!cancelled) {
          setAgentSelectionsLoading(false)
        }
      }
    }

    void loadAgentSelections()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (agentSelectionsLoading || providersLoading || providersError) {
      return
    }

    const nextAgents = agents.map((agent) => {
      if (agent.provider_id === NATIVE_PROVIDER_ID) {
        return agent
      }

      const matchedProvider = providers.find((provider) => provider.id === agent.provider_id && provider.type === agent.providerType)
      return matchedProvider ? agent : { ...agent, provider_id: NATIVE_PROVIDER_ID }
    })

    const hasChanges = nextAgents.some((agent, index) => agent.provider_id !== agents[index]?.provider_id)
    if (hasChanges) {
      setAgents(nextAgents)
      for (const agent of nextAgents) {
        if (agent.provider_id !== agents.find((currentAgent) => currentAgent.id === agent.id)?.provider_id) {
          void window.api.agent.setProviderSelection({ agent_id: agent.id, provider_id: agent.provider_id })
        }
      }
    }
  }, [agentSelectionsLoading, agents, providers, providersError, providersLoading])

  const persistLocalSelections = (nextAgents: Agent[]): void => {
    const persistedSelections = nextAgents.reduce<Record<string, string>>((result, agent) => {
      result[agent.id] = agent.provider_id
      return result
    }, {})

    window.localStorage.setItem(AGENT_PROVIDER_STORAGE_KEY, JSON.stringify(persistedSelections))
  }

  const updateAgentProvider = async (id: string, value: string): Promise<void> => {
    const nextAgents = agents.map((agent) => (agent.id === id ? { ...agent, provider_id: value } : agent))
    setAgents(nextAgents)
    persistLocalSelections(nextAgents)
    setStatusByAgentId((currentStatus) => ({ ...currentStatus, [id]: '' }))
    setStatusTypeByAgentId((currentStatus) => ({ ...currentStatus, [id]: 'info' }))

    try {
      await window.api.agent.setProviderSelection({ agent_id: id, provider_id: value })
    } catch (err) {
      setStatusByAgentId((currentStatus) => ({
        ...currentStatus,
        [id]: err instanceof Error ? `供应商选择保存失败：${err.message}` : '供应商选择保存失败'
      }))
      setStatusTypeByAgentId((currentStatus) => ({ ...currentStatus, [id]: 'error' }))
    }
  }

  const configureGlobal = async (agent: Agent): Promise<void> => {
    const isNativeProvider = agent.provider_id === NATIVE_PROVIDER_ID
    const provider = isNativeProvider ? null : providers.find((p) => p.id === agent.provider_id)
    const agentDisplayName = agent.id === 'claude' ? 'Claude Code' : agent.name
    const actionText = isNativeProvider ? '恢复原生全局配置' : '写入全局配置'

    if (!isNativeProvider && !provider) {
      setStatusByAgentId((currentStatus) => ({ ...currentStatus, [agent.id]: '请先选择供应商' }))
      setStatusTypeByAgentId((currentStatus) => ({ ...currentStatus, [agent.id]: 'error' }))
      return
    }

    if (!isNativeProvider && agent.id === 'claude' && !provider?.model_id) {
      setStatusByAgentId((currentStatus) => ({ ...currentStatus, [agent.id]: '供应商缺少模型 ID' }))
      setStatusTypeByAgentId((currentStatus) => ({ ...currentStatus, [agent.id]: 'error' }))
      return
    }

    if (!isNativeProvider && agent.id === 'codex' && (!provider?.model_id || !provider.base_url)) {
      const message = !provider?.model_id ? '供应商缺少模型 ID' : '供应商缺少 Base URL'
      setStatusByAgentId((currentStatus) => ({ ...currentStatus, [agent.id]: message }))
      setStatusTypeByAgentId((currentStatus) => ({ ...currentStatus, [agent.id]: 'error' }))
      return
    }

    const confirmed = window.confirm(
      isNativeProvider
        ? `确认将 ${agentDisplayName} 恢复为原生全局配置？`
        : `确认将 ${agentDisplayName} 全局配置切换到「${provider?.name}」的「${provider?.model_id}」模型？`
    )
    if (!confirmed) return

    setConfiguringAgentId(agent.id)
    setStatusByAgentId((currentStatus) => ({
      ...currentStatus,
      [agent.id]: `正在${actionText}...`
    }))
    setStatusTypeByAgentId((currentStatus) => ({ ...currentStatus, [agent.id]: 'info' }))

    try {
      if (isNativeProvider) {
        await window.api.provider.restoreNativeGlobal(agent.id)
        setStatusByAgentId((currentStatus) => ({ ...currentStatus, [agent.id]: `${agentDisplayName} 已恢复原生全局配置` }))
        window.alert(`已恢复原生配置，请退出已经打开的 ${agentDisplayName} 窗口，重新打开后生效。`)
      } else if (agent.id === 'claude' && provider) {
        if (!provider.model_id) {
          throw new Error('供应商缺少模型 ID')
        }

        await window.api.provider.configureClaudeGlobal(provider.id)
        setStatusByAgentId((currentStatus) => ({ ...currentStatus, [agent.id]: 'Claude Code 全局配置已更新' }))
        window.alert('配置成功，请退出已经打开的 Claude Code 窗口，重新打开后生效。')
      } else if (agent.id === 'codex' && provider) {
        await window.api.provider.configureCodexGlobal(provider.id)
        setStatusByAgentId((currentStatus) => ({ ...currentStatus, [agent.id]: 'Codex 全局配置已更新' }))
        window.alert('配置成功，请退出已经打开的 Codex 窗口，重新打开后生效。')
      } else {
        throw new Error('暂未支持该 Agent 的自定义供应商全局配置')
      }
      setStatusTypeByAgentId((currentStatus) => ({ ...currentStatus, [agent.id]: 'success' }))
    } catch (err) {
      const message = err instanceof Error ? err.message : '全局配置失败'
      setStatusByAgentId((currentStatus) => ({ ...currentStatus, [agent.id]: message }))
      setStatusTypeByAgentId((currentStatus) => ({ ...currentStatus, [agent.id]: 'error' }))
    } finally {
      setConfiguringAgentId(null)
    }
  }

  return (
    <div className="agent-list-page">
      <div className="agent-list-header">
        <div>
          <h1>Agent 配置</h1>
          <p className="agent-list-subtitle">配置 AI Agent 的供应商</p>
        </div>
      </div>

      <div className="agent-grid">
        {agents.map((agent) => {
          const isConfiguring = configuringAgentId === agent.id
          const isNativeProvider = agent.provider_id === NATIVE_PROVIDER_ID
          const selectedProvider = providers.find((p) => p.id === agent.provider_id)
          const canConfigureGlobal =
            !isConfiguring && (isNativeProvider || ((agent.id === 'claude' || agent.id === 'codex') && !!selectedProvider))

          return (
            <div key={agent.id} className="agent-card">
              <div className="agent-card-left">
                <h3 className="agent-card-name">{agent.name}</h3>
                <span className="agent-card-desc">{agent.description}</span>
                {statusByAgentId[agent.id] && (
                  <span className={`agent-card-status agent-card-status-${statusTypeByAgentId[agent.id] ?? 'info'}`}>
                    {statusByAgentId[agent.id]}
                  </span>
                )}
              </div>
              <div className="agent-card-right">
                <select
                  value={agent.provider_id}
                  disabled={agentSelectionsLoading}
                  onChange={(e) => void updateAgentProvider(agent.id, e.target.value)}
                >
                  <option value="" disabled>
                    供应商
                  </option>
                  <option value={NATIVE_PROVIDER_ID}>原生</option>
                  {providers
                    .filter((p) => p.type === agent.providerType)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
                <button
                  className="btn-outline"
                  disabled={!canConfigureGlobal}
                  title={
                    isNativeProvider
                      ? '恢复原生全局配置'
                      : agent.id === 'claude'
                        ? '使用选中供应商写入 Claude Code 全局配置'
                        : agent.id === 'codex'
                          ? '使用选中供应商写入 Codex 全局配置'
                          : '暂未支持该 Agent 的自定义供应商全局配置'
                  }
                  onClick={() => configureGlobal(agent)}
                >
                  {isConfiguring ? '配置中...' : '全局配置'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
