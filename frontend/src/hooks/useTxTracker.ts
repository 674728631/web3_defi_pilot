import { useState, useCallback, useRef, useEffect } from 'react'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

export type TxStatus = 'idle' | 'confirming' | 'pending' | 'success' | 'failed'

interface TxEvent {
  name: string
  args: Record<string, string>
}

interface TxState {
  hash: string
  status: TxStatus
  blockNumber?: number
  gasUsed?: number
  events?: TxEvent[]
}

export function useTxTracker() {
  const [state, setState] = useState<TxState>({ hash: '', status: 'idle' })
  const pollingRef = useRef<ReturnType<typeof setInterval>>()

  const track = useCallback((hash: string, chainId: number) => {
    setState({ hash, status: 'confirming' })

    if (pollingRef.current) clearInterval(pollingRef.current)

    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/tx/${hash}?chainId=${chainId}`)
        const data = await res.json()

        if (data.status === 'success') {
          setState({
            hash,
            status: 'success',
            blockNumber: data.blockNumber,
            gasUsed: data.gasUsed,
          })
          clearInterval(pollingRef.current)
        } else if (data.status === 'failed') {
          setState({ hash, status: 'failed' })
          clearInterval(pollingRef.current)
        } else {
          setState((prev) => ({ ...prev, status: 'pending' }))
        }
      } catch {
        // Keep polling on network errors
      }
    }, 3000)
  }, [])

  const reset = useCallback(() => {
    if (pollingRef.current) clearInterval(pollingRef.current)
    setState({ hash: '', status: 'idle' })
  }, [])

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [])

  return { ...state, track, reset }
}
