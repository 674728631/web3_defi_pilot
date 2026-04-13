import type { Position } from '@/stores/portfolioStore'
import ChainIcon from '@/components/common/ChainIcon'
import RiskBar from '@/components/common/RiskBar'
import { formatUsd, formatPercent } from '@/utils/format'
import { useT } from '@/utils/i18n'
import { useWithdraw } from '@/hooks/useWithdraw'

interface Props {
  position: Position
  index: number
}

const PROTOCOL_ICONS: Record<string, { emoji: string; gradient: string }> = {
  'Aave V3': { emoji: '👻', gradient: 'from-purple-500 to-pink-500' },
  'Compound V3': { emoji: '🌊', gradient: 'from-cyan-500 to-green-500' },
  'GMX': { emoji: '🔥', gradient: 'from-orange-500 to-red-500' },
  'Lido': { emoji: '🏔️', gradient: 'from-blue-500 to-cyan-500' },
  'Uniswap': { emoji: '🦄', gradient: 'from-pink-500 to-purple-500' },
}

export default function PositionCard({ position, index }: Props) {
  const t = useT()
  const { withdrawFromVault, withdrawFromProtocol, status: withdrawStatus, isProcessing } = useWithdraw()
  const iconConfig = PROTOCOL_ICONS[position.protocol] ?? { emoji: '💎', gradient: 'from-cyber-cyan to-cyber-purple' }
  const isHighlight = index === 0
  const isVaultPosition = position.id === 'vault-eth'
  const isProtocolPosition = position.id.startsWith('pos-')
  const isWithdrawing = isProcessing || withdrawStatus === 'signing' || withdrawStatus === 'confirming'

  return (
    <div
      className={`glass-card card-hover rounded-2xl p-5 animate-card-in ${isHighlight ? 'holographic' : ''}`}
      style={{ animationDelay: `${(index + 1) * 0.1}s` }}
    >
      {/* Top */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${iconConfig.gradient} flex items-center justify-center`}>
            <span className="text-xl">{iconConfig.emoji}</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{position.protocol}</span>
              <span className="px-2 py-0.5 bg-cyber-cyan/10 text-cyber-cyan text-[10px] rounded-full font-mono">
                {position.chain.charAt(0).toUpperCase() + position.chain.slice(1)}
              </span>
            </div>
            <div className="text-[11px] text-text-dim mt-0.5">{position.asset} {t('position.pool')}</div>
          </div>
        </div>
        <ChainIcon chain={position.chain} size={24} />
      </div>

      {/* Amount */}
      <div className="font-mono text-2xl font-bold mb-1">{formatUsd(position.usdValue)}</div>
      <div className="text-cyber-green text-sm flex items-center gap-1 mb-4">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyber-green animate-pulse" />
        {formatPercent(position.apy)} APY
      </div>

      {/* Metrics */}
      <div className="flex justify-between pt-3.5 border-t border-border-subtle">
        <div>
          <div className="text-[10px] text-text-dim uppercase tracking-wider">{t('position.amount')}</div>
          <div className="font-mono text-sm font-semibold mt-0.5">
            {position.amount.toFixed(2)} {position.asset}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-text-dim uppercase tracking-wider">{t('position.earned')}</div>
          <div className="font-mono text-sm font-semibold text-cyber-cyan mt-0.5">{formatUsd(position.earned)}</div>
        </div>
        <div>
          <div className="text-[10px] text-text-dim uppercase tracking-wider">{t('position.risk')}</div>
          <div className="mt-0.5">
            <span className={`text-xs font-mono font-semibold ${
              position.riskLevel === 'Low' ? 'text-cyber-green' :
              position.riskLevel === 'Medium' ? 'text-neon-amber' : 'text-neon-red'
            }`}>{t(`risk.${position.riskLevel.toLowerCase() as 'low' | 'medium' | 'high'}`)}</span>
          </div>
          <RiskBar level={position.riskLevel} />
        </div>
      </div>

      {/* Withdraw button */}
      {isVaultPosition && position.amount > 0 && (
        <div className="mt-3 pt-3 border-t border-border-subtle">
          <button
            onClick={() => withdrawFromVault(position.amount.toString())}
            disabled={isWithdrawing}
            className="w-full py-2 rounded-[10px] text-xs font-display tracking-wider border border-neon-amber/20 text-neon-amber hover:bg-neon-amber/10 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isWithdrawing ? '赎回中...' : `赎回 ${position.amount.toFixed(4)} ETH`}
          </button>
        </div>
      )}

      {/* Protocol position redeem button */}
      {isProtocolPosition && position.amount > 0 && (
        <div className="mt-3 pt-3 border-t border-border-subtle">
          <button
            onClick={() => {
              const posId = parseInt(position.id.replace('pos-', ''), 10)
              withdrawFromProtocol(posId)
            }}
            disabled={isWithdrawing}
            className="w-full py-2 rounded-[10px] text-xs font-display tracking-wider border border-cyber-cyan/20 text-cyber-cyan hover:bg-cyber-cyan/10 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isWithdrawing ? '赎回中...' : `从 ${position.protocol} 赎回`}
          </button>
        </div>
      )}
    </div>
  )
}
