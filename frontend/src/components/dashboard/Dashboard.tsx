import { useEffect, useRef } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { usePortfolioStore } from '@/stores/portfolioStore'
import { useT } from '@/utils/i18n'
import StatsRow from './StatsRow'
import PositionCard from './PositionCard'
import CrossChainFlow from './CrossChainFlow'
import InsightsRow from './InsightsRow'

export default function Dashboard() {
  const positions = usePortfolioStore((s) => s.positions)
  const refreshPortfolio = usePortfolioStore((s) => s.refreshPortfolio)
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const t = useT()
  const intervalRef = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => {
    if (isConnected && address) {
      refreshPortfolio(address, chainId)
      intervalRef.current = setInterval(() => refreshPortfolio(address, chainId), 30000)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isConnected, address, chainId, refreshPortfolio])

  return (
    <div className="overflow-y-auto h-[calc(100vh-64px)] px-7 py-6 flex flex-col gap-5">
      <StatsRow />

      {/* Section Header */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'var(--gradient-section-icon)' }}
        >
          <span className="text-xl">📊</span>
        </div>
        <div>
          <div className="font-display text-sm font-semibold tracking-[2px]">{t('dashboard.positions')}</div>
          <div className="text-[11px] text-text-dim tracking-wider">{t('dashboard.positionsSub')}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {positions.map((pos, i) => (
          <PositionCard key={pos.id} position={pos} index={i} />
        ))}
      </div>

      <CrossChainFlow />
      <InsightsRow />

      {/* Footer */}
      <footer className="mt-auto pt-4 border-t border-border-subtle">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <p className="text-sm text-text-dim font-display tracking-wider">© 2026 DEFI PILOT</p>
            <div className="flex gap-4 text-xs text-text-secondary">
              <span className="hover:text-text-primary cursor-pointer transition-colors">Docs</span>
              <span className="hover:text-text-primary cursor-pointer transition-colors">GitHub</span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-secondary">{t('footer.supportedChains')}</span>
              <div className="flex gap-1.5">
                {[
                  { letter: 'E', name: 'Ethereum', bg: 'rgba(59,130,246,0.2)', color: '#3b82f6' },
                  { letter: 'A', name: 'Arbitrum', bg: 'rgba(34,211,238,0.2)', color: '#22d3ee' },
                  { letter: 'O', name: 'Optimism', bg: 'rgba(239,68,68,0.2)', color: '#ef4444' },
                  { letter: 'B', name: 'Base', bg: 'rgba(16,185,129,0.2)', color: '#10b981' },
                  { letter: 'P', name: 'Polygon', bg: 'rgba(168,85,247,0.2)', color: '#a855f7' },
                  { letter: 'S', name: 'Solana', bg: 'rgba(234,179,8,0.2)', color: '#eab308' },
                ].map((c) => (
                  <div
                    key={c.letter}
                    className="w-5 h-5 rounded-full flex items-center justify-center cursor-pointer"
                    style={{ background: c.bg }}
                    title={c.name}
                  >
                    <span className="text-[8px] font-bold" style={{ color: c.color }}>{c.letter}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-secondary">Protocols:</span>
              <div className="flex gap-1.5">
                {[
                  { letter: 'Av', name: 'Aave V3', bg: 'rgba(139,92,246,0.2)', color: '#8b5cf6' },
                  { letter: 'Co', name: 'Compound V3', bg: 'rgba(16,185,129,0.2)', color: '#10b981' },
                  { letter: 'Li', name: 'Lido', bg: 'rgba(59,130,246,0.2)', color: '#3b82f6' },
                  { letter: 'Gx', name: 'GMX', bg: 'rgba(34,211,238,0.2)', color: '#22d3ee' },
                ].map((c) => (
                  <div
                    key={c.letter}
                    className="h-5 px-1.5 rounded-full flex items-center justify-center cursor-pointer"
                    style={{ background: c.bg }}
                    title={c.name}
                  >
                    <span className="text-[8px] font-bold" style={{ color: c.color }}>{c.letter}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
