import { useRef, useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { useChatStore } from '@/stores/chatStore'
import { useChat } from '@/hooks/useChat'
import { useExecuteStrategy } from '@/hooks/useExecuteStrategy'
import { useT } from '@/utils/i18n'
import MessageBubble from './MessageBubble'

export default function ChatPanel() {
  const { messages, isLoading, currentStrategy, draftInput, setDraftInput } = useChatStore()
  const { send } = useChat()
  const { execute, status, statusText } = useExecuteStrategy()
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const t = useT()
  const { isConnected } = useAccount()

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (draftInput) {
      setInput(draftInput)
      setDraftInput('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [draftInput, setDraftInput])

  const handleSend = () => {
    if (!isConnected) return
    const val = input.trim()
    if (!val || isLoading) return
    setInput('')
    send(val)
  }

  return (
    <div className="border-r border-white/5 flex flex-col h-[calc(100vh-64px)] overflow-hidden glass-card" style={{ borderRadius: 0 }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-white/5 shrink-0">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl relative"
          style={{
            background: 'linear-gradient(135deg, #22d3ee, #a855f7, #ec4899)',
            boxShadow: '0 0 25px rgba(34,211,238,0.3)',
          }}
        >
          🤖
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-cyber-green border-2 border-bg-primary network-pulse" />
        </div>
        <div>
          <h3 className="font-display text-sm font-semibold tracking-wider gradient-text">{t('chat.title')}</h3>
          <span className="text-[11px] text-cyber-green flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-cyber-green pulse-live inline-block" style={{ color: '#10b981' }} />
            {t('chat.status')}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 flex flex-col gap-4">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onExecuteStrategy={msg.strategy ? () => execute() : undefined}
          />
        ))}
        {status !== 'idle' && (
          <div className="self-start max-w-[92%] animate-msg-in">
            <div className={`glass-card rounded-2xl rounded-bl-[4px] px-[18px] py-3.5 text-[13.5px] ${
              status === 'success' ? 'border-cyber-green/30 text-cyber-green' : status === 'error' ? 'border-neon-red/30 text-neon-red' : 'border-cyber-cyan/30 text-cyber-cyan'
            }`}>
              {status === 'depositing' || status === 'executing' ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-cyber-cyan border-t-transparent rounded-full animate-spin" />
                  {statusText}
                </span>
              ) : statusText}
            </div>
          </div>
        )}
        {isLoading && (
          <div className="self-start max-w-[92%] animate-msg-in">
            <div className="glass-card rounded-2xl rounded-bl-[4px] px-[18px] py-3.5">
              <div className="flex gap-1 py-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-cyber-cyan"
                    style={{ animation: `typing 1.4s ease-in-out ${i * 0.2}s infinite` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Wallet guard notice */}
      {!isConnected && (
        <div className="px-5 py-3 border-t border-neon-amber/20 bg-neon-amber/5 text-center">
          <span className="text-[12px] text-neon-amber">{t('chat.walletRequired')}</span>
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 px-5 py-4 border-t border-white/5" style={{ background: 'rgba(5,5,8,0.9)' }}>
        <div className={`flex items-center gap-2.5 px-[18px] py-2 pr-2 rounded-[14px] border bg-bg-glass transition-all ${
          isConnected ? 'border-cyber-cyan/15 focus-within:border-cyber-cyan/40 focus-within:shadow-[0_0_25px_rgba(34,211,238,0.08)]' : 'border-white/5 opacity-50'
        }`}>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={isConnected ? t('chat.placeholder') : t('chat.placeholderNoWallet')}
            disabled={!isConnected}
            className="flex-1 bg-transparent text-[13.5px] text-text-primary outline-none placeholder:text-text-dim font-body disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSend}
            disabled={!isConnected}
            className="w-9 h-9 rounded-[10px] flex items-center justify-center text-white text-base shrink-0 transition-all glow-button cursor-pointer hover:scale-105 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  )
}
