import type { Address } from 'viem'

interface ContractAddresses {
  vault: Address
  executor: Address
  adapter: Address
}

const DEFAULT_ADDRESSES: Record<number, ContractAddresses> = {
  11155111: {
    vault: '0x0000000000000000000000000000000000000000' as Address,
    executor: '0x0000000000000000000000000000000000000000' as Address,
    adapter: '0x0000000000000000000000000000000000000000' as Address,
  },
  421614: {
    vault: '0x0000000000000000000000000000000000000000' as Address,
    executor: '0x0000000000000000000000000000000000000000' as Address,
    adapter: '0x0000000000000000000000000000000000000000' as Address,
  },
}

function loadDeployedAddresses(): Record<number, ContractAddresses> {
  try {
    // Vite dynamic import with glob for JSON files
    const modules = import.meta.glob('./deployed-addresses.json', { eager: true })
    const mod = Object.values(modules)[0] as { chainId?: number; vault?: string; executor?: string; adapter?: string } | undefined
    if (mod?.chainId && mod?.vault) {
      return {
        [mod.chainId]: {
          vault: mod.vault as Address,
          executor: (mod.executor || '0x0000000000000000000000000000000000000000') as Address,
          adapter: (mod.adapter || '0x0000000000000000000000000000000000000000') as Address,
        },
      }
    }
  } catch {
    // No deployed addresses file yet
  }
  return {}
}

export const CONTRACT_ADDRESSES: Record<number, ContractAddresses> = {
  ...DEFAULT_ADDRESSES,
  ...loadDeployedAddresses(),
}

export function getContracts(chainId: number): ContractAddresses {
  return CONTRACT_ADDRESSES[chainId] ?? CONTRACT_ADDRESSES[11155111]
}
