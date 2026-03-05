import type { ChatMessage } from '@jarvis/core'

export interface ChatViewProps {
  messages: ChatMessage[]
}

export const ChatView = ({ messages }: ChatViewProps) => (
  <section
    style={{
      border: '1px solid #1f2937',
      borderRadius: 12,
      minHeight: 380,
      padding: 16,
      overflowY: 'auto',
      background: '#0b1220'
    }}
  >
    {messages.length === 0 ? (
      <p style={{ color: '#94a3b8', margin: 0 }}>Start chatting with your local mock model.</p>
    ) : (
      messages.map((message, index) => (
        <article
          key={`${message.role}-${index.toString()}`}
          style={{
            marginBottom: 12,
            padding: 12,
            borderRadius: 10,
            background: message.role === 'user' ? '#1e293b' : '#111827',
            color: '#e2e8f0'
          }}
        >
          <strong style={{ display: 'block', marginBottom: 6, color: '#93c5fd' }}>{message.role}</strong>
          <span>{message.content}</span>
        </article>
      ))
    )}
  </section>
)
