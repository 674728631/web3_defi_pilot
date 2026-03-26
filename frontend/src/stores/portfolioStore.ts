import { create } from 'zustand'

export interface Position {
  id: string
  chain: string
  protocol: string
  asset: string
  amount: number
  usdValue: number
  apy: number
  earned: number
  riskLevel: 'Low' | 'Medium' | 'High'
}

export interface PortfolioStats {
  totalValue: number
  totalValueChange: number
  avgApy: number
  apyChange: number
  earned30d: number
  earnedChange: number
  activeChains: string[]
}

interface PortfolioState {
  positions: Position[]
  stats: PortfolioStats
  isRefreshing: boolean
  setPositions: (p: Position[]) => void
  setStats: (s: PortfolioStats) => void
  refreshPortfolio: (address: string, chainId: number) => Promise<void>
}

const EMPTY_STATS: PortfolioStats = {
  totalValue: 0,
  totalValueChange: 0,
  avgApy: 0,
  apyChange: 0,
  earned30d: 0,
  earnedChange: 0,
  activeChains: [],
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

export const usePortfolioStore = create<PortfolioState>((set, get) => ({
  positions: [],
  stats: EMPTY_STATS,
  isRefreshing: false,
  setPositions: (positions) => set({ positions }),
  setStats: (stats) => set({ stats }),
  refreshPortfolio: async (address: string, chainId: number) => {
    if (get().isRefreshing) return
    set({ isRefreshing: true })
    try {
      const res = await fetch(`${BACKEND_URL}/api/portfolio?address=${address}&chainId=${chainId}`)
      if (!res.ok) return

      const data = await res.json()
      const vaultETH = parseFloat(data.vaultEth || '0')
      const walletETH = parseFloat(data.walletEth || '0')
      const totalUsd = data.totalUsd || (walletETH + vaultETH) * 3650

      const positions: Position[] = []

      if (vaultETH > 0) {
        positions.push({
          id: 'vault-eth',
          chain: chainId === 421614 ? 'arbitrumSepolia' : 'sepolia',
          protocol: 'DeFi Pilot Vault',
          asset: 'ETH',
          amount: vaultETH,
          usdValue: vaultETH * 3650,
          apy: 0,
          earned: 0,
          riskLevel: 'Low',
        })
      }

      if (data.positions?.length > 0) {
        for (const p of data.positions) {
          if (!p.active) continue
          const amount = parseFloat(p.amount || '0')
          positions.push({
            id: `pos-${p.id}`,
            chain: chainId === 421614 ? 'arbitrumSepolia' : 'sepolia',
            protocol: p.protocolName || 'Unknown',
            asset: p.asset || 'ETH',
            amount,
            usdValue: amount * 3650,
            apy: p.apy || 0,
            earned: Math.round(amount * 3650 * (p.apy || 0) / 100 / 12),
            riskLevel: (p.riskLevel || 'Medium') as 'Low' | 'Medium' | 'High',
          })
        }
      }

      set({
        positions,
        stats: {
          totalValue: totalUsd,
          totalValueChange: 0,
          avgApy: data.avgApy || 0,
          apyChange: 0,
          earned30d: Math.round(data.earned30d || 0),
          earnedChange: 0,
          activeChains: data.activeChains || [],
        },
      })
    } catch {
      // keep existing data on error
    } finally {
      set({ isRefreshing: false })
    }
  },
}))
