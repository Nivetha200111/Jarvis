import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AgentEvent, ModelInfo, ObsidianVaultStatus, RagStats } from '@jarvis/core'
import { ChatView, type ChatEntry } from './components/chat-view.js'

type ChatMode = 'fast' | 'agent'

const DISCONNECTED_VAULT_STATUS: ObsidianVaultStatus = {
  connected: false,
  vaultPath: null,
  noteCount: 0
}
const ENDING_INTENT_PATTERN = /\b(end|ending|ends|final|last|conclusion|epilogue|finish)\b/i
const CONTEXT_BUDGET_CHARS = 9_000
const RECENT_NOTE_SCAN_LIMIT = 120
const BROAD_CONTEXT_NOTE_LIMIT = 8
const MATCH_CONTEXT_NOTE_LIMIT = 3

const createContextExcerpt = (
  content: string,
  endingIntent: boolean,
  maxChars = 1800
): string => {
  if (!content) return ''
  if (endingIntent) {
    const tailChars = Math.max(500, Math.floor(maxChars * 0.8))
    const headChars = Math.max(120, Math.floor(maxChars * 0.2))
    const tail = content.slice(Math.max(0, content.length - tailChars))
    const head = content.length > headChars ? content.slice(0, headChars) : ''
    return head ? `${head}\n...\n${tail}` : tail
  }
  return content.slice(0, maxChars)
}

