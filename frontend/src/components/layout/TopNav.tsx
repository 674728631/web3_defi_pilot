import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { useLangStore } from '@/stores/langStore'
import { useT } from '@/utils/i18n'

const CHAIN_DOTS = [
  { letter: 'E', bg: 'bg-blue-500/20', text: 'text-blue-400', ring: 'ring-blue-500/50' },
  { letter: 'A', bg: 'bg-cyan-500/20', text: 'text-cyan-400', ring: 'ring-cyan-500/50', active: true },
  { letter: 'O', bg: 'bg-red-500/20', text: 'text-red-400', ring: 'ring-red-500/50' },
  { letter: 'B', bg: 'bg-green-500/20', text: 'text-green-400', ring: 'ring-green-500/50' },
]

function WalletButton() {
  const t = useT()
  const { address, isConnected, chain } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()

  const shortAddr = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ''

  const handleClick = () => {
    if (isConnected) {
      disconnect()
      return
    }
    const injectedConnector = connectors.find((c) => c.type === 'injected')
    if (injectedConnector) {
      connect({ connector: injectedConnector })
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="neon-border glass-card rounded-xl px-5 py-2.5 flex items-center gap-3 transition-all cursor-pointer disabled:opacity-50"
    >
      <div
        className="w-6 h-6 rounded-lg flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)' }}
      >
        <span className="text-xs">🦊</span>
      </div>
      <span className="font-mono text-sm">
        {isPending ? '...' : isConnected ? shortAddr : t('nav.connectWallet')}
      </span>
      {isConnected && chain && (
        <span className="text-[10px] text-cyber-green font-mono">{chain.name}</span>
      )}
    </button>
  )
}

export default function TopNav() {
  const t = useT()
  const { lang, toggle } = useLangStore()
  const navItems = [
    t('nav.dashboard'),
    t('nav.strategies'),
    t('nav.history'),
    t('nav.analytics'),
  ]

  return (
    <nav className="relative z-10 flex items-center justify-between px-6 h-16 backdrop-blur-xl border-b border-white/5">
      {/* Logo */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center animate-pulse-glow"
            style={{ background: 'linear-gradient(135deg, #22d3ee, #a855f7, #ec4899)' }}
          >
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-cyber-green rounded-full network-pulse" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold tracking-wider gradient-text">
            DEFI PILOT
          </h1>
          <p className="text-[10px] text-text-dim font-display tracking-[3px] uppercase">
            {t('nav.subtitle')}
          </p>
        </div>
      </div>

      {/* Center Nav */}
      <div className="flex gap-2">
        {navItems.map((item, i) => (
          <button
            key={item}
            className={`px-5 py-2 rounded-lg text-[13px] font-medium tracking-wide transition-all relative ${
              i === 0
                ? 'text-cyber-cyan bg-cyber-cyan/[0.08]'
                : 'text-text-secondary hover:text-text-primary hover:bg-white/[0.04]'
            }`}
          >
            {item}
            {i === 0 && (
              <span className="absolute -bottom-px left-[20%] w-[60%] h-0.5 bg-cyber-cyan rounded-sm shadow-[0_0_8px_rgba(34,211,238,0.3)]" />
            )}
          </button>
        ))}
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {/* Language Toggle */}
        <button
          onClick={toggle}
          className="glass-card rounded-xl px-3 py-2 flex items-center gap-2 transition-all hover:border-cyber-cyan/30 cursor-pointer"
        >
          <span className="text-sm">🌐</span>
          <span className="text-xs font-semibold text-gray-300 font-mono">{lang === 'en' ? 'EN' : '中'}</span>
        </button>

        {/* Network Status */}
        <div className="glass-card rounded-xl px-4 py-2 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyber-green pulse-live" style={{ color: '#10b981' }} />
            <span className="text-sm text-gray-300 font-medium">{t('nav.multiChain')}</span>
          </div>
          <div className="w-px h-4 bg-white/10" />
          <div className="flex gap-1">
            {CHAIN_DOTS.map((c) => (
              <div
                key={c.letter}
                className={`w-5 h-5 rounded-full ${c.bg} flex items-center justify-center ${
                  c.active ? `ring-1 ${c.ring}` : ''
                }`}
              >
                <span className={`text-[8px] ${c.text} font-bold`}>{c.letter}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Wallet */}
        <WalletButton />
      </div>
    </nav>
  )
}
