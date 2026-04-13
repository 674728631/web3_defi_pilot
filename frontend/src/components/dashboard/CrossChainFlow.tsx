import { useMemo } from 'react'
import ChainIcon from '@/components/common/ChainIcon'
import { useChatStore } from '@/stores/chatStore'
import { usePortfolioStore } from '@/stores/portfolioStore'
import { useT } from '@/utils/i18n'

interface FlowNode {
  type: 'chain' | 'arrow'
  chain?: string
  label: string
  sub?: string
}

const CHAIN_DISPLAY: Record<string, string> = {
  sepolia: 'Sepolia',
  arbitrumSepolia: 'Arb Sepolia',
  ethereum: 'Ethereum',
  arbitrum: 'Arbitrum',
  base: 'Base',
}

export default function CrossChainFlow() {
  const t = useT()
  const currentStrategy = useChatStore((s) => s.currentStrategy)
  const positions = usePortfolioStore((s) => s.positions)

  const flowNodes = useMemo<FlowNode[]>(() => {
    if (currentStrategy && currentStrategy.items.length > 0) {
      return buildStrategyFlow(currentStrategy.items)
    }

    const activePositions = positions.filter((p) => p.amount > 0)
    if (activePositions.length > 0) {
      return buildPositionFlow(activePositions)
    }

    return buildDefaultFlow()
  }, [currentStrategy, positions])

  return (
    <div className="glass-card card-hover rounded-2xl p-6 animate-card-in relative" style={{ animationDelay: '0.4s' }}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-2xl">
        <div className="scanner-line" />
      </div>

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--gradient-flow-node)' }}
          >
            <span className="text-xl">🔗</span>
          </div>
          <div>
            <div className="font-display text-sm font-semibold tracking-[2px]">{t('flow.title')}</div>
            <div className="text-[11px] text-text-dim tracking-wider">
              {currentStrategy ? '策略执行路由' : t('flow.subtitle')}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-cyber-green">
          <span className="w-2 h-2 rounded-full bg-cyber-green pulse-live" style={{ color: '#10b981' }} />
          {t('flow.healthy')}
        </div>
      </div>

      <div className="flex items-center justify-center py-5">
        {flowNodes.map((node, i) => {
          if (node.type === 'arrow') {
            return (
              <div key={i} className="flex flex-col items-center w-[120px] gap-1 z-[1]">
                <div className="text-[10px] text-cyan-dim font-medium whitespace-nowrap">{node.label}</div>
                <div className="w-full h-0.5 relative rounded-sm overflow-visible" style={{ background: 'var(--gradient-flow-line)' }}>
                  <span
                    className="absolute -top-[3px] w-5 h-2 rounded bg-cyber-cyan shadow-[0_0_10px_rgba(34,211,238,0.3)]"
                    style={{ animation: `flowParticle 2s ease-in-out ${i * 0.25}s infinite` }}
                  />
                </div>
              </div>
            )
          }
          return (
            <div key={i} className="flex flex-col items-center gap-2 z-[2] group">
              <div className="transition-transform group-hover:scale-110 group-hover:shadow-[0_0_25px_rgba(34,211,238,0.2)] rounded-full">
                <ChainIcon chain={node.chain!} size={56} />
              </div>
              <div className="text-xs font-semibold tracking-wide">{node.label}</div>
              <div className="font-mono text-[10px] text-text-dim">{node.sub}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function buildStrategyFlow(items: { chain: string; protocol: string; amount: string }[]): FlowNode[] {
  const nodes: FlowNode[] = [
    { type: 'chain', chain: 'ethereum', label: 'Wallet', sub: 'Source' },
  ]

  const chainGroups = new Map<string, { protocols: string[]; totalAmount: string }>()
  for (const item of items) {
    const chain = item.chain
    const existing = chainGroups.get(chain)
    if (existing) {
      existing.protocols.push(item.protocol)
    } else {
      chainGroups.set(chain, { protocols: [item.protocol], totalAmount: item.amount })
    }
  }

  for (const [chain, info] of chainGroups) {
    nodes.push({
      type: 'arrow',
      label: `${info.totalAmount}`,
    })
    nodes.push({
      type: 'chain',
      chain,
      label: CHAIN_DISPLAY[chain] || chain,
      sub: info.protocols.join(' + '),
    })
  }

  return nodes
}

function buildPositionFlow(positions: { chain: string; protocol: string; amount: number; asset: string }[]): FlowNode[] {
  const nodes: FlowNode[] = []

  const chainGroups = new Map<string, { protocols: string[]; totalAmount: number }>()
  for (const pos of positions) {
    const existing = chainGroups.get(pos.chain)
    if (existing) {
      existing.protocols.push(pos.protocol)
      existing.totalAmount += pos.amount
    } else {
      chainGroups.set(pos.chain, { protocols: [pos.protocol], totalAmount: pos.amount })
    }
  }

  let first = true
  for (const [chain, info] of chainGroups) {
    if (!first) {
      nodes.push({ type: 'arrow', label: 'Cross-chain' })
    }
    nodes.push({
      type: 'chain',
      chain,
      label: CHAIN_DISPLAY[chain] || chain,
      sub: `${info.totalAmount.toFixed(2)} ETH · ${info.protocols.join(', ')}`,
    })
    first = false
  }

  return nodes
}

function buildDefaultFlow(): FlowNode[] {
  return [
    { type: 'chain', chain: 'ethereum', label: 'Ethereum', sub: 'Source' },
    { type: 'arrow', label: 'Deposit' },
    { type: 'chain', chain: 'sepolia', label: 'DeFi Pilot', sub: 'Vault' },
    { type: 'arrow', label: 'Allocate' },
    { type: 'chain', chain: 'arbitrum', label: 'Protocols', sub: 'Aave / Compound' },
  ]
}
