import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AgentEvent, ModelInfo, ObsidianVaultStatus } from '@jarvis/core'
import { ChatView, type ChatEntry } from './components/chat-view.js'

type ChatMode = 'fast' | 'agent'

const DISCONNECTED_VAULT_STATUS: ObsidianVaultStatus = {
  connected: false,
  vaultPath: null,
  noteCount: 0
}

export const App = () => {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('qwen2.5:latest')
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [prompt, setPrompt] = useState('')
  const [status, setStatus] = useState('ready')
  const [busy, setBusy] = useState(false)
  const [attachedPaths, setAttachedPaths] = useState<string[]>([])
  const [chatMode, setChatMode] = useState<ChatMode>('fast')
  const [useVaultContext, setUseVaultContext] = useState(true)
  const [vaultStatus, setVaultStatus] = useState<ObsidianVaultStatus>(DISCONNECTED_VAULT_STATUS)
  const statusRef = useRef(status)
  const pendingTokenRef = useRef('')
  const rafRef = useRef<number | null>(null)
  const streamUnsubscribeRef = useRef<(() => void) | null>(null)

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

  useEffect(() => {
    window.jarvis.obsidianStatus().then(setVaultStatus).catch(() => {
      setVaultStatus(DISCONNECTED_VAULT_STATUS)
    })
  }, [])

  useEffect(() => {
    statusRef.current = status
  }, [status])

  const canSend = useMemo(() => prompt.trim().length > 0 && !busy, [prompt, busy])
  const latestAssistantReply = useMemo(() => {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const current = entries[index]
      if (current?.type === 'assistant') {
        return current.content
      }
    }
    return ''
  }, [entries])
  const canSaveReply = useMemo(
    () => vaultStatus.connected && latestAssistantReply.trim().length > 0 && !busy,
    [vaultStatus.connected, latestAssistantReply, busy]
  )
  const connectedVaultName = useMemo(() => {
    const path = vaultStatus.vaultPath
    if (!path) {
      return ''
    }

    const segments = path.split(/[\\/]/)
    return segments[segments.length - 1] ?? path
  }, [vaultStatus.vaultPath])

  const buildPromptWithVaultContext = useCallback(async (
    userPrompt: string
  ): Promise<{ content: string; matchCount: number; fallbackUsed: boolean }> => {
    if (!useVaultContext || !vaultStatus.connected) {
      return { content: userPrompt, matchCount: 0, fallbackUsed: false }
    }

    try {
      const matches = await window.jarvis.obsidianSearchNotes(userPrompt, 5)
      if (matches.length === 0) {
        const notes = await window.jarvis.obsidianListNotes(1)
        const fallbackPath = notes[0]?.path
        if (!fallbackPath) {
          return { content: userPrompt, matchCount: 0, fallbackUsed: false }
        }

        const fallbackNote = await window.jarvis.obsidianReadNote(fallbackPath)
        const contextBlock = [
          '[Obsidian context]',
          'No exact lexical note match found, using latest note excerpt.',
          `[Latest note: ${fallbackPath}]`,
          fallbackNote.slice(0, 1800)
        ].join('\n')

        return {
          content: `${userPrompt}\n\n${contextBlock}`,
          matchCount: 1,
          fallbackUsed: true
        }
      }

      const topMatches = matches.slice(0, 3)
      const topPath = topMatches[0]?.path
      let topExcerpt = ''

      if (topPath) {
        const note = await window.jarvis.obsidianReadNote(topPath)
        topExcerpt = note.slice(0, 1800)
      }

      const snippets = topMatches
        .map((match) => `- ${match.path}:${match.line} ${match.snippet}`)
        .join('\n')

      const contextBlock = [
        '[Obsidian context]',
        'Use this only if relevant to the user request.',
        snippets,
        topExcerpt ? `\n[Top note excerpt: ${topPath}]\n${topExcerpt}` : ''
      ].join('\n')

      return {
        content: `${userPrompt}\n\n${contextBlock}`,
        matchCount: topMatches.length,
        fallbackUsed: false
      }
    } catch {
      return { content: userPrompt, matchCount: 0, fallbackUsed: false }
    }
  }, [useVaultContext, vaultStatus.connected])

  const setStatusSafe = useCallback((next: string): void => {
    if (statusRef.current === next) {
      return
    }

    statusRef.current = next
    setStatus(next)
  }, [])

  const flushPendingTokens = useCallback((): void => {
    if (!pendingTokenRef.current) {
      return
    }

    const tokenBuffer = pendingTokenRef.current
    pendingTokenRef.current = ''

    setEntries((prev) => {
      const last = prev[prev.length - 1]
      if (last && last.type === 'assistant') {
        return [
          ...prev.slice(0, -1),
          { type: 'assistant', content: `${last.content}${tokenBuffer}` }
        ]
      }

      return [...prev, { type: 'assistant', content: tokenBuffer }]
    })
  }, [])

  const scheduleTokenFlush = useCallback((): void => {
    if (rafRef.current !== null) {
      return
    }

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      flushPendingTokens()
    })
  }, [flushPendingTokens])

  const flushImmediately = useCallback((): void => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    flushPendingTokens()
  }, [flushPendingTokens])

  const teardownStream = useCallback((): void => {
    if (streamUnsubscribeRef.current) {
      streamUnsubscribeRef.current()
      streamUnsubscribeRef.current = null
    }

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    pendingTokenRef.current = ''
  }, [])

  const handleAttachFiles = async (): Promise<void> => {
    const paths = await window.jarvis.openFiles()
    if (paths.length > 0) {
      setAttachedPaths((prev) => [...prev, ...paths])
    }
  }

  const pushErrorEntry = (message: string): void => {
    setEntries((prev) => [...prev, { type: 'error', content: message }])
    setStatusSafe('ready')
  }

  const handleConnectVault = async (): Promise<void> => {
    try {
      const nextStatus = await window.jarvis.obsidianConnect()
      setVaultStatus(nextStatus)
      if (nextStatus.connected) {
        setStatusSafe(`vault connected (${nextStatus.noteCount} notes)`)
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      pushErrorEntry(`Obsidian connect failed: ${message}`)
    }
  }

  const handleDisconnectVault = async (): Promise<void> => {
    try {
      const nextStatus = await window.jarvis.obsidianDisconnect()
      setVaultStatus(nextStatus)
      setStatusSafe('vault disconnected')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      pushErrorEntry(`Obsidian disconnect failed: ${message}`)
    }
  }

  const handleSaveLastReply = async (): Promise<void> => {
    if (!canSaveReply) {
      return
    }

    const timestamp = new Date().toISOString()
    const dailyNote = `Jarvis/${timestamp.slice(0, 10)}.md`
    const payload = `## ${timestamp}\n\n${latestAssistantReply.trim()}\n\n`

    try {
      const result = await window.jarvis.obsidianWriteNote(dailyNote, payload, 'append')
      setStatusSafe(`saved ${result.path}`)
      const nextStatus = await window.jarvis.obsidianStatus()
      setVaultStatus(nextStatus)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      pushErrorEntry(`Failed to save reply to Obsidian: ${message}`)
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

  useEffect(() => () => teardownStream(), [teardownStream])

  const sendMessage = async (): Promise<void> => {
    if (!canSend) return

    teardownStream()

    const text = prompt.trim()
    setPrompt('')
    setBusy(true)
    setStatusSafe('thinking...')

    let content = text
    let injectedMatches = 0
    let fallbackContextUsed = false

    if (vaultStatus.connected && useVaultContext) {
      setStatusSafe('retrieving vault context...')
      const enriched = await buildPromptWithVaultContext(text)
      content = enriched.content
      injectedMatches = enriched.matchCount
      fallbackContextUsed = enriched.fallbackUsed
    }

    const forceAgentMode = attachedPaths.length > 0
    if (attachedPaths.length > 0) {
      const pathList = attachedPaths.map((p) => `  - ${p}`).join('\n')
      content = `${content}\n\n[Attached files/folders — use read_file or list_directory to access them]\n${pathList}`
      setAttachedPaths([])
    }

    setEntries((prev) => {
      const next: ChatEntry[] = [...prev, { type: 'user', content: text }]
      if (injectedMatches > 0) {
        next.push({
          type: 'thinking',
          content: fallbackContextUsed
            ? 'No direct match found; injected latest vault note excerpt for context.'
            : `Auto-loaded vault context from ${injectedMatches} note${injectedMatches > 1 ? 's' : ''}.`
        })
      }
      return next
    })

    const messages = [{ role: 'user' as const, content }]
    const useAgentMode = chatMode === 'agent' || forceAgentMode

    if (!useAgentMode) {
      streamUnsubscribeRef.current = window.jarvis.chatStream(
        {
          model: selectedModel,
          messages,
          stream: true,
          max_tokens: 256
        },
        (event) => {
          switch (event.type) {
            case 'token':
              setStatusSafe('generating...')
              pendingTokenRef.current += event.token ?? ''
              scheduleTokenFlush()
              break
            case 'done':
              flushImmediately()
              setStatusSafe('ready')
              setBusy(false)
              teardownStream()
              break
            case 'error':
              flushImmediately()
              setEntries((prev) => [...prev, { type: 'error', content: event.message ?? 'Stream failed' }])
              setStatusSafe('ready')
              setBusy(false)
              teardownStream()
              break
          }
        }
      )
      return
    }

    streamUnsubscribeRef.current = window.jarvis.agentChat(selectedModel, messages, (event: AgentEvent) => {
      switch (event.type) {
        case 'stream_token':
          setStatusSafe('generating...')
          pendingTokenRef.current += event.token
          scheduleTokenFlush()
          break
        case 'thinking':
          flushImmediately()
          setStatusSafe('reasoning...')
          setEntries((prev) => [...prev, { type: 'thinking', content: event.content }])
          break
        case 'tool_call':
          flushImmediately()
          setStatusSafe(`calling ${event.name}...`)
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
          flushImmediately()
          setEntries((prev) => [
            ...prev,
            { type: 'tool_result', content: event.output.slice(0, 2000) + (event.output.length > 2000 ? '\n...(truncated)' : '') }
          ])
          break
        case 'text':
          flushImmediately()
          setEntries((prev) => [...prev, { type: 'assistant', content: event.content }])
          setStatusSafe('ready')
          setBusy(false)
          teardownStream()
          break
        case 'done':
          flushImmediately()
          setStatusSafe('ready')
          setBusy(false)
          teardownStream()
          break
        case 'error':
          flushImmediately()
          setEntries((prev) => [...prev, { type: 'error', content: event.message }])
          setStatusSafe('ready')
          setBusy(false)
          teardownStream()
          break
      }
    })
  }

  const handleSend = (): void => {
    void sendMessage()
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
          <div
            style={{
              display: 'inline-flex',
              border: '1px solid #333',
              background: '#111'
            }}
          >
            <button
              type="button"
              onClick={() => setChatMode('fast')}
              disabled={busy}
              style={{
                padding: '6px 9px',
                border: 'none',
                background: chatMode === 'fast' ? '#2a2a2a' : 'transparent',
                color: chatMode === 'fast' ? '#d8d8d8' : '#6b6b6b',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.7rem',
                cursor: busy ? 'not-allowed' : 'pointer'
              }}
            >
              fast
            </button>
            <button
              type="button"
              onClick={() => setChatMode('agent')}
              disabled={busy}
              style={{
                padding: '6px 9px',
                border: 'none',
                background: chatMode === 'agent' ? '#2a2a2a' : 'transparent',
                color: chatMode === 'agent' ? '#d8d8d8' : '#6b6b6b',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.7rem',
                cursor: busy ? 'not-allowed' : 'pointer'
              }}
            >
              agent
            </button>
          </div>
          <button
            type="button"
            onClick={() => setUseVaultContext((prev) => !prev)}
            disabled={busy || !vaultStatus.connected}
            style={{
              padding: '6px 10px',
              border: '1px solid #333',
              background: useVaultContext && vaultStatus.connected ? '#1a1a2a' : '#111',
              color: useVaultContext && vaultStatus.connected ? '#9ca3ff' : '#777',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.7rem',
              cursor: busy || !vaultStatus.connected ? 'not-allowed' : 'pointer'
            }}
            title="Auto-inject relevant Obsidian note context into prompts"
          >
            vault ctx {useVaultContext ? 'on' : 'off'}
          </button>
          <button
            type="button"
            onClick={vaultStatus.connected ? handleDisconnectVault : handleConnectVault}
            disabled={busy}
            style={{
              padding: '6px 10px',
              border: `1px solid ${vaultStatus.connected ? '#3f3f5f' : '#333'}`,
              background: vaultStatus.connected ? '#191930' : '#111',
              color: vaultStatus.connected ? '#9ca3ff' : '#777',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.72rem',
              cursor: busy ? 'not-allowed' : 'pointer'
            }}
          >
            {vaultStatus.connected ? 'vault on' : 'connect vault'}
          </button>
          <button
            type="button"
            onClick={handleSaveLastReply}
            disabled={!canSaveReply}
            style={{
              padding: '6px 10px',
              border: '1px solid #333',
              background: canSaveReply ? '#111' : '#0f0f0f',
              color: canSaveReply ? '#a855f7' : '#555',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.72rem',
              cursor: canSaveReply ? 'pointer' : 'not-allowed'
            }}
          >
            save reply
          </button>
          {vaultStatus.connected && (
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.68rem',
              color: '#6f6fa8'
            }}>
              {connectedVaultName} ({vaultStatus.noteCount})
            </span>
          )}
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
        <ChatView entries={entries} isStreaming={busy} />
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
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={vaultStatus.connected ? 'Ask Jarvis... (Obsidian vault connected)' : 'Ask Jarvis...'}
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
