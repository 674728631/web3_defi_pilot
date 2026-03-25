import { useEffect, useRef } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { useLangStore } from '@/stores/langStore'
import { getT } from '@/utils/i18n'
import type { Strategy } from '@/stores/chatStore'

function buildStrategy(lang: 'en' | 'zh'): Strategy {
  const t = getT(lang)
  return {
    items: [
      { chain: 'arbitrum', protocol: 'Aave V3', action: 'ETH Lending', amount: '2.5 ETH', apy: 4.82, detail: t('seed.detail1') },
      { chain: 'base', protocol: 'Compound V3', action: 'ETH Supply', amount: '1.5 ETH', apy: 5.12, detail: t('seed.detail2') },
      { chain: 'ethereum', protocol: 'Lido', action: 'stETH', amount: '1.0 ETH', apy: 3.95, detail: t('seed.detail3') },
    ],
    totalApy: 5.17,
    riskLevel: 'Low',
    estimatedYearlyReturn: 1892,
  }
}

export function useSeedChat() {
  const seeded = useRef(false)
  const addMessage = useChatStore((s) => s.addMessage)
  const lang = useLangStore((s) => s.lang)
  const langRef = useRef(lang)

  useEffect(() => {
    langRef.current = lang
  }, [lang])

  useEffect(() => {
    if (seeded.current) return
    seeded.current = true

    const currentLang = langRef.current
    const t = getT(currentLang)
    const strategy = buildStrategy(currentLang)

    addMessage({
      role: 'user',
      content: t('seed.user1'),
    })

    setTimeout(() => {
      addMessage({
        role: 'ai',
        content: t('seed.ai1'),
        strategy,
      })
    }, 300)

    setTimeout(() => {
      addMessage({
        role: 'user',
        content: t('seed.user2'),
      })
    }, 600)

    setTimeout(() => {
      addMessage({
        role: 'ai',
        content: t('seed.ai2'),
      })
    }, 900)
  }, [addMessage])
}
