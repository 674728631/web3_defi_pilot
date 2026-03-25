import type { Strategy } from '@/stores/chatStore'
import { useChatStore } from '@/stores/chatStore'
import ChainIcon from '@/components/common/ChainIcon'
import { formatPercent } from '@/utils/format'
import { useT } from '@/utils/i18n'

interface Props {
  strategy: Strategy
  onExecute?: () => void
}

export default function StrategyCard({ strategy, onExecute }: Props) {
  const t = useT()
  const setDraftInput = useChatStore((s) => s.setDraftInput)

  const handleModify = () => {
    const summary = strategy.items
      .map((item) => `${item.protocol} ${item.amount}`)
      .join(', ')
    setDraftInput(`请调整上面的策略（当前: ${summary}），我希望`)
  }

  return (
    <div className="mt-3 glass-card rounded-[14px] relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-[14px]">
        <div className="scanner-line" style={{ animationDuration: '2s' }} />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <span className="font-display text-[11px] tracking-[2px] gradient-text font-semibold">{t('strategy.title')}</span>
        <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold ${
          strategy.riskLevel === 'Low'
            ? 'bg-cyber-green/15 text-cyber-green'
            : strategy.riskLevel === 'Medium'
            ? 'bg-neon-amber/15 text-neon-amber'
            : 'bg-neon-red/15 text-neon-red'
        }`}>
          {t(`risk.${strategy.riskLevel.toLowerCase() as 'low' | 'medium' | 'high'}`)} {t('strategy.risk')}
        </span>
      </div>

      {/* Rows */}
      {strategy.items.map((item, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5 last:border-b-0 hover:bg-cyber-cyan/[0.03] transition-colors"
        >
          <ChainIcon chain={item.chain} />
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-semibold truncate">{item.protocol} · {item.action}</div>
            <div className="text-[11px] text-text-secondary mt-0.5 truncate">{item.detail}</div>
          </div>
          <div className="font-mono text-sm font-bold text-cyber-green shrink-0" style={{ textShadow: '0 0 10px rgba(16,185,129,0.3)' }}>
            {formatPercent(item.apy)}
          </div>
        </div>
      ))}

      {/* Actions */}
      <div className="flex gap-2 p-3">
        <button
          onClick={onExecute}
          className="flex-1 py-2.5 rounded-[10px] font-display text-xs font-semibold tracking-[1.5px] text-white transition-all glow-button hover:-translate-y-px cursor-pointer"
        >
          {t('strategy.execute')}
        </button>
        <button
          onClick={handleModify}
          className="neon-border px-4 py-2.5 rounded-[10px] border border-cyber-cyan/15 text-xs text-text-secondary hover:text-cyber-purple transition-all cursor-pointer"
        >
          {t('strategy.modify')}
        </button>
      </div>
    </div>
  )
}
