export interface ChainMeta {
  id: number
  name: string
  shortName: string
  letter: string
  color: string
  bgColor: string
  borderColor: string
  explorerUrl?: string
}

export const CHAIN_META: Record<string, ChainMeta> = {
  sepolia: {
    id: 11155111,
    name: 'Sepolia',
    shortName: 'SEP',
    letter: 'S',
    color: '#3b82f6',
    bgColor: 'rgba(59, 130, 246, 0.2)',
    borderColor: 'rgba(59, 130, 246, 0.4)',
    explorerUrl: 'https://sepolia.etherscan.io',
  },
  arbitrumSepolia: {
    id: 421614,
    name: 'Arbitrum Sepolia',
    shortName: 'ARB',
    letter: 'A',
    color: '#22d3ee',
    bgColor: 'rgba(34, 211, 238, 0.2)',
    borderColor: 'rgba(34, 211, 238, 0.4)',
    explorerUrl: 'https://sepolia.arbiscan.io',
  },
  ethereum: {
    id: 1,
    name: 'Ethereum',
    shortName: 'ETH',
    letter: 'E',
    color: '#3b82f6',
    bgColor: 'rgba(59, 130, 246, 0.2)',
    borderColor: 'rgba(59, 130, 246, 0.4)',
    explorerUrl: 'https://etherscan.io',
  },
  arbitrum: {
    id: 42161,
    name: 'Arbitrum',
    shortName: 'ARB',
    letter: 'A',
    color: '#22d3ee',
    bgColor: 'rgba(34, 211, 238, 0.2)',
    borderColor: 'rgba(34, 211, 238, 0.4)',
    explorerUrl: 'https://arbiscan.io',
  },
  base: {
    id: 8453,
    name: 'Base',
    shortName: 'BASE',
    letter: 'B',
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.2)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
    explorerUrl: 'https://basescan.org',
  },
}
