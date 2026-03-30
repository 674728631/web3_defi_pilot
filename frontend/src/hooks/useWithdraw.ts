import { useState, useCallback, useRef } from 'react'
import { useAccount, useChainId, useConnectorClient } from 'wagmi'
import { parseEther, encodeFunctionData, numberToHex, createPublicClient, http } from 'viem'
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
  const pendingRef = useRef(false)
  const refreshPortfolio = usePortfolioStore((s) => s.refreshPortfolio)
  const addMessage = useChatStore((s) => s.addMessage)

  const { data: connectorClient } = useConnectorClient()

  const isProcessing = status !== 'idle' && status !== 'success' && status !== 'error'

  const withdrawFromVault = useCallback(
    async (amountETH: string) => {
      if (!isConnected || !address || !connectorClient) return
      if (pendingRef.current) return
      pendingRef.current = true

      console.log('[WITHDRAW] start', { amount: amountETH, user: address, chainId })
      setStatus('signing')
      try {
        const contracts = getContracts(chainId)
        
        // Always try to fetch exact wei balance from contract to avoid precision issues
        let exactWei = parseEther(amountETH)
        try {
          const client = createPublicClient({ 
            chain: connectorClient.chain, 
            transport: http() 
          })
          const balance = await client.readContract({
            address: contracts.vault,
            abi: VaultAbi,
            functionName: 'getUserBalance',
            args: [address]
          })
          if (balance > 0n) {
            exactWei = balance as bigint
            console.log('[WITHDRAW] using exact wei balance:', exactWei.toString())
          }
        } catch (e) {
          console.warn('[WITHDRAW] failed to get exact balance, using parsed ether', e)
        }

        const calldata = encodeFunctionData({
          abi: VaultAbi,
          functionName: 'withdraw',
          args: [exactWei],
        })

        console.log('[WITHDRAW] sending tx to vault:', contracts.vault)
        const hash = await connectorClient.request({
          method: 'eth_sendTransaction',
          params: [{
            from: address,
            to: contracts.vault,
            data: calldata,
            gas: numberToHex(200_000n),
          }],
        }) as `0x${string}`

        console.log('[WITHDRAW] tx sent, hash:', hash)
        setTxHash(hash)
        setStatus('confirming')

        const explorerUrl = getExplorerUrl(chainId, hash)
        const confirmed = await waitForTx(hash, chainId)
        console.log('[WITHDRAW] tx result:', confirmed ? 'success' : 'failed')
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

        setTimeout(() => { setStatus('idle'); pendingRef.current = false }, 3000)
      } catch (err) {
        console.error('[WITHDRAW] failed:', err)
        setStatus('error')
        const msg = err instanceof Error ? err.message : '赎回失败'
        addMessage({ role: 'ai', content: `赎回失败: ${msg}` })
        setTimeout(() => { setStatus('idle'); pendingRef.current = false }, 3000)
      }
    },
    [isConnected, address, chainId, connectorClient, refreshPortfolio, addMessage]
  )

  const withdrawFromProtocol = useCallback(
    async (positionId: number) => {
      if (!isConnected || !address || !connectorClient) return
      if (pendingRef.current) return
      pendingRef.current = true

      console.log('[WITHDRAW-PROTOCOL] start', { positionId, user: address, chainId })
      setStatus('signing')
      try {
        const contracts = getContracts(chainId)
        const calldata = encodeFunctionData({
          abi: VaultAbi,
          functionName: 'withdrawFromProtocol',
          args: [BigInt(positionId)],
        })

        console.log('[WITHDRAW-PROTOCOL] sending tx to vault:', contracts.vault)
        const hash = await connectorClient.request({
          method: 'eth_sendTransaction',
          params: [{
            from: address,
            to: contracts.vault,
            data: calldata,
            gas: numberToHex(500_000n),
          }],
        }) as `0x${string}`

        console.log('[WITHDRAW-PROTOCOL] tx sent, hash:', hash)
        setTxHash(hash)
        setStatus('confirming')

        const explorerUrl = getExplorerUrl(chainId, hash)
        const confirmed = await waitForTx(hash, chainId)
        console.log('[WITHDRAW-PROTOCOL] tx result:', confirmed ? 'success' : 'failed')
        if (confirmed) {
          setStatus('success')
          addMessage({
            role: 'ai',
            content: `协议持仓赎回成功！ETH 已退回 Vault。[查看区块浏览器](${explorerUrl})`,
          })
          refreshPortfolio(address, chainId)
        } else {
          setStatus('error')
          addMessage({ role: 'ai', content: '协议赎回交易失败，请重试。' })
        }

        setTimeout(() => { setStatus('idle'); pendingRef.current = false }, 3000)
      } catch (err) {
        console.error('[WITHDRAW-PROTOCOL] failed:', err)
        setStatus('error')
        const msg = err instanceof Error ? err.message : '赎回失败'
        addMessage({ role: 'ai', content: `协议赎回失败: ${msg}` })
        setTimeout(() => { setStatus('idle'); pendingRef.current = false }, 3000)
      }
    },
    [isConnected, address, chainId, connectorClient, refreshPortfolio, addMessage]
  )

  return { withdrawFromVault, withdrawFromProtocol, status, txHash, isProcessing }
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
