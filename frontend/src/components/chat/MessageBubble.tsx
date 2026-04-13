import type { ChatMessage } from '@/stores/chatStore'
import StrategyCard from './StrategyCard'
import { formatTime } from '@/utils/format'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'

interface Props {
  message: ChatMessage
  onExecuteStrategy?: () => void
}

export default function MessageBubble({ message, onExecuteStrategy }: Props) {
  const isUser = message.role === 'user'

  return (
    <div className={`max-w-[92%] animate-msg-in ${isUser ? 'self-end' : 'self-start'}`}>
      <div
        className={`px-[18px] py-3.5 rounded-2xl text-[13.5px] leading-relaxed tracking-wide ${
          isUser
            ? 'rounded-br-[4px] border'
            : 'glass-card rounded-bl-[4px]'
        }`}
        style={
          isUser
            ? { background: 'var(--gradient-user-msg)', borderColor: 'var(--user-bubble-border)' }
            : undefined
        }
      >
        {isUser ? (
          <div>{message.content}</div>
        ) : (
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
        {message.strategy && (
          <StrategyCard strategy={message.strategy} onExecute={onExecuteStrategy} />
        )}
      </div>
      <div className={`text-[10px] text-text-dim mt-1 px-1 ${isUser ? 'text-right' : ''}`}>
        {formatTime(message.timestamp)}
      </div>
    </div>
  )
}
