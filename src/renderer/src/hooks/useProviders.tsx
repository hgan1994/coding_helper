import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react'
import type { Provider } from '../types/provider'

interface ProvidersContextValue {
  providers: Provider[]
  loading: boolean
  error: string | null
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
    is_active?: boolean
  }) => Promise<void>
  deleteProvider: (id: string) => Promise<void>
  toggleActive: (id: string) => Promise<void>
  testConnection: (id: string) => Promise<{ success: boolean; message: string }>
  refresh: () => Promise<void>
}

const ProvidersContext = createContext<ProvidersContextValue | null>(null)

export function ProvidersProvider({ children }: { children: ReactNode }): JSX.Element {
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProviders = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await window.api.provider.list()
      setProviders(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch providers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchProviders()
  }, [fetchProviders])

  const createProvider = useCallback(
    async (input: {
      name: string
      type: string
      api_key: string
      base_url: string
      model_id: string
      chat_to_responses?: boolean
    }) => {
      await window.api.provider.create(input)
      await fetchProviders()
    },
    [fetchProviders]
  )

  const updateProvider = useCallback(
    async (input: {
      id: string
      name?: string
      type?: string
      api_key?: string
      base_url?: string
      model_id?: string
      chat_to_responses?: boolean
      is_active?: boolean
    }) => {
      await window.api.provider.update(input)
      await fetchProviders()
    },
    [fetchProviders]
  )

  const deleteProvider = useCallback(
    async (id: string) => {
      await window.api.provider.delete(id)
      await fetchProviders()
    },
    [fetchProviders]
  )

  const toggleActive = useCallback(
    async (id: string) => {
      await window.api.provider.toggleActive(id)
      await fetchProviders()
    },
    [fetchProviders]
  )

  const testConnection = useCallback(async (id: string) => {
    return await window.api.provider.testConnection(id)
  }, [])

  return (
    <ProvidersContext.Provider
      value={{
        providers,
        loading,
        error,
        createProvider,
        updateProvider,
        deleteProvider,
        toggleActive,
        testConnection,
        refresh: fetchProviders
      }}
    >
      {children}
    </ProvidersContext.Provider>
  )
}

export function useProviders(): ProvidersContextValue {
  const ctx = useContext(ProvidersContext)
  if (!ctx) {
    throw new Error('useProviders must be used within a ProvidersProvider')
  }
  return ctx
}
