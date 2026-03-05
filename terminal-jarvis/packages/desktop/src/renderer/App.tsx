import { useEffect, useRef, useMemo, useState } from 'react'
import type { ModelInfo, AgentEvent } from '@jarvis/core'
import { ChatView, type ChatEntry } from './components/chat-view.js'

export const App = () => {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('qwen2.5:latest')
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [prompt, setPrompt] = useState('')
  const [status, setStatus] = useState('ready')
  const [busy, setBusy] = useState(false)
  const [attachedPaths, setAttachedPaths] = useState<string[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    window.jarvis.modelList().then((items) => {
      setModels(items)
      const preferred = items.find((m) => m.id.startsWith('qwen2.5'))
      if (preferred) {
        setSelectedModel(preferred.id)
      } else if (items[0]) {
        setSelectedModel(items[0].id)
      }
    })
  }, [])

  const canSend = useMemo(() => prompt.trim().length > 0 && !busy, [prompt, busy])

  const handleAttachFiles = async (): Promise<void> => {
    const paths = await window.jarvis.openFiles()
    if (paths.length > 0) {
      setAttachedPaths((prev) => [...prev, ...paths])
    }
  }

  const handleAttachFolder = async (): Promise<void> => {
    const paths = await window.jarvis.openFolder()
    if (paths.length > 0) {
      setAttachedPaths((prev) => [...prev, ...paths])
    }
  }

  const removeAttachment = (index: number): void => {
    setAttachedPaths((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSend = (): void => {
    if (!canSend) return

    const text = prompt.trim()
    setPrompt('')
    setBusy(true)
    setStatus('thinking...')

    let content = text
    if (attachedPaths.length > 0) {
      const pathList = attachedPaths.map((p) => `  - ${p}`).join('\n')
      content = `${text}\n\n[Attached files/folders — use read_file or list_directory to access them]\n${pathList}`
      setAttachedPaths([])
    }

    setEntries((prev) => [...prev, { type: 'user', content }])

    const messages = [{ role: 'user' as const, content }]

    window.jarvis.agentChat(selectedModel, messages, (event: AgentEvent) => {
      switch (event.type) {
        case 'stream_token':
          setStatus('generating...')
          setEntries((prev) => {
            const last = prev[prev.length - 1]
            if (last && last.type === 'assistant') {
              return [...prev.slice(0, -1), { type: 'assistant', content: last.content + event.token }]
            }
            return [...prev, { type: 'assistant', content: event.token }]
          })
          break
        case 'thinking':
          setStatus('reasoning...')
          setEntries((prev) => [...prev, { type: 'thinking', content: event.content }])
          break
        case 'tool_call':
          setStatus(`calling ${event.name}...`)
          // If there was a streamed assistant entry before tool calls, reclassify it as thinking
          setEntries((prev) => {
            const last = prev[prev.length - 1]
            if (last && last.type === 'assistant') {
              return [
                ...prev.slice(0, -1),
                { type: 'thinking', content: last.content },
                { type: 'tool_call', content: `${event.name}(${JSON.stringify(event.arguments)})` }
              ]
            }
            return [...prev, { type: 'tool_call', content: `${event.name}(${JSON.stringify(event.arguments)})` }]
          })
          break
        case 'tool_result':
          setEntries((prev) => [
            ...prev,
            { type: 'tool_result', content: event.output.slice(0, 2000) + (event.output.length > 2000 ? '\n...(truncated)' : '') }
          ])
          break
        case 'text':
          setEntries((prev) => [...prev, { type: 'assistant', content: event.content }])
          setStatus('ready')
          setBusy(false)
          break
        case 'done':
          setStatus('ready')
          setBusy(false)
          break
        case 'error':
          setEntries((prev) => [...prev, { type: 'error', content: event.message }])
          setStatus('ready')
          setBusy(false)
          break
      }
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <main style={{
      margin: 0,
      minHeight: '100vh',
      fontFamily: "'Space Grotesk', system-ui, sans-serif",
      background: '#0a0a0a',
      color: '#e8e8e8',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <header style={{
        padding: '12px 16px',
        borderBottom: '1px solid #222',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#0d0d0d'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#a855f7', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>//</span>
          <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>jarvis</span>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.7rem',
            color: '#555',
            marginLeft: 4
          }}>agent</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            style={{
              padding: '6px 10px',
              border: '1px solid #333',
              background: '#111',
              color: '#ccc',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.75rem'
            }}
          >
            {models.map((model) => (
              <option key={model.id} value={model.id}>{model.id}</option>
            ))}
          </select>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.7rem',
            color: busy ? '#a855f7' : '#444'
          }}>{status}</span>
        </div>
      </header>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        <ChatView entries={entries} />
      </div>

      {attachedPaths.length > 0 && (
        <div style={{
          padding: '6px 16px',
          background: '#111',
          borderTop: '1px solid #222',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6
        }}>
          {attachedPaths.map((p, i) => (
            <span key={i} style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 8px',
              background: '#1a1a2a',
              border: '1px solid #333',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.7rem',
              color: '#a855f7'
            }}>
              {p.split('/').pop()}
              <span
                onClick={() => removeAttachment(i)}
                style={{ cursor: 'pointer', color: '#666', marginLeft: 2 }}
              >x</span>
            </span>
          ))}
        </div>
      )}

      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid #222',
        background: '#0d0d0d',
        display: 'flex',
        gap: 8,
        alignItems: 'flex-end'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button
            type="button"
            onClick={handleAttachFiles}
            disabled={busy}
            title="Attach files"
            style={{
              padding: '6px 10px',
              border: '1px solid #333',
              background: '#111',
              color: '#888',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.72rem',
              cursor: busy ? 'not-allowed' : 'pointer'
            }}
          >file</button>
          <button
            type="button"
            onClick={handleAttachFolder}
            disabled={busy}
            title="Attach folder"
            style={{
              padding: '6px 10px',
              border: '1px solid #333',
              background: '#111',
              color: '#888',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.72rem',
              cursor: busy ? 'not-allowed' : 'pointer'
            }}
          >folder</button>
        </div>
        <textarea
          ref={textareaRef}
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Jarvis..."
          disabled={busy}
          style={{
            flex: 1,
            border: '1px solid #333',
            background: '#111',
            color: '#e8e8e8',
            padding: '10px 12px',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.85rem',
            resize: 'none',
            outline: 'none'
          }}
        />
        <button
          type="button"
          disabled={!canSend}
          onClick={handleSend}
          style={{
            padding: '10px 20px',
            border: 'none',
            background: canSend ? '#a855f7' : '#222',
            color: canSend ? '#000' : '#555',
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 600,
            fontSize: '0.82rem',
            cursor: canSend ? 'pointer' : 'not-allowed',
            alignSelf: 'flex-end'
          }}
        >
          Run
        </button>
      </div>
    </main>
  )
}
