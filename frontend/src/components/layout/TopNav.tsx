import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { useLangStore } from '@/stores/langStore'
import { useThemeStore } from '@/stores/themeStore'
import { useChainHealth } from '@/hooks/useChainHealth'
import { useT } from '@/utils/i18n'

const CHAIN_COLORS: Record<string, { bg: string; color: string }> = {
  Ethereum:          { bg: 'rgba(59,130,246,0.2)',  color: '#3b82f6' },
  Sepolia:           { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa' },
  Arbitrum:          { bg: 'rgba(34,211,238,0.2)',  color: '#22d3ee' },
  'Arbitrum Sepolia': { bg: 'rgba(34,211,238,0.15)', color: '#67e8f9' },
  Optimism:          { bg: 'rgba(239,68,68,0.2)',   color: '#ef4444' },
  Base:              { bg: 'rgba(16,185,129,0.2)',  color: '#10b981' },
  Polygon:           { bg: 'rgba(168,85,247,0.2)',  color: '#a855f7' },
  Avalanche:         { bg: 'rgba(234,88,12,0.2)',   color: '#ea580c' },
  'BNB Chain':       { bg: 'rgba(234,179,8,0.2)',   color: '#eab308' },
}

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
        style={{ background: 'var(--gradient-wallet-btn)' }}
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
  const { theme, toggleTheme } = useThemeStore()
  const { chains: liveChains, healthy, total } = useChainHealth()
  const navItems = [
    t('nav.dashboard'),
    t('nav.strategies'),
    t('nav.history'),
    t('nav.analytics'),
  ]

  return (
    <nav className="relative z-10 flex items-center justify-between px-6 h-16 backdrop-blur-xl border-b border-border-subtle bg-bg-primary/80">
      {/* Logo */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center animate-pulse-glow"
            style={{ background: 'var(--gradient-logo)' }}
          >
            <svg
              className="w-7 h-7"
              fill="none"
              stroke="var(--logo-icon-on-brand)"
              viewBox="0 0 24 24"
            >
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
                : 'text-text-secondary hover:text-text-primary hover:bg-cyber-cyan/5'
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
          <span className="text-xs font-semibold text-text-secondary font-mono">{lang === 'en' ? 'EN' : '中'}</span>
        </button>

        {/* Light / Dark */}
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === 'dark' ? t('nav.themeToLight') : t('nav.themeToDark')}
          aria-label={theme === 'dark' ? t('nav.themeToLight') : t('nav.themeToDark')}
          className="glass-card rounded-xl px-3 py-2 flex items-center justify-center transition-all hover:border-cyber-cyan/30 cursor-pointer min-w-[42px]"
        >
          <span className="text-lg leading-none" aria-hidden>
            {theme === 'dark' ? '☀️' : '🌙'}
          </span>
        </button>

        {/* Network Status */}
        <div className="glass-card rounded-xl px-4 py-2 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${total > 0 && healthy === total ? 'bg-cyber-green pulse-live' : total > 0 ? 'bg-neon-amber pulse-live' : 'bg-text-dim'}`}
              style={total > 0 ? { color: healthy === total ? '#10b981' : '#f59e0b' } : undefined}
            />
            <span className="text-sm text-text-secondary font-medium">
              {total > 0 ? `${healthy}/${total}` : t('nav.multiChain')}
            </span>
          </div>
          <div className="w-px h-4 bg-border-subtle" />
          <div className="flex gap-1">
            {liveChains.length > 0
              ? liveChains.map((c) => {
                  const palette = CHAIN_COLORS[c.name] || { bg: 'rgba(148,163,184,0.2)', color: '#94a3b8' }
                  return (
                    <div
                      key={c.chainId}
                      className="w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ background: palette.bg }}
                      title={`${c.name} — ${c.status === 'ok' ? `Block ${c.block}` : 'offline'}`}
                    >
                      <span className="text-[8px] font-bold" style={{ color: palette.color }}>
                        {c.name[0]}
                      </span>
                    </div>
                  )
                })
              : ['E', 'A', 'O', 'B'].map((l) => (
                  <div key={l} className="w-5 h-5 rounded-full bg-text-dim/20 flex items-center justify-center">
                    <span className="text-[8px] font-bold text-text-dim">{l}</span>
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
