import { usePortfolioStore } from '@/stores/portfolioStore'
import { formatUsd, formatPercent } from '@/utils/format'
import { useT } from '@/utils/i18n'

export default function StatsRow() {
  const stats = usePortfolioStore((s) => s.stats)
  const t = useT()

  const cards = [
    {
      label: t('stats.totalAssets'),
      value: formatUsd(stats.totalValue),
      change: stats.totalValueChange,
      suffix: '%',
      icon: '💎',
      iconBg: 'from-cyber-cyan/20 to-cyber-blue/20',
    },
    {
      label: t('stats.activeChains'),
      value: String(stats.activeChains.length),
      custom: stats.activeChains,
      icon: '⛓️',
      iconBg: 'from-cyber-purple/20 to-cyber-pink/20',
    },
    {
      label: t('stats.avgApy'),
      value: formatPercent(stats.avgApy),
      change: stats.apyChange,
      suffix: '%',
      icon: '📈',
      iconBg: 'from-cyber-green/20 to-cyber-cyan/20',
      valueGreen: true,
    },
    {
      label: t('stats.monthlyYield'),
      value: `+${formatUsd(stats.earned30d)}`,
      change: stats.earnedChange,
      suffix: '%',
      icon: '💰',
      iconBg: 'from-cyber-pink/20 to-cyber-purple/20',
      holographic: true,
    },
  ]

  return (
    <div className="grid grid-cols-4 gap-4">
      {cards.map((card, i) => (
        <div
          key={i}
          className={`glass-card card-hover rounded-2xl p-5 animate-card-in ${card.holographic ? 'holographic' : ''}`}
          style={{ animationDelay: `${(i + 1) * 0.1}s` }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-gray-400 text-xs font-display tracking-wider mb-2">{card.label}</p>
              <p className={`text-3xl font-bold font-display ${card.valueGreen ? 'text-cyber-green' : ''}`}>
                {!card.valueGreen && (
                  <span className="gradient-text">{card.value}</span>
                )}
                {card.valueGreen && card.value}
              </p>
              {card.custom ? (
                <div className="flex gap-1.5 mt-2">
                  {card.custom.map((chain) => {
                    const color = chain === 'Ethereum' ? 'blue' : chain === 'Arbitrum' ? 'cyan' : chain === 'Base' ? 'green' : 'purple'
                    return (
                      <div
                        key={chain}
                        className={`w-6 h-6 rounded-full bg-${color}-500/30 flex items-center justify-center ring-1 ring-${color}-500/50 chain-glow`}
                        style={{ color: `var(--color-cyber-${color === 'blue' ? 'blue' : color === 'cyan' ? 'cyan' : color === 'green' ? 'green' : 'purple'})` }}
                      >
                        <span className="text-[10px] font-bold">{chain[0]}</span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className={`text-sm mt-1 flex items-center gap-1 ${
                  card.change! >= 0 ? 'text-cyber-green' : 'text-neon-red'
                }`}>
                  <span>{card.change! >= 0 ? '↑' : '↓'}</span>
                  {card.change! >= 0 ? '+' : ''}{card.change}{card.suffix}
                </p>
              )}
            </div>
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.iconBg} flex items-center justify-center`}>
              <span className="text-lg">{card.icon}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