const CSS = `
  /* ---- GLOBAL ANIMATIONS ---- */
  @keyframes appDrop {
    0% { opacity: 0; transform: translateY(-30px) scale(0.95); }
    60% { transform: translateY(6px) scale(1.01); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes popIn {
    0% { opacity: 0; transform: scale(0.5); }
    70% { transform: scale(1.08); }
    100% { opacity: 1; transform: scale(1); }
  }
  @keyframes slideUp {
    0% { opacity: 0; transform: translateY(20px); }
    60% { transform: translateY(-3px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  @keyframes jelly {
    0% { transform: scale(1); }
    30% { transform: scale(1.15, 0.88); }
    50% { transform: scale(0.92, 1.06); }
    70% { transform: scale(1.04, 0.97); }
    100% { transform: scale(1); }
  }
  @keyframes float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-4px); }
  }
  @keyframes pulseGlow {
    0%, 100% { box-shadow: 0 0 0 rgba(168, 85, 247, 0); }
    50% { box-shadow: 0 0 20px rgba(168, 85, 247, 0.15); }
  }
  @keyframes dotPop {
    0% { transform: scale(0); }
    60% { transform: scale(1.6); }
    100% { transform: scale(1); }
  }
  @keyframes wiggle {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(-3deg); }
    75% { transform: rotate(3deg); }
  }
  @keyframes chipBounce {
    0% { opacity: 0; transform: scale(0.3) translateY(10px); }
    60% { transform: scale(1.1) translateY(-2px); }
    100% { opacity: 1; transform: scale(1) translateY(0); }
  }
  @keyframes statusBreathe {
    0%, 100% { opacity: 0.5; transform: scale(0.9); }
    50% { opacity: 1; transform: scale(1.2); }
  }
  @keyframes inputGlow {
    0% { box-shadow: 0 0 0 3px rgba(168, 85, 247, 0); }
    100% { box-shadow: 0 0 0 3px rgba(168, 85, 247, 0.12); }
  }

  .app {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: #0a0a0c;
    overflow: hidden;
    animation: appDrop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }

  /* ---- TITLEBAR ---- */
  .titlebar {
    -webkit-app-region: drag;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 18px;
    height: 46px;
    flex-shrink: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    background: rgba(255, 255, 255, 0.02);
  }
  .titlebar--pip {
    height: 36px;
    padding: 0 12px;
  }
  .titlebar-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    animation: popIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both;
  }
  .titlebar-mark {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 600;
    font-size: 1rem;
    color: #a855f7;
    animation: float 3s ease-in-out infinite;
    text-shadow: 0 0 16px rgba(168, 85, 247, 0.4);
  }
  .titlebar--pip .titlebar-mark { font-size: 0.85rem; }
  .titlebar-name {
    font-weight: 600;
    font-size: 0.88rem;
    color: rgba(228, 228, 231, 0.8);
    letter-spacing: -0.02em;
  }
  .titlebar--pip .titlebar-name { font-size: 0.78rem; }
  .titlebar-right {
    -webkit-app-region: no-drag;
    display: flex;
    align-items: center;
    gap: 8px;
    animation: popIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both;
  }
  .status-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    color: rgba(228, 228, 231, 0.25);
    padding: 4px 10px;
    border-radius: 20px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.04);
  }
  .titlebar--pip .status-pill { padding: 3px 8px; font-size: 0.6rem; }
  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    display: inline-block;
  }
  .status-dot--idle { background: rgba(255, 255, 255, 0.2); }
  .status-dot--active {
    background: #34d399;
    box-shadow: 0 0 8px rgba(52, 211, 153, 0.5);
    animation: dotPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  .status-dot--busy {
    background: #a855f7;
    box-shadow: 0 0 10px rgba(168, 85, 247, 0.5);
    animation: statusBreathe 1.2s ease-in-out infinite;
  }
  .queue-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.62rem;
    color: #a855f7;
    padding: 2px 8px;
    border-radius: 10px;
    background: rgba(168, 85, 247, 0.1);
    animation: popIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }

  /* ---- WINDOW CONTROLS ---- */
  .win-ctrl {
    -webkit-app-region: no-drag;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: rgba(228, 228, 231, 0.25);
    cursor: pointer;
    font-size: 0.72rem;
    font-family: 'JetBrains Mono', monospace;
    transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    flex-shrink: 0;
  }
  .win-ctrl:hover {
    color: rgba(228, 228, 231, 0.7);
    background: rgba(255, 255, 255, 0.06);
    transform: scale(1.1);
  }
  .win-ctrl:active {
    transform: scale(0.88);
    transition-duration: 0.08s;
  }
  .win-ctrl--pip {
    color: rgba(168, 85, 247, 0.5);
  }
  .win-ctrl--pip:hover {
    color: #a855f7;
    background: rgba(168, 85, 247, 0.1);
  }
  .win-ctrl--pip-active {
    color: #a855f7;
    background: rgba(168, 85, 247, 0.12);
    box-shadow: 0 0 8px rgba(168, 85, 247, 0.15);
  }
  .win-ctrl--close:hover {
    color: #ef4444;
    background: rgba(239, 68, 68, 0.12);
  }

  /* ---- TOOLBAR ---- */
  .toolbar {
    -webkit-app-region: no-drag;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    flex-shrink: 0;
    flex-wrap: wrap;
    animation: slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s both;
  }
  .toolbar--pip {
    padding: 6px 10px;
    gap: 4px;
  }
  .tb-group {
    display: inline-flex;
    border-radius: 10px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.07);
  }
  .tb-btn {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.7rem;
    font-weight: 500;
    padding: 6px 12px;
    border: none;
    background: transparent;
    color: rgba(228, 228, 231, 0.3);
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    white-space: nowrap;
    position: relative;
  }
  .toolbar--pip .tb-btn { font-size: 0.64rem; padding: 5px 9px; }
  .tb-btn:hover {
    color: rgba(228, 228, 231, 0.7);
    background: rgba(255, 255, 255, 0.04);
    transform: scale(1.05);
  }
  .tb-btn:active {
    transform: scale(0.93);
    transition-duration: 0.08s;
  }
  .tb-btn:disabled { cursor: not-allowed; opacity: 0.3; }
  .tb-btn--active {
    color: rgba(228, 228, 231, 0.9);
    background: rgba(255, 255, 255, 0.08);
    animation: jelly 0.4s ease;
  }
  .tb-btn--accent { color: rgba(168, 85, 247, 0.6); }
  .tb-btn--accent:hover {
    color: #a855f7;
    background: rgba(168, 85, 247, 0.08);
    transform: scale(1.06);
  }
  .tb-btn--accent:active { transform: scale(0.92); }
  .tb-btn--accent.tb-btn--active {
    color: #a855f7;
    background: rgba(168, 85, 247, 0.12);
    box-shadow: 0 0 12px rgba(168, 85, 247, 0.1);
  }
  .tb-btn--green { color: rgba(52, 211, 153, 0.5); }
  .tb-btn--green:hover {
    color: #34d399;
    background: rgba(52, 211, 153, 0.08);
    transform: scale(1.06);
  }
  .tb-btn--green.tb-btn--active {
    color: #34d399;
    background: rgba(52, 211, 153, 0.1);
    box-shadow: 0 0 12px rgba(52, 211, 153, 0.08);
  }
  .tb-btn--screen {
    color: rgba(251, 191, 36, 0.5);
  }
  .tb-btn--screen:hover {
    color: #fbbf24;
    background: rgba(251, 191, 36, 0.08);
  }
  .tb-select {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.68rem;
    padding: 6px 10px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.02);
    color: rgba(228, 228, 231, 0.5);
    cursor: pointer;
    outline: none;
    appearance: none;
    -webkit-appearance: none;
    transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .toolbar--pip .tb-select { font-size: 0.62rem; padding: 4px 8px; }
  .tb-select:hover {
    border-color: rgba(168, 85, 247, 0.2);
    transform: scale(1.02);
  }
  .tb-select:focus {
    border-color: rgba(168, 85, 247, 0.3);
    box-shadow: 0 0 0 3px rgba(168, 85, 247, 0.08);
  }
  .tb-select option { background: #151518; }
  .tb-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.62rem;
    color: rgba(228, 228, 231, 0.25);
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(255, 255, 255, 0.04);
    animation: popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .tb-badge:hover { transform: scale(1.06); }
  .tb-badge-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    display: inline-block;
    animation: dotPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  .tb-spacer { flex: 1; }

  /* ---- CHAT AREA ---- */
  .chat-area {
    flex: 1;
    overflow: hidden;
    position: relative;
  }
  .chat-area::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 20px;
    background: linear-gradient(to bottom, #0a0a0c, transparent);
    pointer-events: none;
    z-index: 1;
  }
  .chat-area::after {
    content: '';
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 20px;
    background: linear-gradient(to top, #0a0a0c, transparent);
    pointer-events: none;
    z-index: 1;
  }

  /* ---- ATTACHMENTS ---- */
  .attach-bar {
    padding: 8px 16px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    border-top: 1px solid rgba(255, 255, 255, 0.04);
  }
  .attach-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 12px;
    border-radius: 10px;
    background: rgba(168, 85, 247, 0.07);
    border: 1px solid rgba(168, 85, 247, 0.12);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.68rem;
    color: rgba(168, 85, 247, 0.8);
    animation: chipBounce 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
    transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .attach-chip:hover { transform: scale(1.06); }
  .attach-chip-x {
    cursor: pointer;
    color: rgba(228, 228, 231, 0.3);
    font-size: 0.72rem;
    transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 50%;
  }
  .attach-chip-x:hover {
    color: #ef4444;
    background: rgba(239, 68, 68, 0.15);
    transform: scale(1.2) rotate(90deg);
  }

  /* ---- INPUT ---- */
  .input-area {
    padding: 14px 16px 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    background: rgba(255, 255, 255, 0.015);
    display: flex;
    gap: 8px;
    align-items: flex-end;
    flex-shrink: 0;
    animation: slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.25s both;
  }
  .input-area--pip {
    padding: 10px 10px 12px;
    gap: 6px;
  }
  .input-actions {
    display: flex;
    gap: 4px;
  }
  .input-action-btn {
    padding: 9px 10px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.02);
    color: rgba(228, 228, 231, 0.25);
    cursor: pointer;
    font-size: 0.8rem;
    font-family: 'JetBrains Mono', monospace;
    transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    line-height: 1;
  }
  .input-area--pip .input-action-btn { padding: 7px 8px; font-size: 0.72rem; }
  .input-action-btn:hover {
    color: #a855f7;
    background: rgba(168, 85, 247, 0.08);
    border-color: rgba(168, 85, 247, 0.15);
    transform: scale(1.1) rotate(-3deg);
  }
  .input-action-btn:active {
    transform: scale(0.88);
    transition-duration: 0.08s;
  }
  .input-action-btn:disabled { opacity: 0.25; cursor: not-allowed; }
  .input-wrap { flex: 1; }
  .input-field {
    width: 100%;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.03);
    color: rgba(228, 228, 231, 0.9);
    padding: 11px 16px;
    font-family: 'Inter', sans-serif;
    font-size: 0.85rem;
    resize: none;
    outline: none;
    transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
    line-height: 1.5;
  }
  .input-area--pip .input-field { padding: 9px 12px; font-size: 0.8rem; border-radius: 10px; }
  .input-field::placeholder { color: rgba(228, 228, 231, 0.15); }
  .input-field:focus {
    border-color: rgba(168, 85, 247, 0.3);
    box-shadow: 0 0 0 4px rgba(168, 85, 247, 0.08), 0 0 20px rgba(168, 85, 247, 0.05);
    transform: scale(1.005);
  }
  .send-btn {
    padding: 11px 20px;
    border: none;
    border-radius: 12px;
    font-family: 'Inter', sans-serif;
    font-weight: 600;
    font-size: 0.82rem;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    flex-shrink: 0;
  }
  .input-area--pip .send-btn { padding: 9px 14px; font-size: 0.76rem; border-radius: 10px; }
  .send-btn:active {
    transform: scale(0.88) !important;
    transition-duration: 0.08s;
  }
  .send-btn--ready {
    background: linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(139, 92, 246, 0.15));
    color: #a855f7;
    border: 1px solid rgba(168, 85, 247, 0.25);
    animation: pulseGlow 2s ease-in-out infinite;
  }
  .send-btn--ready:hover {
    background: linear-gradient(135deg, rgba(168, 85, 247, 0.3), rgba(139, 92, 246, 0.25));
    transform: scale(1.06);
    box-shadow: 0 0 24px rgba(168, 85, 247, 0.2);
  }
  .send-btn--disabled {
    background: rgba(255, 255, 255, 0.02);
    color: rgba(228, 228, 231, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.04);
    cursor: not-allowed;
  }
  .send-btn--queuing {
    background: rgba(168, 85, 247, 0.08);
    color: rgba(168, 85, 247, 0.5);
    border: 1px solid rgba(168, 85, 247, 0.12);
    animation: wiggle 0.6s ease-in-out infinite;
  }
`

