import { useCallback } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { useChatStore } from '@/stores/chatStore'
import { sendChatMessage } from '@/services/ai'

export function useChat() {
  const { addMessage, setLoading, setCurrentStrategy } = useChatStore()
  const messages = useChatStore((s) => s.messages)
  const setPendingTxParams = useChatStore((s) => s.setPendingTxParams)
  const { address } = useAccount()
  const chainId = useChainId()

  const send = useCallback(
    async (content: string) => {
      addMessage({ role: 'user', content })
      setLoading(true)

      try {
        const history = messages
          .filter((m) => !m.isSeed)
          .map((m) => ({
            role: m.role === 'ai' ? 'assistant' : m.role,
            content: m.content,
          }))
        history.push({ role: 'user', content })

        console.log('[CHAT] sending', { user: address, chainId, historyLen: history.length })

        const response = await sendChatMessage(
          history,
          address,
          chainId,
        )

        console.log('[CHAT] response received', {
          hasStrategy: !!response.strategy,
          hasTxParams: !!response.txParams,
          textLen: response.text?.length,
        })

        addMessage({
          role: 'ai',
          content: response.text,
          strategy: response.strategy,
        })

        if (response.strategy) {
          console.log('[CHAT] strategy:', {
            items: response.strategy.items.length,
            totalApy: response.strategy.totalApy,
            riskLevel: response.strategy.riskLevel,
          })
          setCurrentStrategy(response.strategy)

          if (response.txParams) {
            console.log('[CHAT] txParams:', {
              mode: response.txParams.mode,
              to: response.txParams.to,
              fn: response.txParams.functionName,
              value: response.txParams.value,
            })
            setPendingTxParams(response.txParams)
          }

          // Strategy is a recommendation only; don't write to positions
          // Positions will update from on-chain data after transaction executes
        }
      } catch (err) {
        console.error('[CHAT] error:', err)
        addMessage({
          role: 'ai',
          content: '抱歉，分析过程中出现错误，请稍后重试。',
        })
      } finally {
        setLoading(false)
      }
    },
    [addMessage, setLoading, setCurrentStrategy, setPendingTxParams, address, chainId, messages]
  )

  return { send }
}
