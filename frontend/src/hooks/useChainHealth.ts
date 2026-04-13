import { useEffect, useState, useCallback } from 'react'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const POLL_INTERVAL = 30_000

interface ChainStatus {
  chainId: number
  name: string
  status: 'ok' | 'error'
  latency_ms: number
  block?: number
}

interface ChainsHealth {
  chains: ChainStatus[]
  total: number
  healthy: number
}

const FALLBACK: ChainsHealth = { chains: [], total: 0, healthy: 0 }

export function useChainHealth() {
  const [data, setData] = useState<ChainsHealth>(FALLBACK)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/health/chains`)
      if (!res.ok) throw new Error('not ok')
      const json: ChainsHealth = await res.json()
      setData(json)
    } catch {
      setData(FALLBACK)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [refresh])

  return { ...data, loading }
}
