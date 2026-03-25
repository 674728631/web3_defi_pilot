import { useState, useCallback } from 'react'
import { useAccount, useChainId, useWriteContract } from 'wagmi'
import { parseEther } from 'viem'
import { getContracts } from '@/utils/contracts'
import { usePortfolioStore } from '@/stores/portfolioStore'
import { useChatStore } from '@/stores/chatStore'
import VaultAbi from '@/abi/DeFiPilotVault.json'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

function getExplorerUrl(chainId: number, txHash: string): string {
  if (chainId === 421614) {
    return `https://sepolia.arbiscan.io/tx/${txHash}`
  }
  return `https://sepolia.etherscan.io/tx/${txHash}`
}

export type WithdrawStatus = 'idle' | 'signing' | 'confirming' | 'success' | 'error'

export function useWithdraw() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const [status, setStatus] = useState<WithdrawStatus>('idle')
  const [txHash, setTxHash] = useState<string>()
  const refreshPortfolio = usePortfolioStore((s) => s.refreshPortfolio)
  const addMessage = useChatStore((s) => s.addMessage)

  const { writeContractAsync } = useWriteContract()

  const withdrawFromVault = useCallback(
    async (amountETH: string) => {
      if (!isConnected || !address) return

      setStatus('signing')
      try {
        const contracts = getContracts(chainId)
        const hash = await writeContractAsync({
          address: contracts.vault,
          abi: VaultAbi,
          functionName: 'withdraw',
          args: [parseEther(amountETH)],
        })

        setTxHash(hash)
        setStatus('confirming')

        const explorerUrl = getExplorerUrl(chainId, hash)
        const confirmed = await waitForTx(hash, chainId)
        if (confirmed) {
          setStatus('success')
          addMessage({
            role: 'ai',
            content: `赎回 ${amountETH} ETH 成功！[查看区块浏览器](${explorerUrl})`,
          })
          refreshPortfolio(address, chainId)
        } else {
          setStatus('error')
          addMessage({ role: 'ai', content: '赎回交易失败，请检查余额后重试。' })
        }

        setTimeout(() => setStatus('idle'), 3000)
      } catch (err) {
        setStatus('error')
        const msg = err instanceof Error ? err.message : '赎回失败'
        addMessage({ role: 'ai', content: `赎回失败: ${msg}` })
        setTimeout(() => setStatus('idle'), 3000)
      }
    },
    [isConnected, address, chainId, writeContractAsync, refreshPortfolio, addMessage]
  )

  return { withdrawFromVault, status, txHash }
}

async function waitForTx(hash: string, chainId: number): Promise<boolean> {
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    try {
      const res = await fetch(`${BACKEND_URL}/api/tx/${hash}?chainId=${chainId}`)
      const data = await res.json()
      if (data.status === 'success') return true
      if (data.status === 'failed') return false
    } catch { /* continue */ }
  }
  return false
}
