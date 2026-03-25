import type { Strategy } from '@/stores/chatStore'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

export interface TxParams {
  mode: 'direct' | 'solver'
  to?: string
  functionName?: string
  args?: unknown[]
  value?: string
  chainId?: number
  eip712Domain?: Record<string, unknown>
  eip712Types?: Record<string, unknown>
  eip712Message?: Record<string, unknown>
  intents?: Array<{ protocol: string; amount: string; data: string }>
}

export interface AiResponse {
  text: string
  strategy?: Strategy
  txParams?: TxParams
}

/**
 * 发送聊天消息到后端 AI 代理
 * 后端负责：OpenAI 调用、策略解析、链上上下文注入、calldata 编码
 * 前端只做：渲染和确认
 */
export async function sendChatMessage(
  messages: { role: string; content: string }[],
  userAddress?: string,
  chainId?: number
): Promise<AiResponse> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, userAddress, chainId }),
    })

    if (!res.ok) {
      console.warn(`[AI] Backend returned ${res.status}, using local fallback`)
      const fallback = buildLocalFallback(messages)
      fallback.text = `⚠️ AI 服务暂时不可用，以下为本地预估策略：\n\n${fallback.text}`
      return fallback
    }

    return await res.json()
  } catch (err) {
    console.warn('[AI] Backend unreachable, using local fallback', err)
    const fallback = buildLocalFallback(messages)
    fallback.text = `⚠️ 后端未连接，以下为本地预估策略：\n\n${fallback.text}`
    return fallback
  }
}

/**
 * 后端不可用时的本地降级策略
 */
function buildLocalFallback(
  messages: { role: string; content: string }[]
): AiResponse {
  const lastMsg = messages.findLast((m) => m.role === 'user')?.content || ''
  const lower = lastMsg.toLowerCase()
  const isLowRisk = lower.includes('低') || lower.includes('low') || lower.includes('安全')
  const risk = isLowRisk ? 'Low' : 'Medium'

  const ethMatch = lastMsg.match(/(\d+\.?\d*)\s*(?:ETH|eth|个以太)/)
  const totalEth = ethMatch ? parseFloat(ethMatch[1]) : 5

  const items = [
    { chain: 'sepolia', protocol: 'Aave V3', action: 'ETH Lending', amount: `${(totalEth * 0.6).toFixed(1)} ETH`, apy: 3.12, detail: `${(totalEth * 0.6).toFixed(1)} ETH → Aave V3` },
    { chain: 'sepolia', protocol: 'Compound V3', action: 'ETH Supply', amount: `${(totalEth * 0.4).toFixed(1)} ETH`, apy: 4.25, detail: `${(totalEth * 0.4).toFixed(1)} ETH → Compound V3` },
  ]
  const totalApy = 3.12 * 0.6 + 4.25 * 0.4

  return {
    text: `已为您生成 ${risk} 风险策略（本地引擎，后端未连接）：综合年化 ${totalApy.toFixed(2)}%`,
    strategy: {
      items,
      totalApy: parseFloat(totalApy.toFixed(2)),
      riskLevel: risk as 'Low' | 'Medium',
      estimatedYearlyReturn: Math.round(totalEth * 3650 * totalApy / 100),
    },
  }
}
