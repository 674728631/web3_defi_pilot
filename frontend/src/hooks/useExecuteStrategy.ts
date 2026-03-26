import { useState, useCallback } from 'react'
import { useAccount, useChainId, useWriteContract, useReadContract } from 'wagmi'
import { formatEther } from 'viem'
import { useChatStore } from '@/stores/chatStore'
import { usePortfolioStore } from '@/stores/portfolioStore'
import { getContracts } from '@/utils/contracts'
import type { TxParams } from '@/services/ai'
import VaultAbi from '@/abi/DeFiPilotVault.json'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

function getExplorerUrl(chainId: number, txHash: string): string {
  if (chainId === 421614) {
    return `https://sepolia.arbiscan.io/tx/${txHash}`
  }
  return `https://sepolia.etherscan.io/tx/${txHash}`
}

export type ExecutionStatus = 'idle' | 'depositing' | 'executing' | 'success' | 'error'

export function useExecuteStrategy() {
  const { isConnected, address } = useAccount()
  const chainId = useChainId()
  const [status, setStatus] = useState<ExecutionStatus>('idle')
  const [txHash, setTxHash] = useState<string>()
  const pendingTxParams = useChatStore((s) => s.pendingTxParams)
  const setPendingTxParams = useChatStore((s) => s.setPendingTxParams)
  const addMessage = useChatStore((s) => s.addMessage)
  const refreshPortfolio = usePortfolioStore((s) => s.refreshPortfolio)

  const contracts = getContracts(chainId)
  const { data: vaultBalance } = useReadContract({
    address: contracts.vault,
    abi: VaultAbi,
    functionName: 'getUserBalance',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const { writeContractAsync } = useWriteContract()

  const execute = useCallback(
    async () => {
      if (!isConnected || !address) {
        addMessage({ role: 'ai', content: '请先连接钱包后再执行策略。' })
        return
      }

      const txParams = pendingTxParams
      if (!txParams) {
        addMessage({ role: 'ai', content: '没有待执行的策略。' })
        return
      }

      const effectiveChainId = txParams.chainId || chainId

      if (txParams.mode === 'solver' && txParams.intents?.length) {
        const totalRequired = txParams.intents.reduce(
          (sum, i) => sum + BigInt(i.amount || '0'), 0n
        )
        const currentBalance = (vaultBalance as bigint) ?? 0n
        if (totalRequired > currentBalance) {
          const requiredETH = formatEther(totalRequired)
          const currentETH = formatEther(currentBalance)
          addMessage({
            role: 'ai',
            content: `Vault 余额不足：策略需要 ${requiredETH} ETH，当前 Vault 余额仅 ${currentETH} ETH。请先通过 deposit 存入足够的 ETH 后再执行。`,
          })
          return
        }
      }

      setStatus('depositing')

      try {
        if (txParams.mode === 'direct') {
          const hash = await writeContractAsync({
            address: txParams.to as `0x${string}`,
            abi: VaultAbi,
            functionName: txParams.functionName!,
            args: txParams.args as readonly unknown[],
            value: txParams.value ? BigInt(txParams.value) : undefined,
          })

          setTxHash(hash)
          setStatus('executing')
          setPendingTxParams(null)

          const explorerUrl = getExplorerUrl(effectiveChainId, hash)
          const confirmed = await waitForTx(hash, effectiveChainId)
          if (confirmed) {
            setStatus('success')
            addMessage({
              role: 'ai',
              content: `交易已确认！[查看区块浏览器](${explorerUrl})`,
            })
            refreshPortfolio(address, effectiveChainId)
          } else {
            setStatus('error')
            addMessage({ role: 'ai', content: '交易失败，请检查 Gas 或余额后重试。' })
          }
        } else if (txParams.mode === 'solver') {
          setStatus('executing')

          const res = await fetch(`${BACKEND_URL}/api/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userAddress: address,
              chainId: effectiveChainId,
              intents: txParams.intents,
              deadline: Math.floor(Date.now() / 1000) + 3600,
              signature: '',
            }),
          })

          if (!res.ok) {
            const errBody = await res.json().catch(() => ({ error: 'Unknown error' }))
            throw new Error(errBody.error || 'Execute failed')
          }

          const result = await res.json()
          setTxHash(result.txHash)
          setPendingTxParams(null)

          const explorerUrl = getExplorerUrl(effectiveChainId, result.txHash)
          const confirmed = await waitForTx(result.txHash, effectiveChainId)
          if (confirmed) {
            setStatus('success')
            addMessage({
              role: 'ai',
              content: `Solver 交易已确认！[查看区块浏览器](${explorerUrl})`,
            })
            refreshPortfolio(address, effectiveChainId)
          } else {
            setStatus('error')
            addMessage({ role: 'ai', content: 'Solver 交易失败，请重试。' })
          }
        }

        setTimeout(() => setStatus('idle'), 5000)
      } catch (err) {
        setStatus('error')
        const msg = err instanceof Error ? err.message : '未知错误'
        addMessage({ role: 'ai', content: `执行失败: ${msg}` })
        setTimeout(() => setStatus('idle'), 3000)
      }
    },
    [isConnected, address, chainId, pendingTxParams, writeContractAsync, setPendingTxParams, addMessage, refreshPortfolio, vaultBalance]
  )

  return {
    execute,
    status,
    txHash,
    hasPendingStrategy: !!pendingTxParams,
    statusText: {
      idle: '',
      depositing: '发送交易中...',
      executing: '等待链上确认...',
      success: '策略执行成功!',
      error: '执行失败，请重试',
    }[status],
  }
}

async function waitForTx(hash: string, chainId: number): Promise<boolean> {
  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    try {
      const res = await fetch(`${BACKEND_URL}/api/tx/${hash}?chainId=${chainId}`)
      const data = await res.json()
      if (data.status === 'success') return true
      if (data.status === 'failed') return false
    } catch { /* continue polling */ }
  }
  return false
}
