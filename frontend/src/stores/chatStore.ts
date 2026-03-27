import { create } from 'zustand'
import type { TxParams } from '@/services/ai'

export interface StrategyItem {
  chain: string
  protocol: string
  action: string
  amount: string
  apy: number
  detail: string
}

export interface Strategy {
  items: StrategyItem[]
  totalApy: number
  riskLevel: 'Low' | 'Medium' | 'High'
  estimatedYearlyReturn: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'ai'
  content: string
  timestamp: Date
  strategy?: Strategy
  isSeed?: boolean
}

interface ChatState {
  messages: ChatMessage[]
  isLoading: boolean
  currentStrategy: Strategy | null
  pendingTxParams: TxParams | null
  draftInput: string
  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  clearMessages: () => void
  setLoading: (v: boolean) => void
  setCurrentStrategy: (s: Strategy | null) => void
  setPendingTxParams: (p: TxParams | null) => void
  setDraftInput: (v: string) => void
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isLoading: false,
  currentStrategy: null,
  pendingTxParams: null,
  draftInput: '',
  addMessage: (msg) =>
    set((state) => ({
      messages: [
        ...state.messages,
        { ...msg, id: crypto.randomUUID(), timestamp: new Date() },
      ],
    })),
  clearMessages: () => set({ messages: [], currentStrategy: null, pendingTxParams: null }),
  setLoading: (isLoading) => set({ isLoading }),
  setCurrentStrategy: (currentStrategy) => set({ currentStrategy }),
  setPendingTxParams: (pendingTxParams) => set({ pendingTxParams }),
  setDraftInput: (draftInput) => set({ draftInput }),
}))