export const App = () => {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [prompt, setPrompt] = useState('')
  const [status, setStatus] = useState('ready')
  const [busy, setBusy] = useState(false)
  const [attachedPaths, setAttachedPaths] = useState<string[]>([])
  const [queuedPrompts, setQueuedPrompts] = useState<string[]>([])
  const [chatMode, setChatMode] = useState<ChatMode>('fast')
  const [useVaultContext, setUseVaultContext] = useState(true)
  const [vaultStatus, setVaultStatus] = useState<ObsidianVaultStatus>(DISCONNECTED_VAULT_STATUS)
  const [ragInfo, setRagInfo] = useState<RagStats | null>(null)
  const [pipMode, setPipMode] = useState(false)
  const statusRef = useRef(status)
  const pendingTokenRef = useRef('')
  const rafRef = useRef<number | null>(null)
  const streamUnsubscribeRef = useRef<(() => void) | null>(null)
  const noteContentCacheRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    window.jarvis.modelList().then((items) => {
      setModels(items)
      setSelectedModel((current) => {
        if (current && items.some((model) => model.id === current)) return current
        const fast = items.find((m) => m.id === 'qwen2.5:3b')
          ?? items.find((m) => m.id === 'qwen2.5:1.5b')
          ?? items.find((m) => m.id.startsWith('qwen2.5'))
        return fast?.id ?? items[0]?.id ?? ''
      })
    })
  }, [])

  useEffect(() => {
    window.jarvis.obsidianStatus().then(setVaultStatus).catch(() => {
      setVaultStatus(DISCONNECTED_VAULT_STATUS)
    })
  }, [])

  useEffect(() => {
    window.jarvis.isPip().then(setPipMode).catch(() => {})
    const unsub = window.jarvis.onPipChanged(setPipMode)
    return unsub
  }, [])

  useEffect(() => { statusRef.current = status }, [status])

  useEffect(() => {
    noteContentCacheRef.current.clear()
  }, [vaultStatus.connected, vaultStatus.vaultPath])

  useEffect(() => {
    if (!vaultStatus.connected) return
    let cancelled = false
    const indexVault = async () => {
      try {
        const notes = await window.jarvis.obsidianListNotes(200)
        for (const note of notes) {
          if (cancelled) break
          try {
            const content = await window.jarvis.obsidianReadNote(note.path)
            if (content.trim()) await window.jarvis.ragIndex(`vault:${note.path}`, content)
          } catch { /* skip */ }
        }
        if (!cancelled) {
          const stats = await window.jarvis.ragStats()
          setRagInfo(stats)
        }
      } catch { /* best-effort */ }
    }
    void indexVault()
    return () => { cancelled = true }
  }, [vaultStatus.connected, vaultStatus.vaultPath])

  useEffect(() => {
    window.jarvis.ragStats().then(setRagInfo).catch(() => {})
  }, [])

  const readVaultNoteCached = useCallback(async (notePath: string): Promise<string> => {
    const cached = noteContentCacheRef.current.get(notePath)
    if (cached !== undefined) return cached
    const content = await window.jarvis.obsidianReadNote(notePath)
    noteContentCacheRef.current.set(notePath, content)
    return content
  }, [])

  const canSend = useMemo(() => prompt.trim().length > 0, [prompt])
  const latestAssistantReply = useMemo(() => {
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i]?.type === 'assistant') return entries[i]!.content
    }
    return ''
  }, [entries])
  const canSaveReply = useMemo(
    () => vaultStatus.connected && latestAssistantReply.trim().length > 0 && !busy,
    [vaultStatus.connected, latestAssistantReply, busy]
  )
  const connectedVaultName = useMemo(() => {
    const p = vaultStatus.vaultPath
    if (!p) return ''
    const seg = p.split(/[\\/]/)
    return seg[seg.length - 1] ?? p
  }, [vaultStatus.vaultPath])

  const buildPromptWithVaultContext = useCallback(async (
    userPrompt: string
  ): Promise<{ content: string; matchCount: number; fallbackUsed: boolean }> => {
    if (!useVaultContext || !vaultStatus.connected) {
      return { content: userPrompt, matchCount: 0, fallbackUsed: false }
    }
    try {
      const endingIntent = ENDING_INTENT_PATTERN.test(userPrompt)
      const matches = await window.jarvis.obsidianSearchNotes(userPrompt, 5)
      if (matches.length === 0) {
        const notes = await window.jarvis.obsidianListNotes(RECENT_NOTE_SCAN_LIMIT)
        if (notes.length === 0) return { content: userPrompt, matchCount: 0, fallbackUsed: false }
        const broadNotes = notes.slice(0, BROAD_CONTEXT_NOTE_LIMIT)
        const broadExcerpts = await Promise.all(
          broadNotes.map(async (note) => ({
            path: note.path,
            excerpt: createContextExcerpt(await readVaultNoteCached(note.path), endingIntent, 500)
          }))
        )
        let usedNotes = 0
        let collected = ''
        for (const entry of broadExcerpts) {
          if (collected.length >= CONTEXT_BUDGET_CHARS) break
          if (!entry.excerpt.trim()) continue
          const block = `[${entry.path}]\n${entry.excerpt}\n\n`
          if (collected.length + block.length > CONTEXT_BUDGET_CHARS) break
          collected += block
          usedNotes += 1
        }
        if (usedNotes === 0) return { content: userPrompt, matchCount: 0, fallbackUsed: false }
        return {
          content: `${userPrompt}\n\n[Obsidian context]\n${collected}`,
          matchCount: usedNotes,
          fallbackUsed: true
        }
      }
      const topMatches = matches.slice(0, MATCH_CONTEXT_NOTE_LIMIT)
      const matchExcerpts = await Promise.all(
        topMatches.map(async (match) => ({
          path: match.path,
          excerpt: createContextExcerpt(await readVaultNoteCached(match.path), endingIntent, 1200)
        }))
      )
      let excerpts = ''
      let usedNotes = 0
      for (const entry of matchExcerpts) {
        if (!entry.excerpt.trim()) continue
        const block = `[${entry.path}]\n${entry.excerpt}\n\n`
        if (excerpts.length + block.length > CONTEXT_BUDGET_CHARS) break
        excerpts += block
        usedNotes += 1
      }
      const snippets = topMatches.map((m) => `- ${m.path}:${m.line} ${m.snippet}`).join('\n')
      return {
        content: `${userPrompt}\n\n[Obsidian context]\n${snippets}${excerpts ? `\n${excerpts}` : ''}`,
        matchCount: Math.max(topMatches.length, usedNotes),
        fallbackUsed: false
      }
    } catch {
      return { content: userPrompt, matchCount: 0, fallbackUsed: false }
    }
  }, [readVaultNoteCached, useVaultContext, vaultStatus.connected])

  const setStatusSafe = useCallback((next: string): void => {
    if (statusRef.current === next) return
    statusRef.current = next
    setStatus(next)
  }, [])

  const flushPendingTokens = useCallback((): void => {
    if (!pendingTokenRef.current) return
    const buf = pendingTokenRef.current
    pendingTokenRef.current = ''
    setEntries((prev) => {
      const last = prev[prev.length - 1]
      if (last && last.type === 'assistant') {
        return [...prev.slice(0, -1), { type: 'assistant', content: `${last.content}${buf}` }]
      }
      return [...prev, { type: 'assistant', content: buf }]
    })
  }, [])

  const scheduleTokenFlush = useCallback((): void => {
    if (rafRef.current !== null) return
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
      for (const p of paths) {
        window.jarvis.ragIndex(`file:${p}`, `[File attached: ${p}]`).catch(() => {})
      }
    }
  }

  const pushErrorEntry = (message: string): void => {
    setEntries((prev) => [...prev, { type: 'error', content: message }])
    setStatusSafe('ready')
  }

  const handleConnectVault = async (): Promise<void> => {
    try {
      const next = await window.jarvis.obsidianConnect()
      setVaultStatus(next)
      if (next.connected) setStatusSafe('vault connected')
    } catch (e: unknown) {
      pushErrorEntry(`Vault: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const handleDisconnectVault = async (): Promise<void> => {
    try {
      const next = await window.jarvis.obsidianDisconnect()
      setVaultStatus(next)
      setStatusSafe('disconnected')
    } catch (e: unknown) {
      pushErrorEntry(`Vault: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const handleSaveLastReply = async (): Promise<void> => {
    if (!canSaveReply) return
    const ts = new Date().toISOString()
    try {
      await window.jarvis.obsidianWriteNote(`Jarvis/${ts.slice(0, 10)}.md`, `## ${ts}\n\n${latestAssistantReply.trim()}\n\n`, 'append')
      setStatusSafe('saved')
      setVaultStatus(await window.jarvis.obsidianStatus())
    } catch (e: unknown) {
      pushErrorEntry(`Save: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const handleAttachFolder = async (): Promise<void> => {
    const paths = await window.jarvis.openFolder()
    if (paths.length > 0) setAttachedPaths((prev) => [...prev, ...paths])
  }

  const removeAttachment = (index: number): void => {
    setAttachedPaths((prev) => prev.filter((_, i) => i !== index))
  }

  const handleTogglePip = async (): Promise<void> => {
    const next = await window.jarvis.togglePip()
    setPipMode(next)
  }

  const handleScreenCapture = async (): Promise<void> => {
    try {
      const capture = await window.jarvis.captureScreen()
      setEntries((prev) => [...prev, {
        type: 'thinking',
        content: `Screen captured: ${capture.width}x${capture.height} at ${capture.timestamp}`
      }])
    } catch (e: unknown) {
      pushErrorEntry(`Capture: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  useEffect(() => () => teardownStream(), [teardownStream])

  const sendMessage = useCallback(async (text: string): Promise<void> => {
    if (!text.trim()) return
    teardownStream()
    setBusy(true)
    setStatusSafe('thinking...')

    let content = text
    let injectedMatches = 0
    let fallbackContextUsed = false

    if (vaultStatus.connected && useVaultContext) {
      setStatusSafe('retrieving context...')
      const enriched = await buildPromptWithVaultContext(text)
      content = enriched.content
      injectedMatches = enriched.matchCount
      fallbackContextUsed = enriched.fallbackUsed
    }

    const forceAgentMode = attachedPaths.length > 0
    if (attachedPaths.length > 0) {
      content = `${content}\n\n[Attached files/folders]\n${attachedPaths.map((p) => `  - ${p}`).join('\n')}`
      setAttachedPaths([])
    }

    setEntries((prev) => {
      const next: ChatEntry[] = [...prev, { type: 'user', content: text }]
      if (injectedMatches > 0) {
        next.push({
          type: 'thinking',
          content: fallbackContextUsed ? 'Loaded broad vault context.' : `Loaded ${injectedMatches} note${injectedMatches > 1 ? 's' : ''}.`
        })
      }
      return next
    })

    const messages = [{ role: 'user' as const, content }]
    const useAgentMode = chatMode === 'agent' || forceAgentMode

    if (!useAgentMode) {
      streamUnsubscribeRef.current = window.jarvis.chatStream(
        { model: selectedModel, messages, stream: true, max_tokens: 256 },
        (event) => {
          switch (event.type) {
            case 'token':
              setStatusSafe('generating...')
              pendingTokenRef.current += event.token ?? ''
              scheduleTokenFlush()
              break
            case 'done':
              flushImmediately(); setStatusSafe('ready'); setBusy(false); teardownStream()
              break
            case 'error':
              flushImmediately()
              setEntries((prev) => [...prev, { type: 'error', content: event.message ?? 'Stream failed' }])
              setStatusSafe('ready'); setBusy(false); teardownStream()
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
          setStatusSafe(`${event.name}...`)
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
            { type: 'tool_result', content: event.output.slice(0, 2000) + (event.output.length > 2000 ? '\n...' : '') }
          ])
          break
        case 'text':
          flushImmediately()
          setEntries((prev) => [...prev, { type: 'assistant', content: event.content }])
          setStatusSafe('ready'); setBusy(false); teardownStream()
          break
        case 'done':
          flushImmediately(); setStatusSafe('ready'); setBusy(false); teardownStream()
          break
        case 'error':
          flushImmediately()
          setEntries((prev) => [...prev, { type: 'error', content: event.message }])
          setStatusSafe('ready'); setBusy(false); teardownStream()
          break
      }
    })
  }, [
    attachedPaths, buildPromptWithVaultContext, chatMode,
    scheduleTokenFlush, selectedModel, setStatusSafe,
    teardownStream, useVaultContext, vaultStatus.connected, flushImmediately
  ])

  const handleSend = (): void => {
    const next = prompt.trim()
    if (!next) return
    setPrompt('')
    if (busy) { setQueuedPrompts((prev) => [...prev, next]); return }
    void sendMessage(next)
  }

  useEffect(() => {
    if (busy || queuedPrompts.length === 0) return
    const [next, ...rest] = queuedPrompts
    if (!next) { setQueuedPrompts(rest); return }
    setQueuedPrompts(rest)
    void sendMessage(next)
  }, [busy, queuedPrompts, sendMessage])

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const statusDotClass = busy ? 'status-dot--busy' : vaultStatus.connected ? 'status-dot--active' : 'status-dot--idle'

  return (
    <>
      <style>{CSS}</style>
      <main className="app">
        {/* Titlebar */}
        <div className={`titlebar${pipMode ? ' titlebar--pip' : ''}`}>
          <div className="titlebar-brand">
            <span className="titlebar-mark">//</span>
            <span className="titlebar-name">Jarvis</span>
          </div>
          <div className="titlebar-right">
            <div className="status-pill">
              <span className={`status-dot ${statusDotClass}`} />
              {status}
            </div>
            {queuedPrompts.length > 0 && (
              <span className="queue-badge">+{queuedPrompts.length} queued</span>
            )}
            <button
              type="button"
              className={`win-ctrl win-ctrl--pip${pipMode ? ' win-ctrl--pip-active' : ''}`}
              onClick={handleTogglePip}
              title={pipMode ? 'Exit PiP' : 'PiP mode'}
            >
              {pipMode ? '[]' : '..'}
            </button>
            <button
              type="button"
              className="win-ctrl"
              onClick={() => window.jarvis.minimize()}
              title="Minimize"
            >
              _
            </button>
            <button
              type="button"
              className="win-ctrl win-ctrl--close"
              onClick={() => window.jarvis.closeWindow()}
              title="Close"
            >
              x
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className={`toolbar${pipMode ? ' toolbar--pip' : ''}`}>
          <div className="tb-group">
            <button
              type="button"
              className={`tb-btn ${chatMode === 'fast' ? 'tb-btn--active' : ''}`}
              onClick={() => setChatMode('fast')}
              disabled={busy}
            >Fast</button>
            <button
              type="button"
              className={`tb-btn ${chatMode === 'agent' ? 'tb-btn--active' : ''}`}
              onClick={() => setChatMode('agent')}
              disabled={busy}
            >Agent</button>
          </div>

          {!pipMode && (
            <button
              type="button"
              className={`tb-btn tb-btn--accent ${vaultStatus.connected ? 'tb-btn--active' : ''}`}
              onClick={vaultStatus.connected ? handleDisconnectVault : handleConnectVault}
              disabled={busy}
            >
              {vaultStatus.connected ? connectedVaultName : 'Vault'}
            </button>
          )}

          {!pipMode && vaultStatus.connected && (
            <button
              type="button"
              className={`tb-btn tb-btn--accent ${useVaultContext ? 'tb-btn--active' : ''}`}
              onClick={() => setUseVaultContext((p) => !p)}
              disabled={busy}
            >
              Context {useVaultContext ? 'On' : 'Off'}
            </button>
          )}

          {!pipMode && canSaveReply && (
            <button type="button" className="tb-btn tb-btn--green" onClick={handleSaveLastReply}>
              Save
            </button>
          )}

          <button
            type="button"
            className="tb-btn tb-btn--screen"
            onClick={handleScreenCapture}
            disabled={busy}
            title="Capture screen"
          >
            {pipMode ? 'S' : 'Screen'}
          </button>

          <div className="tb-spacer" />

          {!pipMode && ragInfo && ragInfo.totalChunks > 0 && (
            <span className="tb-badge">
              <span className="tb-badge-dot" style={{ background: '#34d399', boxShadow: '0 0 6px rgba(52,211,153,0.4)' }} />
              RAG {ragInfo.totalChunks}
            </span>
          )}

          {!pipMode && vaultStatus.connected && (
            <span className="tb-badge">
              <span className="tb-badge-dot" style={{ background: '#a855f7', boxShadow: '0 0 6px rgba(168,85,247,0.4)' }} />
              {vaultStatus.noteCount} notes
            </span>
          )}

          <select
            className="tb-select"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            {models.map((model) => (
              <option key={model.id} value={model.id}>{model.id}</option>
            ))}
          </select>
        </div>

        {/* Chat */}
        <div className="chat-area">
          <ChatView entries={entries} isStreaming={busy} compact={pipMode} />
        </div>

        {/* Attachments */}
        {attachedPaths.length > 0 && (
          <div className="attach-bar">
            {attachedPaths.map((p, i) => (
              <span key={i} className="attach-chip" style={{ animationDelay: `${i * 0.06}s` }}>
                {p.split('/').pop()}
                <span className="attach-chip-x" onClick={() => removeAttachment(i)}>x</span>
              </span>
            ))}
          </div>
        )}

        {/* Input */}
        <div className={`input-area${pipMode ? ' input-area--pip' : ''}`}>
          {!pipMode && (
            <div className="input-actions">
              <button type="button" className="input-action-btn" onClick={handleAttachFiles} disabled={busy} title="Files">+</button>
              <button type="button" className="input-action-btn" onClick={handleAttachFolder} disabled={busy} title="Folder">/</button>
            </div>
          )}
          <div className="input-wrap">
            <textarea
              className="input-field"
              rows={1}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={pipMode ? 'Ask Jarvis...' : vaultStatus.connected ? `Message Jarvis... (${connectedVaultName})` : 'Message Jarvis...'}
            />
          </div>
          <button
            type="button"
            className={`send-btn ${!canSend ? 'send-btn--disabled' : busy ? 'send-btn--queuing' : 'send-btn--ready'}`}
            disabled={!canSend}
            onClick={handleSend}
          >
            {busy ? (pipMode ? 'Q' : 'Queue') : (pipMode ? '>' : 'Send')}
          </button>
        </div>
      </main>
    </>
  )
}
