import { useEffect, useRef } from 'react'

export interface ChatEntry {
  type: 'user' | 'assistant' | 'thinking' | 'tool_call' | 'tool_result' | 'error'
  content: string
}

export interface ChatViewProps {
  entries: ChatEntry[]
}

const labelMap: Record<ChatEntry['type'], string> = {
  user: 'you',
  assistant: 'jarvis',
  thinking: 'thinking',
  tool_call: 'tool call',
  tool_result: 'result',
  error: 'error'
}

const iconMap: Record<ChatEntry['type'], string> = {
  user: '>',
  assistant: '//',
  thinking: '~',
  tool_call: '$',
  tool_result: '<',
  error: '!'
}

export const ChatView = ({ entries }: ChatViewProps) => {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries])

  return (
    <section className="chat-container">
      <style>{`
        .chat-container {
          min-height: 400px;
          max-height: calc(100vh - 260px);
          overflow-y: auto;
          background: #0a0a0a;
          font-family: 'JetBrains Mono', 'Consolas', monospace;
          font-size: 0.85rem;
          line-height: 1.6;
          scroll-behavior: smooth;
        }
        .chat-container::-webkit-scrollbar { width: 4px; }
        .chat-container::-webkit-scrollbar-track { background: #0a0a0a; }
        .chat-container::-webkit-scrollbar-thumb { background: #333; }
        .chat-empty {
          color: #444;
          padding: 3rem 2rem;
          text-align: center;
          animation: fadeUp 0.5s ease both;
        }
        .chat-empty .prompt-hint {
          display: block;
          margin-top: 1rem;
          color: #333;
          font-size: 0.72rem;
        }
        .chat-entry {
          padding: 0.75rem 1rem;
          border-bottom: 1px solid #141414;
          animation: slideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) both;
          position: relative;
          overflow: hidden;
        }
        .chat-entry::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 0;
          transition: width 0.3s ease;
        }
        .entry-user { background: #0e0e0e; }
        .entry-user::before { background: #a855f7; width: 2px; }
        .entry-assistant { background: #0a0a0a; }
        .entry-assistant::before { background: #a855f7; width: 2px; opacity: 0.4; }
        .entry-thinking {
          background: #0c0c16;
          font-style: italic;
          border-left: 2px solid rgba(138, 138, 205, 0.3);
        }
        .entry-tool_call {
          background: #0a120a;
          border-left: 2px solid #4a9c4a;
          animation: slideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) both, toolPulse 0.6s ease;
        }
        .entry-tool_result {
          background: #0c0c0c;
          border-left: 2px solid #333;
        }
        .entry-error {
          background: #140a0a;
          border-left: 2px solid #c44;
          animation: slideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) both, errorShake 0.4s ease;
        }
        .entry-label {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.68rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 0.3rem;
          opacity: 0.5;
        }
        .entry-icon {
          color: #a855f7;
          font-weight: 700;
          font-size: 0.72rem;
        }
        .entry-content {
          display: block;
        }
        .entry-content-user { color: #e8e8e8; }
        .entry-content-assistant { color: #d4d4d4; }
        .entry-content-thinking { color: #8b8bcd; }
        .entry-content-tool_call { color: #7ec87e; font-size: 0.8rem; }
        .entry-content-tool_result {
          color: #888;
          white-space: pre-wrap;
          max-height: 200px;
          overflow-y: auto;
          font-size: 0.78rem;
        }
        .entry-content-error { color: #e87c7c; }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes toolPulse {
          0% { box-shadow: inset 0 0 0 rgba(74, 156, 74, 0); }
          50% { box-shadow: inset 0 0 20px rgba(74, 156, 74, 0.08); }
          100% { box-shadow: inset 0 0 0 rgba(74, 156, 74, 0); }
        }
        @keyframes errorShake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-3px); }
          75% { transform: translateX(3px); }
        }
      `}</style>
      {entries.length === 0 ? (
        <div className="chat-empty">
          <div>Ask Jarvis anything. It can run commands, read/write files, and more.</div>
          <span className="prompt-hint">try: "list files in my home directory" or "create a python hello world script"</span>
        </div>
      ) : (
        entries.map((entry, index) => (
          <div
            key={index}
            className={`chat-entry entry-${entry.type}`}
            style={{ animationDelay: `${Math.min(index * 0.03, 0.15)}s` }}
          >
            <div className="entry-label">
              <span className="entry-icon">{iconMap[entry.type]}</span>
              {labelMap[entry.type]}
            </div>
            <span className={`entry-content entry-content-${entry.type}`}>
              {entry.content}
            </span>
          </div>
        ))
      )}
      <div ref={endRef} />
    </section>
  )
}
