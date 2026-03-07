import { useEffect, useRef } from 'react'

export interface ChatEntry {
  type: 'user' | 'assistant' | 'thinking' | 'tool_call' | 'tool_result' | 'error'
  content: string
}

export interface ChatViewProps {
  entries: ChatEntry[]
  isStreaming?: boolean
  compact?: boolean
}

const labelMap: Record<ChatEntry['type'], string> = {
  user: 'You',
  assistant: 'Jarvis',
  thinking: 'Thinking',
  tool_call: 'Tool',
  tool_result: 'Result',
  error: 'Error'
}

export const ChatView = ({ entries, isStreaming = false, compact = false }: ChatViewProps) => {
  const endRef = useRef<HTMLDivElement>(null)
  const previousCountRef = useRef(0)

  useEffect(() => {
    const behavior = isStreaming ? 'auto' : entries.length > previousCountRef.current ? 'smooth' : 'auto'
    endRef.current?.scrollIntoView({ behavior })
    previousCountRef.current = entries.length
  }, [entries, isStreaming])

  const lastIndex = entries.length - 1
  const isLastAssistantStreaming = (index: number): boolean =>
    isStreaming && index === lastIndex && entries[index]?.type === 'assistant'

  return (
    <section
      className={`cv${isStreaming ? ' cv--streaming' : ''}${compact ? ' cv--compact' : ''}`}
      data-testid="chat-view"
    >
      <style>{`
        .cv {
          height: 100%;
          overflow-y: auto;
          padding: 12px 0;
          scroll-behavior: smooth;
        }
        .cv--streaming { scroll-behavior: auto; }
        .cv--compact { padding: 8px 0; }

        /* empty state */
        .cv-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          gap: 20px;
          padding: 48px 24px;
          animation: cvBounceIn 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        .cv--compact .cv-empty { gap: 14px; padding: 24px 16px; }
        .cv-empty-logo {
          font-family: 'JetBrains Mono', monospace;
          font-weight: 700;
          font-size: 2.6rem;
          color: #c084fc;
          animation: cvFloat 3s ease-in-out infinite;
          text-shadow: 0 0 30px rgba(168, 85, 247, 0.4), 0 0 60px rgba(168, 85, 247, 0.15);
        }
        .cv--compact .cv-empty-logo { font-size: 1.6rem; }
        .cv-empty-text {
          color: rgba(228, 228, 231, 0.52);
          font-size: 0.86rem;
          font-weight: 500;
          text-align: center;
          line-height: 1.7;
          max-width: 340px;
          animation: cvBounceIn 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both;
        }
        .cv--compact .cv-empty-text { font-size: 0.74rem; max-width: 260px; }
        .cv-empty-hint {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.72rem;
          color: rgba(168, 85, 247, 0.45);
          padding: 12px 22px;
          border: 1px solid rgba(168, 85, 247, 0.14);
          border-radius: 20px;
          background: rgba(168, 85, 247, 0.05);
          animation: cvBounceIn 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both;
          transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s;
        }
        .cv--compact .cv-empty-hint { font-size: 0.64rem; padding: 8px 14px; }
        .cv-empty-hint:hover {
          transform: scale(1.04);
          background: rgba(168, 85, 247, 0.08);
        }

        /* entries */
        .cv-entry {
          padding: 14px 20px;
          position: relative;
          animation: cvPopIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
          transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .cv--compact .cv-entry { padding: 10px 12px; }
        .cv-entry:hover {
          transform: scale(1.005);
        }
        .cv--streaming .cv-entry {
          animation: none !important;
        }
        .cv-entry + .cv-entry { margin-top: 2px; }

        .cv-entry--user {
          background: rgba(168, 85, 247, 0.05);
          border-radius: 22px;
          margin: 6px 16px;
          border: 1px solid rgba(168, 85, 247, 0.1);
        }
        .cv--compact .cv-entry--user { margin: 4px 8px; border-radius: 18px; }
        .cv-entry--assistant {
          padding: 16px 22px;
          margin: 6px 16px;
          border-radius: 22px;
          background: rgba(255, 255, 255, 0.025);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .cv--compact .cv-entry--assistant { padding: 10px 14px; margin: 4px 8px; border-radius: 18px; }
        .cv-entry--thinking {
          background: rgba(139, 92, 246, 0.05);
          border-left: 3px solid rgba(139, 92, 246, 0.2);
          margin: 4px 16px;
          border-radius: 0 18px 18px 0;
          padding: 10px 16px;
          animation: cvSlideRight 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        .cv--compact .cv-entry--thinking { margin: 3px 8px; padding: 7px 10px; border-radius: 0 14px 14px 0; }
        .cv-entry--tool_call {
          background: rgba(52, 211, 153, 0.05);
          border-left: 3px solid rgba(52, 211, 153, 0.25);
          margin: 4px 16px;
          border-radius: 0 18px 18px 0;
          padding: 10px 16px;
          animation: cvPopIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        .cv--compact .cv-entry--tool_call { margin: 3px 8px; padding: 7px 10px; border-radius: 0 14px 14px 0; }
        .cv-entry--tool_result {
          background: rgba(255, 255, 255, 0.015);
          border-left: 3px solid rgba(255, 255, 255, 0.06);
          margin: 4px 16px;
          border-radius: 0 18px 18px 0;
          padding: 10px 16px;
          animation: cvSlideRight 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        .cv--compact .cv-entry--tool_result { margin: 3px 8px; padding: 7px 10px; max-height: 100px; border-radius: 0 14px 14px 0; }
        .cv-entry--error {
          background: rgba(239, 68, 68, 0.06);
          border-left: 3px solid rgba(239, 68, 68, 0.3);
          margin: 4px 16px;
          border-radius: 0 18px 18px 0;
          padding: 10px 16px;
          animation: cvWobble 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        .cv--compact .cv-entry--error { margin: 3px 8px; padding: 7px 10px; border-radius: 0 14px 14px 0; }

        /* label */
        .cv-label {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 6px;
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .cv--compact .cv-label { font-size: 0.62rem; gap: 5px; margin-bottom: 4px; }
        .cv-label--user { color: rgba(168, 85, 247, 0.75); text-shadow: 0 0 12px rgba(168, 85, 247, 0.2); }
        .cv-label--assistant { color: rgba(168, 85, 247, 0.65); text-shadow: 0 0 10px rgba(168, 85, 247, 0.15); }
        .cv-label--thinking { color: rgba(139, 92, 246, 0.55); }
        .cv-label--tool_call { color: rgba(52, 211, 153, 0.65); text-shadow: 0 0 10px rgba(52, 211, 153, 0.15); }
        .cv-label--tool_result { color: rgba(255, 255, 255, 0.3); }
        .cv-label--error { color: rgba(239, 68, 68, 0.75); text-shadow: 0 0 10px rgba(239, 68, 68, 0.2); }

        .cv-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
          animation: cvDotBounce 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        .cv--compact .cv-dot { width: 5px; height: 5px; }
        .cv-dot--user { background: #a855f7; box-shadow: 0 0 8px rgba(168, 85, 247, 0.4); }
        .cv-dot--assistant { background: #a855f7; box-shadow: 0 0 8px rgba(168, 85, 247, 0.3); opacity: 0.6; }
        .cv-dot--thinking { background: #8b5cf6; box-shadow: 0 0 6px rgba(139, 92, 246, 0.3); }
        .cv-dot--tool_call { background: #34d399; box-shadow: 0 0 8px rgba(52, 211, 153, 0.4); }
        .cv-dot--tool_result { background: rgba(255, 255, 255, 0.2); }
        .cv-dot--error { background: #ef4444; box-shadow: 0 0 8px rgba(239, 68, 68, 0.4); animation: cvDotBounce 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both, cvPulseRed 1s ease-in-out infinite; }

        /* content */
        .cv-content {
          display: block;
          white-space: pre-wrap;
          word-break: break-word;
          line-height: 1.65;
        }
        .cv-content--user {
          color: rgba(244, 244, 245, 0.95);
          font-size: 0.85rem;
          font-weight: 500;
        }
        .cv--compact .cv-content--user { font-size: 0.76rem; }
        .cv-content--assistant {
          color: rgba(240, 240, 244, 0.92);
          font-size: 0.85rem;
        }
        .cv--compact .cv-content--assistant { font-size: 0.76rem; }
        .cv-content--thinking {
          color: rgba(139, 92, 246, 0.5);
          font-size: 0.78rem;
          font-style: italic;
        }
        .cv--compact .cv-content--thinking { font-size: 0.7rem; }
        .cv-content--tool_call {
          font-family: 'JetBrains Mono', monospace;
          color: rgba(52, 211, 153, 0.7);
          font-size: 0.74rem;
        }
        .cv--compact .cv-content--tool_call { font-size: 0.66rem; }
        .cv-content--tool_result {
          font-family: 'JetBrains Mono', monospace;
          color: rgba(255, 255, 255, 0.35);
          font-size: 0.72rem;
          max-height: 180px;
          overflow-y: auto;
        }
        .cv--compact .cv-content--tool_result { font-size: 0.64rem; max-height: 100px; }
        .cv-content--error {
          color: rgba(239, 68, 68, 0.88);
          font-size: 0.8rem;
          font-weight: 500;
        }
        .cv--compact .cv-content--error { font-size: 0.72rem; }

        /* cursor */
        .cv-cursor {
          display: inline-block;
          width: 2px;
          height: 1.15em;
          background: #a855f7;
          margin-left: 2px;
          vertical-align: text-bottom;
          border-radius: 1px;
          animation: cvCursorBounce 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
          box-shadow: 0 0 8px rgba(168, 85, 247, 0.5);
        }

        /* ---- KEYFRAMES ---- */
        @keyframes cvBounceIn {
          0% { opacity: 0; transform: scale(0.3); }
          50% { opacity: 1; }
          100% { transform: scale(1); }
        }
        @keyframes cvPopIn {
          0% { opacity: 0; transform: scale(0.92) translateY(12px); }
          60% { transform: scale(1.02) translateY(-2px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes cvSlideRight {
          0% { opacity: 0; transform: translateX(-20px) scale(0.95); }
          60% { transform: translateX(4px) scale(1.01); }
          100% { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes cvWobble {
          0% { opacity: 0; transform: translateX(0) scale(0.9); }
          15% { transform: translateX(-8px) scale(1); }
          30% { transform: translateX(6px); }
          45% { transform: translateX(-4px); }
          60% { transform: translateX(2px); }
          75% { transform: translateX(-1px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        @keyframes cvFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes cvCursorBounce {
          0%, 100% { opacity: 1; transform: scaleY(1); }
          30% { opacity: 0.4; transform: scaleY(0.6); }
          60% { opacity: 1; transform: scaleY(1.1); }
        }
        @keyframes cvDotBounce {
          0% { transform: scale(0); }
          60% { transform: scale(1.4); }
          100% { transform: scale(1); }
        }
        @keyframes cvPulseRed {
          0%, 100% { box-shadow: 0 0 4px rgba(239, 68, 68, 0.3); }
          50% { box-shadow: 0 0 12px rgba(239, 68, 68, 0.6); }
        }
      `}</style>
      {entries.length === 0 ? (
        <div className="cv-empty">
          <div className="cv-empty-logo">//</div>
          <div className="cv-empty-text">
            {compact
              ? 'Ask Jarvis anything.'
              : 'Ask anything. Jarvis can run commands, edit files, capture your screen, search your knowledge base, and work with Obsidian notes.'
            }
          </div>
          <div className="cv-empty-hint">
            try: &quot;{compact ? 'what\'s on my screen?' : 'summarize my recent notes'}&quot;
          </div>
        </div>
      ) : (
        entries.map((entry, index) => (
          <div
            key={index}
            className={`cv-entry cv-entry--${entry.type}`}
            style={{ animationDelay: `${Math.min(index * 0.05, 0.2)}s` }}
            data-testid="chat-entry"
            data-entry-type={entry.type}
          >
            <div className={`cv-label cv-label--${entry.type}`}>
              <span className={`cv-dot cv-dot--${entry.type}`} />
              {labelMap[entry.type]}
            </div>
            <span className={`cv-content cv-content--${entry.type}`}>
              {entry.content}
              {isLastAssistantStreaming(index) && <span className="cv-cursor" />}
            </span>
          </div>
        ))
      )}
      <div ref={endRef} style={{ height: 1 }} />
    </section>
  )
}
