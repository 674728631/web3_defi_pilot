import { createConfig, http } from 'wagmi'
import { sepolia, arbitrumSepolia } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

const SEPOLIA_RPC = import.meta.env.VITE_SEPOLIA_RPC_URL || undefined
const ARB_SEPOLIA_RPC = import.meta.env.VITE_ARB_SEPOLIA_RPC_URL || undefined

export const config = createConfig({
  chains: [sepolia, arbitrumSepolia],
  connectors: [injected()],
  transports: {
    [sepolia.id]: http(SEPOLIA_RPC, { timeout: 30_000 }),
    [arbitrumSepolia.id]: http(ARB_SEPOLIA_RPC, { timeout: 30_000 }),
  },
})
