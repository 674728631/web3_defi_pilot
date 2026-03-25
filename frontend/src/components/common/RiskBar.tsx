interface Props {
  level: 'Low' | 'Medium' | 'High'
}

const RISK_CONFIG = {
  Low: { width: '25%', color: '#10b981', shadow: 'rgba(16,185,129,0.4)' },
  Medium: { width: '55%', color: '#f59e0b', shadow: 'rgba(245,158,11,0.4)' },
  High: { width: '85%', color: '#f43f5e', shadow: 'rgba(244,63,94,0.4)' },
}

export default function RiskBar({ level }: Props) {
  const cfg = RISK_CONFIG[level]
  return (
    <div className="w-full h-1 rounded-sm bg-white/5 mt-1.5 overflow-hidden">
      <div
        className="h-full rounded-sm transition-all duration-1000"
        style={{ width: cfg.width, background: cfg.color, boxShadow: `0 0 8px ${cfg.shadow}` }}
      />
    </div>
  )
}
