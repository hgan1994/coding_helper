import { useState, useEffect, useCallback } from 'react'
import type { Provider } from '../types/provider'

export function useProviders() {
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
    fetchProviders()
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

  return {
    providers,
    loading,
    error,
    createProvider,
    updateProvider,
    deleteProvider,
    toggleActive,
    testConnection,
    refresh: fetchProviders
  }
}
