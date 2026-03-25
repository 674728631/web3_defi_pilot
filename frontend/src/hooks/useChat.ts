import { useCallback } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { useChatStore } from '@/stores/chatStore'
import { usePortfolioStore } from '@/stores/portfolioStore'
import { sendChatMessage } from '@/services/ai'

export function useChat() {
  const { addMessage, setLoading, setCurrentStrategy } = useChatStore()
  const messages = useChatStore((s) => s.messages)
  const setPendingTxParams = useChatStore((s) => s.setPendingTxParams)
  const setPositions = usePortfolioStore((s) => s.setPositions)
  const setStats = usePortfolioStore((s) => s.setStats)
  const { address } = useAccount()
  const chainId = useChainId()

  const send = useCallback(
    async (content: string) => {
      addMessage({ role: 'user', content })
      setLoading(true)

      try {
        const history = messages.map((m) => ({
          role: m.role === 'ai' ? 'assistant' : m.role,
          content: m.content,
        }))
        history.push({ role: 'user', content })

        const response = await sendChatMessage(
          history,
          address,
          chainId,
        )

        addMessage({
          role: 'ai',
          content: response.text,
          strategy: response.strategy,
        })

        if (response.strategy) {
          setCurrentStrategy(response.strategy)

          if (response.txParams) {
            setPendingTxParams(response.txParams)
          }

          const newPositions = response.strategy.items.map((item, i) => ({
            id: String(i + 1),
            chain: item.chain,
            protocol: item.protocol,
            asset: item.amount.split(' ').pop() || 'ETH',
            amount: parseFloat(item.amount),
            usdValue: parseFloat(item.amount) * 3650,
            apy: item.apy,
            earned: Math.round(parseFloat(item.amount) * 3650 * item.apy / 100 / 12),
            riskLevel: response.strategy!.riskLevel,
          }))
          setPositions(newPositions)

          const totalValue = newPositions.reduce((s, p) => s + p.usdValue, 0)
          setStats({
            totalValue,
            totalValueChange: 0,
            avgApy: response.strategy.totalApy,
            apyChange: 0,
            earned30d: Math.round(totalValue * response.strategy.totalApy / 100 / 12),
            earnedChange: 0,
            activeChains: [...new Set(newPositions.map((p) => p.chain.slice(0, 3).toUpperCase()))],
          })
        }
      } catch {
        addMessage({
          role: 'ai',
          content: '抱歉，分析过程中出现错误，请稍后重试。',
        })
      } finally {
        setLoading(false)
      }
    },
    [addMessage, setLoading, setCurrentStrategy, setPendingTxParams, setPositions, setStats, address, chainId, messages]
  )

  return { send }
}
