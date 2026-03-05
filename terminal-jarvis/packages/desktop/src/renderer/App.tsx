import { useEffect, useMemo, useState } from 'react'
import type { ChatMessage, ModelInfo } from '@jarvis/core'
import type { StreamEvent } from '../main/ipc-handlers.js'
import { ChatView } from './components/chat-view.js'

const appendToken = (messages: ChatMessage[], token: string): ChatMessage[] => {
  if (messages.length === 0 || messages[messages.length - 1]?.role !== 'assistant') {
    return [...messages, { role: 'assistant', content: token }]
  }

  return messages.map((message, index) => {
    if (index !== messages.length - 1) {
      return message
    }

    return {
      ...message,
      content: `${message.content}${token}`
    }
  })
}

export const App = () => {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('mock-llama-3-8b-q4_k_m')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [prompt, setPrompt] = useState('')
  const [status, setStatus] = useState('ready')

  useEffect(() => {
    window.jarvis.modelList().then((items) => {
      setModels(items)
      if (items[0]) {
        setSelectedModel(items[0].id)
      }
    })

    window.jarvis.healthGet().then((health) => {
      if (health.loadedModel) {
        setStatus(`loaded: ${health.loadedModel}`)
      }
    })
  }, [])

  const canSend = useMemo(() => prompt.trim().length > 0, [prompt])

  const handleSend = (): void => {
    const userMessage: ChatMessage = { role: 'user', content: prompt.trim() }

    setMessages((current) => [...current, userMessage])
    setPrompt('')
    setStatus('streaming')

    const request = {
      model: selectedModel,
      messages: [userMessage],
      stream: true
    }

    window.jarvis.chatStream(request, (event: StreamEvent) => {
      if (event.type === 'token' && event.token) {
        setMessages((current) => appendToken(current, event.token ?? ''))
        return
      }

      if (event.type === 'done') {
        setStatus('ready')
        return
      }

      if (event.type === 'error') {
        setStatus(`error: ${event.message ?? 'unknown error'}`)
      }
    })
  }

  return (
    <main
      style={{
        margin: 0,
        minHeight: '100vh',
        fontFamily: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
        background: 'linear-gradient(160deg, #0f172a, #111827 40%, #0b1220)',
        color: '#f8fafc',
        padding: '24px'
      }}
    >
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Terminal Jarvis Desktop</h1>
        <p style={{ margin: '8px 0 0', color: '#94a3b8' }}>{status}</p>
      </header>

      <section style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
        <label style={{ display: 'grid', gap: 8 }}>
          <span>Model</span>
          <select
            value={selectedModel}
            onChange={(event) => setSelectedModel(event.target.value)}
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #334155',
              background: '#0f172a',
              color: '#f8fafc'
            }}
          >
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.id}
              </option>
            ))}
          </select>
        </label>
      </section>

      <ChatView messages={messages} />

      <section style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        <textarea
          rows={4}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder='Ask something...'
          style={{
            width: '100%',
            borderRadius: 10,
            border: '1px solid #334155',
            background: '#0f172a',
            color: '#f8fafc',
            padding: 12
          }}
        />
        <button
          type='button'
          disabled={!canSend}
          onClick={handleSend}
          style={{
            width: 160,
            padding: '10px 14px',
            borderRadius: 10,
            border: 'none',
            background: canSend ? '#0369a1' : '#334155',
            color: '#f8fafc',
            cursor: canSend ? 'pointer' : 'not-allowed'
          }}
        >
          Send
        </button>
      </section>
    </main>
  )
}
