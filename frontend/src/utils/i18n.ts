import { useLangStore, type Lang } from '@/stores/langStore'

const translations = {
  // TopNav
  'nav.dashboard': { en: 'Dashboard', zh: '仪表盘' },
  'nav.strategies': { en: 'Strategies', zh: '策略' },
  'nav.history': { en: 'History', zh: '历史' },
  'nav.analytics': { en: 'Analytics', zh: '分析' },
  'nav.subtitle': { en: 'AI CROSS-CHAIN PROTOCOL', zh: 'AI 跨链协议' },
  'nav.multiChain': { en: 'Multi-Chain', zh: '多链' },
  'nav.connectWallet': { en: 'Connect Wallet', zh: '连接钱包' },
  'nav.themeToLight': { en: 'Switch to light mode', zh: '切换到浅色模式' },
  'nav.themeToDark': { en: 'Switch to dark mode', zh: '切换到深色模式' },

  // ChatPanel
  'chat.title': { en: 'PILOT AI', zh: 'PILOT AI' },
  'chat.status': { en: 'Online — Monitoring 6 chains', zh: '在线 — 监控 6 条链' },
  'chat.statusLive': { en: 'Online — Monitoring {total} chains ({healthy} healthy)', zh: '在线 — 监控 {total} 条链 ({healthy} 健康)' },
  'chat.statusOffline': { en: 'Connecting...', zh: '连接中...' },
  'chat.placeholder': { en: 'Tell Pilot AI your DeFi intent...', zh: '告诉 Pilot AI 你的 DeFi 意图...' },
  'chat.walletRequired': { en: 'Please connect your wallet first to use AI features', zh: '请先连接钱包后再使用 AI 功能' },
  'chat.placeholderNoWallet': { en: 'Connect wallet to start...', zh: '连接钱包后开始...' },

  // StatsRow
  'stats.totalAssets': { en: 'TOTAL ASSETS', zh: '总资产' },
  'stats.activeChains': { en: 'ACTIVE CHAINS', zh: '活跃链' },
  'stats.avgApy': { en: 'AVG. APY', zh: '平均年化' },
  'stats.monthlyYield': { en: 'MONTHLY YIELD', zh: '月度收益' },

  // Dashboard
  'dashboard.positions': { en: 'ACTIVE POSITIONS', zh: '活跃持仓' },
  'dashboard.positionsSub': { en: 'Real-time portfolio tracking', zh: '实时投资组合追踪' },

  // PositionCard
  'position.pool': { en: 'Pool', zh: '池子' },
  'position.amount': { en: 'Amount', zh: '数量' },
  'position.earned': { en: 'Earned', zh: '已赚取' },
  'position.risk': { en: 'Risk', zh: '风险' },

  // CrossChainFlow
  'flow.title': { en: 'CROSS-CHAIN FLOW', zh: '跨链流程' },
  'flow.subtitle': { en: 'Live transaction routing', zh: '实时交易路由' },
  'flow.healthy': { en: 'All bridges healthy', zh: '所有桥接正常' },

  // InsightsRow
  'insights.riskMonitor': { en: 'RISK MONITOR', zh: '风险监控' },
  'insights.opportunities': { en: 'AI OPPORTUNITIES', zh: 'AI 机会发现' },
  'insights.risk1': { en: 'Aave V3 Health Factor: 2.41 — Safe', zh: 'Aave V3 健康度: 2.41 — 安全' },
  'insights.risk2': { en: 'stETH/ETH Depeg Risk: 0.02% — Very Low', zh: 'stETH/ETH 脱锚风险: 0.02% — 极低' },
  'insights.risk3': { en: 'ETH Price 24h Change: -3.2% — Monitoring', zh: 'ETH 价格 24h 波动: -3.2% — 关注中' },
  'insights.risk4': { en: 'Smart Contract Audit: All Audited ✓', zh: '智能合约审计状态: 全部已审计 ✓' },
  'insights.opp1': { en: 'Scroll Aave rate surged to ', zh: 'Scroll 链 Aave 利率飙升至 ' },
  'insights.opp2': { en: 'Arbitrum ARB airdrop snapshot detected, hold position', zh: '检测到 Arbitrum ARB 空投快照，建议保持仓位' },
  'insights.opp3': { en: 'Compound V3 USDC Pool APY rose 0.4%', zh: 'Compound V3 USDC 池 APY 上升 0.4%' },
  'insights.opp4': { en: 'Pendle PT-stETH arbitrage found: ', zh: '发现 Pendle PT-stETH 套利机会: ' },

  // StrategyCard
  'strategy.title': { en: 'RECOMMENDED STRATEGY', zh: '推荐策略' },
  'strategy.risk': { en: 'Risk', zh: '风险' },
  'strategy.execute': { en: '⚡ ONE-CLICK EXECUTE', zh: '⚡ 一键执行' },
  'strategy.modify': { en: 'Modify', zh: '修改' },

  // Risk levels
  'risk.low': { en: 'Low', zh: '低' },
  'risk.medium': { en: 'Medium', zh: '中' },
  'risk.high': { en: 'High', zh: '高' },

  // Footer
  'footer.supportedChains': { en: 'Supported Chains:', zh: '支持的链:' },

  // Seed Chat
  'seed.user1': {
    en: 'I have 5 ETH on Ethereum mainnet. Find the best yield with low risk.',
    zh: '我有 5 ETH 在以太坊主网上，帮我找全网最高收益的方案，风险要低一些',
  },
  'seed.ai1': {
    en: `Scanned <span class="text-cyan">6 chains</span> and <span class="text-cyan">47 protocols</span>, found the optimal strategy:<br/><br/>Combined APY <span class="text-neon-green font-bold">5.17%</span> · Risk <span class="text-neon-green">Low</span> · Est. Annual Return <span class="text-cyan">$1,892</span>`,
    zh: `已扫描 <span class="text-cyan">6 条链</span> 上 <span class="text-cyan">47 个协议</span>，为您找到以下最优策略：<br/><br/>综合年化 <span class="text-neon-green font-bold">5.17%</span> · 风险评分 <span class="text-neon-green">Low</span> · 预估年收益 <span class="text-cyan">$1,892</span>`,
  },
  'seed.user2': {
    en: 'Nice, but is the Solana part risky? Can you swap it for Base chain?',
    zh: '不错，但 Solana 那部分风险会不会高？能换成 Base 链吗',
  },
  'seed.ai2': {
    en: `Done! Compound V3 on Base has ETH supply rate at <span class="text-neon-green">5.12%</span>, lower risk and no cross-chain swap needed.<br/><br/>Strategy updated. Click execute to complete all operations in one signature 🚀`,
    zh: `好的，已为您调整。Base 链上 Compound V3 当前 ETH 供给利率 <span class="text-neon-green">5.12%</span>，风险更低且免跨链兑换。<br/><br/>已更新策略，点击执行即可一笔签名完成全部操作 🚀`,
  },
  'seed.detail1': {
    en: '2.5 ETH → Arbitrum · Est. yield $847/yr',
    zh: '2.5 ETH → Arbitrum · 预计收益 $847/年',
  },
  'seed.detail2': {
    en: '1.5 ETH → Base · Est. yield $620/yr',
    zh: '1.5 ETH → Base · 预计收益 $620/年',
  },
  'seed.detail3': {
    en: '1.0 ETH on Ethereum · Liquid staking',
    zh: '1.0 ETH 留在 Ethereum · 流动性质押',
  },
} as const

type TranslationKey = keyof typeof translations

export function useT() {
  const lang = useLangStore((s) => s.lang)
  return (key: TranslationKey) => translations[key][lang]
}

export function getT(lang: Lang) {
  return (key: TranslationKey) => translations[key][lang]
}
