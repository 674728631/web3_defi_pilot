export interface ProtocolInfo {
  chain: string
  protocol: string
  asset: string
  action: string
  apy: number
  risk: 'Low' | 'Medium' | 'High'
  tvl: number
  audited: boolean
}

export const PROTOCOL_DATA: ProtocolInfo[] = [
  { chain: 'ethereum', protocol: 'Lido', asset: 'ETH', action: 'stETH Staking', apy: 3.95, risk: 'Low', tvl: 14200000000, audited: true },
  { chain: 'ethereum', protocol: 'Aave V3', asset: 'ETH', action: 'ETH Lending', apy: 3.12, risk: 'Low', tvl: 8500000000, audited: true },
  { chain: 'ethereum', protocol: 'Compound V3', asset: 'USDC', action: 'USDC Supply', apy: 4.25, risk: 'Low', tvl: 3200000000, audited: true },
  { chain: 'ethereum', protocol: 'Pendle', asset: 'stETH', action: 'PT-stETH', apy: 5.80, risk: 'Medium', tvl: 1800000000, audited: true },
  { chain: 'arbitrum', protocol: 'Aave V3', asset: 'ETH', action: 'ETH Lending', apy: 4.82, risk: 'Low', tvl: 2100000000, audited: true },
  { chain: 'arbitrum', protocol: 'GMX', asset: 'ETH', action: 'GLP Vault', apy: 8.50, risk: 'Medium', tvl: 520000000, audited: true },
  { chain: 'arbitrum', protocol: 'Radiant', asset: 'ETH', action: 'ETH Lending', apy: 5.40, risk: 'Medium', tvl: 180000000, audited: true },
  { chain: 'arbitrum', protocol: 'Pendle', asset: 'ETH', action: 'PT-eETH', apy: 6.20, risk: 'Medium', tvl: 450000000, audited: true },
  { chain: 'base', protocol: 'Compound V3', asset: 'ETH', action: 'ETH Supply', apy: 5.12, risk: 'Low', tvl: 850000000, audited: true },
  { chain: 'base', protocol: 'Aerodrome', asset: 'ETH/USDC', action: 'LP Farming', apy: 12.50, risk: 'High', tvl: 320000000, audited: true },
  { chain: 'base', protocol: 'Moonwell', asset: 'ETH', action: 'ETH Lending', apy: 4.60, risk: 'Low', tvl: 210000000, audited: true },
  { chain: 'base', protocol: 'Extra Finance', asset: 'ETH', action: 'Leveraged Yield', apy: 9.80, risk: 'High', tvl: 85000000, audited: false },
]

export function getProtocolsByRisk(maxRisk: 'Low' | 'Medium' | 'High'): ProtocolInfo[] {
  const riskOrder = { Low: 0, Medium: 1, High: 2 }
  return PROTOCOL_DATA.filter((p) => riskOrder[p.risk] <= riskOrder[maxRisk])
}

export function getProtocolsByChain(chain: string): ProtocolInfo[] {
  return PROTOCOL_DATA.filter((p) => p.chain === chain)
}

export function buildProtocolContext(): string {
  return PROTOCOL_DATA.map(
    (p) =>
      `${p.chain}/${p.protocol}: ${p.action}, APY=${p.apy}%, Risk=${p.risk}, TVL=$${(p.tvl / 1e9).toFixed(1)}B, Audited=${p.audited}`
  ).join('\n')
}
