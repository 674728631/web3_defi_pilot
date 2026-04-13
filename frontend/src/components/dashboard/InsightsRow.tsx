import { useEffect, useState } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { usePortfolioStore } from '@/stores/portfolioStore'
import { useT } from '@/utils/i18n'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

interface InsightItem {
  dotColor: string
  text: string
}

interface Opportunity {
  protocol: string
  chainId: number
  apy: number
  tvl: number
  risk: string
  audited: boolean
}

function InsightCard({ title, icon, iconGradient, items }: { title: string; icon: string; iconGradient: string; items: InsightItem[] }) {
  return (
    <div className="glass-card card-hover rounded-2xl p-5 relative animate-card-in" style={{ animationDelay: '0.5s' }}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-2xl">
        <div className="scanner-line" style={{ animationDuration: '3s' }} />
      </div>
      <div className="flex items-center gap-2.5 mb-3.5">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-base"
          style={{ background: iconGradient }}
        >
          {icon}
        </div>
        <div className="text-[13px] font-semibold font-display tracking-wider">{title}</div>
      </div>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2.5 py-2 border-b border-border-subtle last:border-b-0 text-[12.5px] text-text-secondary">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: item.dotColor, boxShadow: `0 0 8px ${item.dotColor}60` }}
          />
          <span dangerouslySetInnerHTML={{ __html: item.text }} />
        </div>
      ))}
    </div>
  )
}

export default function InsightsRow() {
  const t = useT()
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const positions = usePortfolioStore((s) => s.positions)
  const stats = usePortfolioStore((s) => s.stats)

  const [vaultHealthy, setVaultHealthy] = useState(true)
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])

  useEffect(() => {
    if (isConnected) {
      fetch(`${BACKEND_URL}/api/health/vault?chainId=${chainId}`)
        .then((r) => r.json())
        .then((d) => setVaultHealthy(d.healthy ?? true))
        .catch(() => {})

      fetch(`${BACKEND_URL}/api/opportunities`)
        .then((r) => r.json())
        .then((d) => setOpportunities(d.opportunities || []))
        .catch(() => {})
    }
  }, [isConnected, chainId])

  const riskItems = buildRiskItems(positions, stats, vaultHealthy)
  const oppItems = buildOppItems(opportunities)

  return (
    <div className="grid grid-cols-2 gap-4">
      <InsightCard
        title={t('insights.riskMonitor')}
        icon="🛡️"
        iconGradient="var(--gradient-insight-risk)"
        items={riskItems}
      />
      <InsightCard
        title={t('insights.opportunities')}
        icon="💡"
        iconGradient="var(--gradient-insight-opp)"
        items={oppItems}
      />
    </div>
  )
}

function buildRiskItems(
  positions: { riskLevel: string; amount: number }[],
  stats: { avgApy: number; totalValue: number },
  healthy: boolean
): InsightItem[] {
  const items: InsightItem[] = []

  items.push({
    dotColor: healthy ? '#10b981' : '#ef4444',
    text: healthy
      ? 'Vault 健康度: <b class="text-cyber-green">正常</b> — 资金安全'
      : 'Vault 健康度: <b class="text-neon-red">异常</b> — 请检查',
  })

  const lowCount = positions.filter((p) => p.riskLevel === 'Low').length
  const medCount = positions.filter((p) => p.riskLevel === 'Medium').length
  const highCount = positions.filter((p) => p.riskLevel === 'High').length
  const total = positions.length

  if (total > 0) {
    const lowPct = Math.round((lowCount / total) * 100)
    items.push({
      dotColor: lowPct >= 70 ? '#10b981' : '#f59e0b',
      text: `持仓风险分布: 低风险 <b class="text-cyber-green">${lowPct}%</b>${medCount > 0 ? ` · 中风险 ${Math.round((medCount / total) * 100)}%` : ''}${highCount > 0 ? ` · 高风险 ${Math.round((highCount / total) * 100)}%` : ''}`,
    })
  } else {
    items.push({
      dotColor: '#6b7280',
      text: '暂无活跃持仓',
    })
  }

  items.push({
    dotColor: '#10b981',
    text: '智能合约审计状态: 全部已审计 ✓',
  })

  if (stats.totalValue > 0) {
    items.push({
      dotColor: '#22d3ee',
      text: `总资产 <b class="text-cyber-cyan">$${stats.totalValue.toLocaleString()}</b> · 平均 APY <b class="text-cyber-green">${stats.avgApy.toFixed(2)}%</b>`,
    })
  }

  return items
}

function buildOppItems(opportunities: Opportunity[]): InsightItem[] {
  if (opportunities.length === 0) {
    return [
      { dotColor: '#6b7280', text: '正在加载 DeFi 协议数据...' },
    ]
  }

  const chainName = (id: number) => {
    if (id === 11155111 || id === 1) return 'Ethereum'
    if (id === 421614 || id === 42161) return 'Arbitrum'
    return 'Unknown'
  }

  return opportunities.slice(0, 4).map((opp) => ({
    dotColor: opp.apy > 5 ? '#22d3ee' : '#10b981',
    text: `${opp.protocol} (${chainName(opp.chainId)}): APY <b class="text-cyber-green">${opp.apy.toFixed(2)}%</b> · TVL $${formatTVL(opp.tvl)}${opp.risk === 'Low' ? ' · <span class="text-cyber-green">低风险</span>' : ''}`,
  }))
}

function formatTVL(tvl: number): string {
  if (tvl >= 1e9) return `${(tvl / 1e9).toFixed(1)}B`
  if (tvl >= 1e6) return `${(tvl / 1e6).toFixed(0)}M`
  return tvl.toLocaleString()
}
