import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AgentEvent,
  AuditRecord,
  CalendarEventInput,
  CalendarStats,
  ModelInfo,
  ObsidianVaultStatus,
  RagStats,
  ToolPermissionSet
} from '@jarvis/core'
import type {
  OllamaCatalogResponse,
  OllamaModelPullEvent,
  OllamaStatus,
  OnboardingState
} from '../preload/index.js'
import { ChatView, type ChatEntry } from './components/chat-view.js'

type ChatMode = 'fast' | 'agent'

const DISCONNECTED_VAULT_STATUS: ObsidianVaultStatus = {
  connected: false,
  vaultPath: null,
  noteCount: 0
}
const ENDING_INTENT_PATTERN = /\b(end|ending|ends|final|last|conclusion|epilogue|finish)\b/i
const CONTEXT_BUDGET_CHARS = 7_000
const FALLBACK_NOTE_SCAN_LIMIT = 600
const BROAD_CONTEXT_NOTE_LIMIT = 8
const MATCH_CONTEXT_NOTE_LIMIT = 3
const RAG_CONTEXT_CHUNK_LIMIT = 5
const TOKEN_FLUSH_INTERVAL_MS = 40
const STREAM_STALL_TIMEOUT_MS = 90_000
const VAULT_INDEX_NOTE_LIMIT = 2_000
const VAULT_INDEX_IDLE_DELAY_MS = 120
const VAULT_INDEX_TEXT_MAX_CHARS = 36_000
const LIVE_SCREEN_REFRESH_MS = 1_800
const VISION_MODEL_PATTERN = /(llava|vision|moondream|bakllava|qwen2\.5(?:-|:)?vl|llama3\.2-vision)/i
const CALENDAR_CONTEXT_EVENT_LIMIT = 6
const CALENDAR_CONTEXT_HORIZON_DAYS = 14
const SMALL_VAULT_NOTE_LIMIT = 24
const EMBEDDING_MODEL_PATTERN = /\b(embed|embedding|nomic-embed|mxbai|bge|e5|gte|rerank)\b/iu
const EMPTY_ONBOARDING_STATE: OnboardingState = {
  complete: false,
  selectedExtraModels: [],
  completedAt: null
}
const EMPTY_OLLAMA_STATUS: OllamaStatus = {
  installed: false,
  running: false,
  provider: 'mock'
}
const EMPTY_OLLAMA_CATALOG: OllamaCatalogResponse = {
  models: [],
  installedModelIds: [],
  baselineModelIds: [],
  source: 'none'
}

const EMPTY_CALENDAR_STATS: CalendarStats = {
  totalEvents: 0,
  upcomingEvents: 0,
  localEvents: 0,
  googleEvents: 0
}

interface LiveScreenFrame {
  imageBase64: string
  width: number
  height: number
  timestamp: string
  activeWindow: string
}

const formatBytesCompact = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return 'size unknown'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}

const formatCatalogDate = (value: string | null): string => {
  if (!value) {
    return 'date unknown'
  }

  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    return 'date unknown'
  }

  return new Date(parsed).toLocaleDateString()
}

const delay = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const toPromptTerms = (query: string): string[] => {
  const tokens = query.toLowerCase().match(/[a-z0-9_]{3,}/g) ?? []
  return [...new Set(tokens)]
}

const scoreFallbackNotePath = (notePath: string, queryTerms: string[]): number => {
  if (queryTerms.length === 0) {
    return 0
  }

  const lowerPath = notePath.toLowerCase()
  let score = 0

  for (const term of queryTerms) {
    if (lowerPath.includes(term)) {
      score += 3
    }
  }

  return score
}

const scoreFallbackNote = (
  note: { path: string; sizeBytes: number; updatedAt: number },
  queryTerms: string[],
  endingIntent: boolean,
  totalNotes: number
): number => {
  const sizeScore = Math.min(18, Math.log10(Math.max(note.sizeBytes, 1)) * 4)
  const freshnessScore = totalNotes <= SMALL_VAULT_NOTE_LIMIT
    ? 0
    : Math.max(0, 10 - Math.floor((Date.now() - note.updatedAt) / 86_400_000))
  const queryScore = scoreFallbackNotePath(note.path, queryTerms) * 5
  const endingScore = endingIntent ? Math.min(14, Math.floor(note.sizeBytes / 8_000)) : 0

  return queryScore + sizeScore + freshnessScore + endingScore
}

const formatPermissionBadge = (permissions: ToolPermissionSet | null): string => {
  if (!permissions) {
    return 'Perm unknown'
  }

  const disabled = Object.entries(permissions).filter(([, enabled]) => !enabled).length
  return disabled === 0 ? 'Perm full' : `Perm -${disabled}`
}

const scoreModelForUseCase = (
  model: ModelInfo,
  useCase: 'fast' | 'agent' | 'vision'
): number => {
  const id = model.id.toLowerCase()
  const isChat = !EMBEDDING_MODEL_PATTERN.test(id)
  const isVision = VISION_MODEL_PATTERN.test(id)

  if (useCase === 'vision') {
    let score = isVision ? 300 : -500
    if (id.includes('qwen2.5vl') || id.includes('qwen2.5-vl')) score += 80
    if (id.includes('llava')) score += 60
    if (model.sizeBytes > 0) score -= Math.floor(model.sizeBytes / (2 * 1024 ** 3))
    return score
  }

  let score = isChat ? 100 : -500

  if (useCase === 'fast') {
    if (id === 'qwen2.5:1.5b') score += 200
    else if (id === 'qwen2.5:3b') score += 180
    else if (id.startsWith('qwen2.5')) score += 160
    else if (id.includes('phi')) score += 120
  } else {
    if (id === 'qwen2.5:3b') score += 220
    else if (id === 'qwen2.5:1.5b') score += 150
    else if (id.startsWith('qwen2.5')) score += 180
    else if (id.includes('mistral')) score += 110
    else if (id.includes('llama3')) score += 100
  }

  if (isVision) score -= useCase === 'fast' ? 80 : 50
  if (model.sizeBytes > 0) score -= Math.floor(model.sizeBytes / (useCase === 'fast' ? 1024 ** 3 : 2 * 1024 ** 3))

  return score
}

const pickRecommendedRendererModelId = (
  models: ModelInfo[],
  useCase: 'fast' | 'agent' | 'vision'
): string | undefined =>
  [...models]
    .sort((a, b) => scoreModelForUseCase(b, useCase) - scoreModelForUseCase(a, useCase))
    .find((model) => scoreModelForUseCase(model, useCase) > -400)
    ?.id

const toVaultSourceKey = (notePath: string, updatedAt: number): string =>
  `vault:${notePath}@${Math.floor(updatedAt)}`

const toVaultSourcePrefix = (notePath: string): string =>
  `vault:${notePath}@`

const trimRagSourceLabel = (source: string): string =>
  source
    .replace(/^vault:/, '')
    .replace(/@\d+$/u, '')

const toRagExcerpt = (text: string, maxChars = 800): string => {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxChars) {
    return normalized
  }
  return `${normalized.slice(0, maxChars)}...`
}

const toIndexableText = (content: string, maxChars = VAULT_INDEX_TEXT_MAX_CHARS): string => {
  const normalized = content.trim()
  if (normalized.length <= maxChars) {
    return normalized
  }

  const headChars = Math.floor(maxChars * 0.72)
  const tailChars = maxChars - headChars
  return `${normalized.slice(0, headChars)}\n...\n${normalized.slice(-tailChars)}`
}

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

  .onboarding-overlay {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 28px;
    background:
      radial-gradient(circle at top left, rgba(96, 165, 250, 0.14), transparent 32%),
      radial-gradient(circle at top right, rgba(168, 85, 247, 0.18), transparent 28%),
      rgba(5, 5, 8, 0.86);
    backdrop-filter: blur(20px);
  }
  .onboarding-panel {
    width: min(1120px, 100%);
    max-height: calc(100vh - 56px);
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 24px;
    border-radius: 24px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: linear-gradient(180deg, rgba(18, 18, 24, 0.96), rgba(10, 10, 14, 0.98));
    box-shadow: 0 30px 120px rgba(0, 0, 0, 0.45);
    animation: slideUp 0.3s ease-out both;
  }
  .onboarding-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 20px;
  }
  .onboarding-kicker {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: rgba(96, 165, 250, 0.9);
    margin-bottom: 8px;
  }
  .onboarding-header h2 {
    margin: 0;
    font-size: 1.8rem;
    letter-spacing: -0.04em;
    color: #f5f5f5;
  }
  .onboarding-copy {
    margin: 10px 0 0;
    max-width: 640px;
    color: rgba(228, 228, 231, 0.68);
    line-height: 1.55;
  }
  .onboarding-status-grid {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }
  .onboarding-pill,
  .onboarding-baseline-chip,
  .onboarding-model-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 11px;
    border-radius: 999px;
    font-size: 0.74rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.05);
    color: rgba(245, 245, 245, 0.85);
  }
  .onboarding-warning {
    padding: 12px 14px;
    border-radius: 14px;
    border: 1px solid rgba(245, 158, 11, 0.28);
    background: rgba(245, 158, 11, 0.08);
    color: #fcd34d;
    font-size: 0.92rem;
  }
  .onboarding-sections {
    min-height: 0;
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr);
    gap: 18px;
  }
  .onboarding-section {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 18px;
    border-radius: 18px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.03);
  }
  .onboarding-section--models {
    overflow: hidden;
  }
  .onboarding-section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .onboarding-section-head h3 {
    margin: 0;
    font-size: 1rem;
    color: #f4f4f5;
  }
  .onboarding-section-head span {
    color: rgba(228, 228, 231, 0.55);
    font-size: 0.78rem;
  }
  .onboarding-baseline-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-content: flex-start;
  }
  .onboarding-baseline-chip {
    background: rgba(52, 211, 153, 0.12);
    border-color: rgba(52, 211, 153, 0.22);
    color: #bbf7d0;
  }
  .onboarding-toolbar {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .onboarding-search {
    flex: 1;
    min-width: 0;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(0, 0, 0, 0.22);
    color: #f4f4f5;
    border-radius: 14px;
    padding: 12px 14px;
    font-size: 0.94rem;
    outline: none;
  }
  .onboarding-search:focus {
    border-color: rgba(96, 165, 250, 0.4);
    box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.12);
  }
  .onboarding-action,
  .onboarding-secondary,
  .onboarding-primary {
    border: none;
    border-radius: 14px;
    padding: 11px 14px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.16s ease, opacity 0.16s ease, background 0.16s ease;
  }
  .onboarding-action,
  .onboarding-secondary {
    background: rgba(255, 255, 255, 0.08);
    color: #f4f4f5;
  }
  .onboarding-primary {
    background: linear-gradient(135deg, #60a5fa, #a855f7);
    color: white;
  }
  .onboarding-action:hover,
  .onboarding-secondary:hover,
  .onboarding-primary:hover {
    transform: translateY(-1px);
  }
  .onboarding-action:disabled,
  .onboarding-secondary:disabled,
  .onboarding-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
  .onboarding-model-list {
    min-height: 0;
    overflow: auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
    padding-right: 4px;
  }
  .onboarding-model-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.03);
    cursor: pointer;
  }
  .onboarding-model-card--selected {
    border-color: rgba(96, 165, 250, 0.44);
    background: rgba(96, 165, 250, 0.09);
  }
  .onboarding-model-card--installed {
    border-color: rgba(52, 211, 153, 0.28);
    background: rgba(52, 211, 153, 0.08);
  }
  .onboarding-model-top {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  .onboarding-model-top input {
    margin-top: 3px;
  }
  .onboarding-model-main {
    min-width: 0;
    flex: 1;
  }
  .onboarding-model-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .onboarding-model-title {
    min-width: 0;
    font-weight: 600;
    color: #f5f5f5;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .onboarding-model-badge {
    padding: 5px 8px;
    background: rgba(52, 211, 153, 0.12);
    border-color: rgba(52, 211, 153, 0.24);
    color: #bbf7d0;
    white-space: nowrap;
  }
  .onboarding-model-meta,
  .onboarding-model-submeta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
    color: rgba(228, 228, 231, 0.58);
    font-size: 0.78rem;
  }
  .onboarding-model-progress {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.76rem;
    color: #93c5fd;
  }
  .onboarding-empty {
    grid-column: 1 / -1;
    padding: 28px 12px;
    text-align: center;
    color: rgba(228, 228, 231, 0.54);
    border: 1px dashed rgba(255, 255, 255, 0.08);
    border-radius: 16px;
  }
  .onboarding-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
  }
  .onboarding-footer-copy {
    color: rgba(228, 228, 231, 0.66);
    font-size: 0.9rem;
  }
  .onboarding-footer-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  @media (max-width: 960px) {
    .onboarding-overlay {
      padding: 16px;
    }
    .onboarding-panel {
      padding: 18px;
    }
    .onboarding-header,
    .onboarding-footer {
      flex-direction: column;
      align-items: stretch;
    }
    .onboarding-status-grid,
    .onboarding-footer-actions {
      justify-content: flex-start;
    }
    .onboarding-sections {
      grid-template-columns: 1fr;
    }
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
  .tb-btn--live {
    color: rgba(239, 68, 68, 0.55);
  }
  .tb-btn--live:hover {
    color: #ef4444;
    background: rgba(239, 68, 68, 0.1);
  }
  .tb-btn--live.tb-btn--active {
    color: #ef4444;
    background: rgba(239, 68, 68, 0.14);
    box-shadow: 0 0 12px rgba(239, 68, 68, 0.12);
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
  .input-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
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
  .queue-hint {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.64rem;
    color: rgba(168, 85, 247, 0.55);
    padding-left: 4px;
  }
`

export const App = () => {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [modelPinned, setModelPinned] = useState(false)
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [conversation, setConversation] = useState<Array<{ role: 'user' | 'assistant'; content: string; images?: string[] }>>([])
  const [prompt, setPrompt] = useState('')
  const [status, setStatus] = useState('ready')
  const [busy, setBusy] = useState(false)
  const [attachedPaths, setAttachedPaths] = useState<string[]>([])
  const [queuedPrompts, setQueuedPrompts] = useState<string[]>([])
  const [chatMode, setChatMode] = useState<ChatMode>('fast')
  const [useVaultContext, setUseVaultContext] = useState(true)
  const [useCalendarContext, setUseCalendarContext] = useState(true)
  const [calendarStats, setCalendarStats] = useState<CalendarStats>(EMPTY_CALENDAR_STATS)
  const [calendarSyncing, setCalendarSyncing] = useState(false)
  const [vaultStatus, setVaultStatus] = useState<ObsidianVaultStatus>(DISCONNECTED_VAULT_STATUS)
  const [ragInfo, setRagInfo] = useState<RagStats | null>(null)
  const [vaultIndexing, setVaultIndexing] = useState(false)
  const [onboardingState, setOnboardingState] = useState<OnboardingState>(EMPTY_ONBOARDING_STATE)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>(EMPTY_OLLAMA_STATUS)
  const [ollamaCatalog, setOllamaCatalog] = useState<OllamaCatalogResponse>(EMPTY_OLLAMA_CATALOG)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [selectedExtraModels, setSelectedExtraModels] = useState<string[]>([])
  const [modelCatalogQuery, setModelCatalogQuery] = useState('')
  const [installingExtraModels, setInstallingExtraModels] = useState(false)
  const [pullMessages, setPullMessages] = useState<Record<string, string>>({})
  const [liveScreenMode, setLiveScreenMode] = useState(false)
  const [liveScreenFrame, setLiveScreenFrame] = useState<LiveScreenFrame | null>(null)
  const [liveScreenError, setLiveScreenError] = useState<string | null>(null)
  const [pipMode, setPipMode] = useState(false)
  const [toolPermissions, setToolPermissions] = useState<ToolPermissionSet | null>(null)
  const statusRef = useRef(status)
  const busyRef = useRef(busy)
  const pendingTokenRef = useRef('')
  const assistantDraftRef = useRef('')
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const streamWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const vaultIndexRunRef = useRef(0)
  const streamUnsubscribeRef = useRef<(() => void) | null>(null)
  const noteContentCacheRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    window.jarvis.modelList().then((items) => {
      setModels(items)
      setSelectedModel((current) => {
        if (current && items.some((model) => model.id === current)) return current
        return pickRecommendedRendererModelId(items, 'fast') ?? items[0]?.id ?? ''
      })
    })
  }, [])

  useEffect(() => {
    window.jarvis.onboardingStateGet().then((state) => {
      setOnboardingState(state)
      setSelectedExtraModels(state.selectedExtraModels)
      if (!state.complete) {
        setShowOnboarding(true)
      }
    }).catch(() => {})

    window.jarvis.ollamaStatus().then(setOllamaStatus).catch(() => {})
  }, [])

  useEffect(() => {
    window.jarvis.permissionsGet().then(setToolPermissions).catch(() => {
      setToolPermissions(null)
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
  useEffect(() => { busyRef.current = busy }, [busy])

  useEffect(() => {
    if (!liveScreenMode) {
      setLiveScreenFrame(null)
      setLiveScreenError(null)
      return
    }

    let cancelled = false

    const captureFrame = async (): Promise<void> => {
      try {
        const frame = await window.jarvis.captureScreenFrame()
        if (cancelled) {
          return
        }
        setLiveScreenFrame(frame)
        setLiveScreenError(null)
      } catch (error: unknown) {
        if (cancelled) {
          return
        }
        const message = error instanceof Error ? error.message : String(error)
        setLiveScreenError(message)
      }
    }

    void captureFrame()
    const timer = setInterval(() => {
      void captureFrame()
    }, LIVE_SCREEN_REFRESH_MS)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [liveScreenMode])

  useEffect(() => {
    noteContentCacheRef.current.clear()
  }, [vaultStatus.connected, vaultStatus.vaultPath])

  useEffect(() => {
    if (!vaultStatus.connected) {
      setVaultIndexing(false)
      return
    }

    const runId = vaultIndexRunRef.current + 1
    vaultIndexRunRef.current = runId
    let cancelled = false

    const indexVault = async (): Promise<void> => {
      setVaultIndexing(true)
      try {
        const [notes, stats] = await Promise.all([
          window.jarvis.obsidianListNotes(VAULT_INDEX_NOTE_LIMIT),
          window.jarvis.ragStats().catch(() => null)
        ])
        if (cancelled || runId !== vaultIndexRunRef.current) {
          return
        }

        const indexedSources = new Set(stats?.sources ?? [])

        for (const note of notes) {
          if (cancelled || runId !== vaultIndexRunRef.current) {
            return
          }

          while (busyRef.current && !cancelled && runId === vaultIndexRunRef.current) {
            await delay(250)
          }

          if (cancelled || runId !== vaultIndexRunRef.current) {
            return
          }

          const sourceKey = toVaultSourceKey(note.path, note.updatedAt)
          if (indexedSources.has(sourceKey)) {
            continue
          }

          const sourcePrefix = toVaultSourcePrefix(note.path)
          for (const existing of [...indexedSources]) {
            if (!existing.startsWith(sourcePrefix) || existing === sourceKey) {
              continue
            }
            await window.jarvis.ragRemove(existing).catch(() => {})
            indexedSources.delete(existing)
          }

          const cached = noteContentCacheRef.current.get(note.path)
          const content = cached ?? await window.jarvis.obsidianReadNote(note.path)
          if (cached === undefined) {
            noteContentCacheRef.current.set(note.path, content)
          }
          if (!content.trim()) {
            continue
          }

          const indexableText = toIndexableText(content)
          if (!indexableText) {
            continue
          }

          const chunksAdded = await window.jarvis.ragIndex(sourceKey, indexableText).catch(() => 0)
          if (chunksAdded > 0) {
            indexedSources.add(sourceKey)
          }

          await delay(VAULT_INDEX_IDLE_DELAY_MS)
        }

        if (!cancelled && runId === vaultIndexRunRef.current) {
          const nextStats = await window.jarvis.ragStats().catch(() => null)
          if (nextStats) {
            setRagInfo(nextStats)
          }
        }
      } catch {
        // best effort indexing
      } finally {
        if (!cancelled && runId === vaultIndexRunRef.current) {
          setVaultIndexing(false)
        }
      }
    }

    void indexVault()
    return () => {
      cancelled = true
    }
  }, [vaultStatus.connected, vaultStatus.vaultPath])

  useEffect(() => {
    window.jarvis.ragStats().then(setRagInfo).catch(() => {})
  }, [])

  const refreshCalendarStats = useCallback(async (): Promise<void> => {
    try {
      const stats = await window.jarvis.calendarStats()
      setCalendarStats(stats)
    } catch {
      // Calendar is optional; keep prior snapshot.
    }
  }, [])

  useEffect(() => {
    void refreshCalendarStats()
  }, [refreshCalendarStats])

  useEffect(() => {
    if (!showOnboarding) {
      return
    }

    let cancelled = false
    setCatalogLoading(true)

    Promise.all([
      window.jarvis.ollamaStatus().catch(() => EMPTY_OLLAMA_STATUS),
      window.jarvis.ollamaCatalog().catch(() => EMPTY_OLLAMA_CATALOG)
    ]).then(([status, catalog]) => {
      if (cancelled) {
        return
      }
      setOllamaStatus(status)
      setOllamaCatalog(catalog)
      setCatalogLoading(false)
    }).catch(() => {
      if (cancelled) {
        return
      }
      setCatalogLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [showOnboarding])

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
  const selectedModelSupportsVision = useMemo(
    () => VISION_MODEL_PATTERN.test(selectedModel),
    [selectedModel]
  )
  const recommendedVisionModel = useMemo(
    () => models.find((model) => VISION_MODEL_PATTERN.test(model.id))?.id ?? null,
    [models]
  )
  const baselineCatalogModels = useMemo(
    () => {
      const baselineIds = new Set(ollamaCatalog.baselineModelIds)
      return ollamaCatalog.models.filter((model) => baselineIds.has(model.id))
    },
    [ollamaCatalog]
  )
  const optionalCatalogModels = useMemo(() => {
    const normalizedQuery = modelCatalogQuery.trim().toLowerCase()
    const baselineIds = new Set(ollamaCatalog.baselineModelIds)
    return ollamaCatalog.models.filter((model) => {
      if (baselineIds.has(model.id) || model.baseline) {
        return false
      }
      if (!normalizedQuery) {
        return true
      }

      const haystack = `${model.id} ${model.family} ${model.parameterSize} ${model.quantization}`.toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [modelCatalogQuery, ollamaCatalog])
  const pendingOptionalInstallCount = useMemo(
    () => selectedExtraModels.filter((modelId) => !ollamaCatalog.installedModelIds.includes(modelId)).length,
    [ollamaCatalog.installedModelIds, selectedExtraModels]
  )
  const permissionBadge = useMemo(() => formatPermissionBadge(toolPermissions), [toolPermissions])

  useEffect(() => {
    if (modelPinned || models.length === 0) {
      return
    }

    const targetUseCase = liveScreenMode ? 'vision' : chatMode === 'agent' ? 'agent' : 'fast'
    const recommended = pickRecommendedRendererModelId(models, targetUseCase)

    if (recommended && recommended !== selectedModel) {
      setSelectedModel(recommended)
    }
  }, [chatMode, liveScreenMode, modelPinned, models, selectedModel])

  const buildPromptWithVaultContext = useCallback(async (
    userPrompt: string
  ): Promise<{
    content: string
    matchCount: number
    notePaths: string[]
    mode: 'none' | 'keyword' | 'rag' | 'broad'
  }> => {
    if (!useVaultContext || !vaultStatus.connected) {
      return { content: userPrompt, matchCount: 0, notePaths: [], mode: 'none' }
    }
    try {
      const endingIntent = ENDING_INTENT_PATTERN.test(userPrompt)
      const matches = await window.jarvis.obsidianSearchNotes(userPrompt, 5)
      if (matches.length > 0) {
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
        const snippets = topMatches.map((match) => `- ${match.path}:${match.line} ${match.snippet}`).join('\n')
        return {
          content: `${userPrompt}\n\n[Obsidian context]\n${snippets}${excerpts ? `\n${excerpts}` : ''}`,
          matchCount: Math.max(topMatches.length, usedNotes),
          notePaths: topMatches.map((match) => match.path),
          mode: 'keyword'
        }
      }

      const ragResults = await window.jarvis.ragSearch(userPrompt, RAG_CONTEXT_CHUNK_LIMIT).catch(() => [])
      if (ragResults.length > 0) {
        let collected = ''
        let usedChunks = 0
        const sourcePaths: string[] = []
        for (const result of ragResults) {
          const sourcePath = trimRagSourceLabel(result.source)
          const excerpt = toRagExcerpt(result.text)
          if (!excerpt) {
            continue
          }

          const block = `[${sourcePath} | relevance ${result.score.toFixed(2)}]\n${excerpt}\n\n`
          if (collected.length + block.length > CONTEXT_BUDGET_CHARS) {
            break
          }

          collected += block
          usedChunks += 1
          if (!sourcePaths.includes(sourcePath)) {
            sourcePaths.push(sourcePath)
          }
        }

        if (usedChunks > 0) {
          return {
            content: `${userPrompt}\n\n[Obsidian semantic context]\n${collected}`,
            matchCount: usedChunks,
            notePaths: sourcePaths,
            mode: 'rag'
          }
        }
      }

      const notes = await window.jarvis.obsidianListNotes(FALLBACK_NOTE_SCAN_LIMIT)
      if (notes.length === 0) {
        return { content: userPrompt, matchCount: 0, notePaths: [], mode: 'none' }
      }
      const queryTerms = toPromptTerms(userPrompt)
      const broadNotes = [...notes]
        .sort((a, b) => {
          const byFallbackScore = scoreFallbackNote(b, queryTerms, endingIntent, notes.length)
            - scoreFallbackNote(a, queryTerms, endingIntent, notes.length)
          if (byFallbackScore !== 0) {
            return byFallbackScore
          }
          return b.updatedAt - a.updatedAt
        })
        .slice(0, notes.length <= SMALL_VAULT_NOTE_LIMIT ? Math.min(12, notes.length) : BROAD_CONTEXT_NOTE_LIMIT)

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
      if (usedNotes === 0) {
        return { content: userPrompt, matchCount: 0, notePaths: [], mode: 'none' }
      }
      const usedPaths = broadExcerpts
        .filter((entry) => entry.excerpt.trim().length > 0)
        .slice(0, usedNotes)
        .map((entry) => entry.path)
      return {
        content: `${userPrompt}\n\n[Obsidian context]\n${collected}`,
        matchCount: usedNotes,
        notePaths: usedPaths,
        mode: 'broad'
      }
    } catch {
      return { content: userPrompt, matchCount: 0, notePaths: [], mode: 'none' }
    }
  }, [readVaultNoteCached, useVaultContext, vaultStatus.connected])

  const buildPromptWithCalendarContext = useCallback(async (
    userPrompt: string
  ): Promise<{ content: string; eventCount: number }> => {
    if (!useCalendarContext) {
      return { content: userPrompt, eventCount: 0 }
    }

    try {
      const events = await window.jarvis.calendarUpcoming(
        CALENDAR_CONTEXT_EVENT_LIMIT,
        CALENDAR_CONTEXT_HORIZON_DAYS
      )
      if (events.length === 0) {
        return { content: userPrompt, eventCount: 0 }
      }

      const lines = events.map((event) => {
        const sourceLabel = event.source === 'google' ? 'Google' : 'Local'
        const timeLabel = event.allDay
          ? `${new Date(event.startTime).toLocaleDateString()} (all day)`
          : `${new Date(event.startTime).toLocaleString()} - ${new Date(event.endTime).toLocaleTimeString()}`
        return `- ${timeLabel}: ${event.title} [${sourceLabel}]`
      })

      return {
        content: `${userPrompt}\n\n[Schedule context]\n${lines.join('\n')}`,
        eventCount: events.length
      }
    } catch {
      return { content: userPrompt, eventCount: 0 }
    }
  }, [useCalendarContext])

  const setStatusSafe = useCallback((next: string): void => {
    if (statusRef.current === next) return
    statusRef.current = next
    setStatus(next)
  }, [])

  const recordAudit = useCallback(async (
    category: AuditRecord['category'],
    action: string,
    summary: string,
    detail?: Record<string, unknown>
  ): Promise<void> => {
    try {
      await window.jarvis.auditRecord({ category, action, summary, detail })
    } catch {
      // Audit must not block the session.
    }
  }, [])

  const appendConversationTurn = useCallback((
    userMessage: { role: 'user'; content: string; images?: string[] },
    assistantContent: string
  ): void => {
    const trimmedAssistant = assistantContent.trim()
    if (!trimmedAssistant) {
      return
    }

    setConversation((prev) => [
      ...prev,
      userMessage,
      { role: 'assistant', content: trimmedAssistant }
    ])
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
    if (flushTimerRef.current !== null) return
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null
      flushPendingTokens()
    }, TOKEN_FLUSH_INTERVAL_MS)
  }, [flushPendingTokens])

  const flushImmediately = useCallback((): void => {
    if (flushTimerRef.current !== null) {
      clearTimeout(flushTimerRef.current)
      flushTimerRef.current = null
    }
    flushPendingTokens()
  }, [flushPendingTokens])

  const teardownStream = useCallback((): void => {
    if (streamUnsubscribeRef.current) {
      streamUnsubscribeRef.current()
      streamUnsubscribeRef.current = null
    }
    if (flushTimerRef.current !== null) {
      clearTimeout(flushTimerRef.current)
      flushTimerRef.current = null
    }
    if (streamWatchdogRef.current !== null) {
      clearTimeout(streamWatchdogRef.current)
      streamWatchdogRef.current = null
    }
    pendingTokenRef.current = ''
    assistantDraftRef.current = ''
  }, [])

  const finalizeStream = useCallback((nextStatus = 'ready'): void => {
    flushImmediately()
    setStatusSafe(nextStatus)
    setBusy(false)
    teardownStream()
  }, [flushImmediately, setStatusSafe, teardownStream])

  const touchStreamWatchdog = useCallback((): void => {
    if (streamWatchdogRef.current !== null) {
      clearTimeout(streamWatchdogRef.current)
      streamWatchdogRef.current = null
    }

    streamWatchdogRef.current = setTimeout(() => {
      setEntries((prev) => [
        ...prev,
        {
          type: 'error',
          content: 'Stream timed out due to inactivity. Try a faster model or shorter prompt.'
        }
      ])
      finalizeStream('ready')
    }, STREAM_STALL_TIMEOUT_MS)
  }, [finalizeStream])

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
      void recordAudit('write', 'obsidian_save_reply', 'Saved the latest assistant reply into the connected vault.', {
        path: `Jarvis/${ts.slice(0, 10)}.md`
      })
      setStatusSafe('saved')
      setVaultStatus(await window.jarvis.obsidianStatus())
    } catch (e: unknown) {
      pushErrorEntry(`Save: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const handleAddLocalCalendarEvent = async (): Promise<void> => {
    const raw = window.prompt('Add local event: title | start | end(optional)')
    if (!raw) {
      return
    }

    const [title, startRaw, endRaw] = raw
      .split('|')
      .map((segment) => segment.trim())

    if (!title || !startRaw) {
      pushErrorEntry('Calendar: use "title | start | end(optional)".')
      return
    }

    const startTime = Date.parse(startRaw)
    if (Number.isNaN(startTime)) {
      pushErrorEntry('Calendar: start must be a valid date/time.')
      return
    }

    const parsedEndTime = endRaw ? Date.parse(endRaw) : Number.NaN
    if (endRaw && Number.isNaN(parsedEndTime)) {
      pushErrorEntry('Calendar: end must be a valid date/time.')
      return
    }

    const payload: CalendarEventInput = {
      title,
      startTime,
      endTime: Number.isNaN(parsedEndTime) ? undefined : parsedEndTime,
      source: 'local'
    }

    try {
      const created = await window.jarvis.calendarAddEvent(payload)
      void recordAudit('write', 'calendar_add_local', `Added local calendar event "${created.title}".`, {
        id: created.id,
        startTime: created.startTime
      })
      await refreshCalendarStats()
      setEntries((prev) => [
        ...prev,
        {
          type: 'thinking',
          content: `Local event added: ${created.title} at ${new Date(created.startTime).toLocaleString()}.`
        }
      ])
      setStatusSafe('calendar updated')
    } catch (e: unknown) {
      pushErrorEntry(`Calendar: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const handleGoogleCalendarImport = async (): Promise<void> => {
    if (calendarSyncing) {
      return
    }

    setCalendarSyncing(true)
    setStatusSafe('syncing calendar...')
    try {
      const result = await window.jarvis.calendarImportGoogle()
      void recordAudit('system', 'calendar_google_import', `Imported ${result.imported}/${result.total} Google calendar events into local storage.`)
      await refreshCalendarStats()
      const warning = result.warning ? ` ${result.warning}` : ''
      setEntries((prev) => [
        ...prev,
        {
          type: 'thinking',
          content: `Google calendar synced: ${result.imported}/${result.total} events imported.${warning}`
        }
      ])
      setStatusSafe('calendar synced')
    } catch (e: unknown) {
      pushErrorEntry(`Google Calendar: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setCalendarSyncing(false)
    }
  }

  const reloadInstalledModels = async (): Promise<void> => {
    const items = await window.jarvis.modelList()
    setModels(items)
    setSelectedModel((current) => {
      if (current && items.some((model) => model.id === current)) {
        return current
      }
      const useCase = liveScreenMode ? 'vision' : chatMode === 'agent' ? 'agent' : 'fast'
      return pickRecommendedRendererModelId(items, useCase) ?? items[0]?.id ?? ''
    })
  }

  const reloadOnboardingCatalog = async (): Promise<void> => {
    setCatalogLoading(true)
    try {
      const [status, catalog] = await Promise.all([
        window.jarvis.ollamaStatus(),
        window.jarvis.ollamaCatalog()
      ])
      setOllamaStatus(status)
      setOllamaCatalog(catalog)
    } finally {
      setCatalogLoading(false)
    }
  }

  const handleOpenModelHub = async (): Promise<void> => {
    setShowOnboarding(true)
    await reloadOnboardingCatalog().catch(() => {})
  }

  const toggleExtraModelSelection = (modelId: string): void => {
    setSelectedExtraModels((prev) =>
      prev.includes(modelId)
        ? prev.filter((entry) => entry !== modelId)
        : [...prev, modelId]
    )
  }

  const completeOnboarding = async (): Promise<void> => {
    const nextState = await window.jarvis.onboardingStateSet({
      complete: true,
      selectedExtraModels
    })
    setOnboardingState(nextState)
    setShowOnboarding(false)
  }

  const handleInstallSelectedExtraModels = async (): Promise<void> => {
    const targets = selectedExtraModels.filter((modelId) => !ollamaCatalog.installedModelIds.includes(modelId))
    if (targets.length === 0) {
      await completeOnboarding()
      setEntries((prev) => [
        ...prev,
        {
          type: 'thinking',
          content: 'Model setup complete. Baseline and selected extras are ready.'
        }
      ])
      return
    }

    setInstallingExtraModels(true)
    setStatusSafe('pulling models...')
    const failed: string[] = []

    for (const modelId of targets) {
      setPullMessages((prev) => ({
        ...prev,
        [modelId]: `Starting ${modelId}...`
      }))

      try {
        await window.jarvis.ollamaPullModel(modelId, (event: OllamaModelPullEvent) => {
          setPullMessages((prev) => ({
            ...prev,
            [event.modelId]: event.message
          }))
        })
      } catch (error: unknown) {
        failed.push(modelId)
        setPullMessages((prev) => ({
          ...prev,
          [modelId]: error instanceof Error ? error.message : String(error)
        }))
      }
    }

    try {
      await reloadOnboardingCatalog()
      await reloadInstalledModels()
      if (failed.length === 0) {
        setEntries((prev) => [
          ...prev,
          {
            type: 'thinking',
            content: `Extra Ollama models ready: ${targets.join(', ')}.`
          }
        ])
        await completeOnboarding()
      } else {
        pushErrorEntry(`Model setup: failed to pull ${failed.join(', ')}. You can continue with the included baseline or retry.`)
      }
    } finally {
      setInstallingExtraModels(false)
      setStatusSafe('ready')
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

  const handleToggleLiveScreen = (): void => {
    if (liveScreenMode) {
      setLiveScreenMode(false)
      setStatusSafe('live screen off')
      return
    }

    if (!selectedModelSupportsVision) {
      if (recommendedVisionModel) {
        setSelectedModel(recommendedVisionModel)
        setEntries((prev) => [
          ...prev,
          {
            type: 'thinking',
            content: `Live screen: switched model to ${recommendedVisionModel} for vision support.`
          }
        ])
      } else {
        pushErrorEntry('Live screen mode needs a vision model (for example: llava or qwen2.5-vl).')
        return
      }
    }

    setLiveScreenMode(true)
    setStatusSafe('live screen on')
    setEntries((prev) => [
      ...prev,
      {
        type: 'thinking',
        content: 'Live screen enabled. Jarvis will attach the latest screen frame to each prompt.'
      }
    ])
  }

  const handleShowAuditTrail = async (): Promise<void> => {
    try {
      const records = await window.jarvis.auditRecent(8)
      if (records.length === 0) {
        setEntries((prev) => [...prev, { type: 'thinking', content: 'Audit: no recent records yet.' }])
        return
      }

      setEntries((prev) => [
        ...prev,
        ...records.reverse().map((record) => ({
          type: 'thinking' as const,
          content: `Audit ${record.category}: ${record.summary}`
        }))
      ])
      setStatusSafe('audit ready')
    } catch (error: unknown) {
      pushErrorEntry(`Audit: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  useEffect(() => () => teardownStream(), [teardownStream])

  const sendMessage = useCallback(async (text: string): Promise<void> => {
    if (!text.trim()) return
    teardownStream()
    assistantDraftRef.current = ''
    setBusy(true)
    setStatusSafe('thinking...')

    let content = text
    let injectedMatches = 0
    let calendarMatches = 0
    let contextMode: 'none' | 'keyword' | 'rag' | 'broad' = 'none'
    let contextPaths: string[] = []
    let screenFrameAttached = false
    let attachedFrame: LiveScreenFrame | null = null
    let screenFrameDetails = ''
    const forceAgentMode = attachedPaths.length > 0
    const useAgentMode = chatMode === 'agent' || forceAgentMode
    const priorConversation = conversation

    if (vaultStatus.connected && useVaultContext) {
      setStatusSafe('retrieving context...')
      const enriched = await buildPromptWithVaultContext(text)
      content = enriched.content
      injectedMatches = enriched.matchCount
      contextMode = enriched.mode
      contextPaths = enriched.notePaths
    }

    if (useCalendarContext && !useAgentMode) {
      if (!vaultStatus.connected || !useVaultContext) {
        setStatusSafe('retrieving schedule...')
      }
      const enrichedSchedule = await buildPromptWithCalendarContext(content)
      content = enrichedSchedule.content
      calendarMatches = enrichedSchedule.eventCount
    }

    if (liveScreenMode && liveScreenFrame && selectedModelSupportsVision) {
      const activeWindow = liveScreenFrame.activeWindow || 'unknown'
      screenFrameDetails = `window: ${activeWindow} @ ${liveScreenFrame.timestamp}`
      content = `${content}\n\n[Live screen]\nActive window: ${activeWindow}\nCaptured at: ${liveScreenFrame.timestamp}`
      screenFrameAttached = true
      attachedFrame = liveScreenFrame
    }

    if (attachedPaths.length > 0) {
      content = `${content}\n\n[Attached files/folders]\n${attachedPaths.map((p) => `  - ${p}`).join('\n')}`
      setAttachedPaths([])
    }

    setEntries((prev) => {
      const next: ChatEntry[] = [...prev, { type: 'user', content: text }]
      if (injectedMatches > 0) {
        const topSources = contextPaths.slice(0, 3).join(', ')
        const sourceSuffix = topSources ? ` (${topSources})` : ''
        const matchLabel = injectedMatches > 1 ? 'items' : 'item'
        next.push({
          type: 'thinking',
          content: contextMode === 'rag'
            ? `Semantic context ready from ${injectedMatches} ${matchLabel}${sourceSuffix}.`
            : contextMode === 'broad'
              ? `Context ready from broad vault scan (${injectedMatches} ${matchLabel})${sourceSuffix}.`
              : `Context matched ${injectedMatches} note${injectedMatches > 1 ? 's' : ''}${sourceSuffix}.`
        })
      }
      if (calendarMatches > 0) {
        next.push({
          type: 'thinking',
          content: `Schedule context ready from ${calendarMatches} upcoming event${calendarMatches > 1 ? 's' : ''}.`
        })
      }
      if (screenFrameAttached) {
        next.push({
          type: 'thinking',
          content: `Live screen frame attached (${screenFrameDetails}).`
        })
      }
      return next
    })

    if (injectedMatches > 0) {
      const summary = contextMode === 'rag'
        ? `Attached semantic vault context from ${injectedMatches} chunk${injectedMatches === 1 ? '' : 's'}.`
        : `Attached vault context from ${injectedMatches} note${injectedMatches === 1 ? '' : 's'}.`
      void recordAudit('context', 'renderer_vault_context', summary, {
        mode: contextMode,
        notePaths: contextPaths
      })
    }

    if (calendarMatches > 0) {
      void recordAudit('context', 'renderer_calendar_context', `Attached schedule context from ${calendarMatches} upcoming event${calendarMatches === 1 ? '' : 's'}.`, {
        eventCount: calendarMatches
      })
    }

    if (screenFrameAttached) {
      void recordAudit('context', 'renderer_live_screen', `Attached a live screen frame from ${screenFrameDetails}.`)
    }

    const historyUserMessage: { role: 'user'; content: string } = {
      role: 'user',
      content: text
    }
    const requestUserMessage: { role: 'user'; content: string; images?: string[] } = {
      role: 'user',
      content
    }
    if (attachedFrame) {
      requestUserMessage.images = [attachedFrame.imageBase64]
    }
    const messages = [...priorConversation, requestUserMessage]
    let conversationCommitted = false

    if (!useAgentMode) {
      touchStreamWatchdog()
      streamUnsubscribeRef.current = window.jarvis.chatStream(
        { model: selectedModel, messages, stream: true, max_tokens: 192 },
        (event) => {
          touchStreamWatchdog()
          switch (event.type) {
            case 'token':
              setStatusSafe('generating...')
              assistantDraftRef.current += event.token ?? ''
              pendingTokenRef.current += event.token ?? ''
              scheduleTokenFlush()
              break
            case 'done':
              flushImmediately()
              if (!conversationCommitted) {
                appendConversationTurn(historyUserMessage, assistantDraftRef.current)
                conversationCommitted = true
              }
              finalizeStream('ready')
              break
            case 'error':
              flushImmediately()
              setEntries((prev) => [...prev, { type: 'error', content: event.message ?? 'Stream failed' }])
              finalizeStream('ready')
              break
          }
        }
      )
      return
    }

    touchStreamWatchdog()
    streamUnsubscribeRef.current = window.jarvis.agentChat(
      selectedModel,
      messages,
      (event: AgentEvent) => {
        touchStreamWatchdog()
        switch (event.type) {
          case 'audit':
            setEntries((prev) => [...prev, { type: 'thinking', content: `${event.title}: ${event.content}` }])
            break
          case 'stream_token':
            setStatusSafe('generating...')
            assistantDraftRef.current += event.token
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
            assistantDraftRef.current = ''
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
            assistantDraftRef.current = event.content
            setEntries((prev) => [...prev, { type: 'assistant', content: event.content }])
            if (!conversationCommitted) {
              appendConversationTurn(historyUserMessage, event.content)
              conversationCommitted = true
            }
            finalizeStream('ready')
            break
          case 'done':
            flushImmediately()
            if (!conversationCommitted) {
              appendConversationTurn(historyUserMessage, assistantDraftRef.current)
              conversationCommitted = true
            }
            finalizeStream('ready')
            break
          case 'error':
            flushImmediately()
            setEntries((prev) => [...prev, { type: 'error', content: event.message }])
            finalizeStream('ready')
            break
        }
      },
      { includeCalendarContext: useCalendarContext }
    )
  }, [
    appendConversationTurn, attachedPaths, buildPromptWithVaultContext, buildPromptWithCalendarContext, chatMode, conversation,
    scheduleTokenFlush, selectedModel, setStatusSafe,
    teardownStream, useVaultContext, vaultStatus.connected, flushImmediately, finalizeStream, touchStreamWatchdog,
    liveScreenMode, liveScreenFrame, recordAudit, selectedModelSupportsVision, useCalendarContext
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

          {!pipMode && (
            <button
              type="button"
              className={`tb-btn tb-btn--accent ${useCalendarContext ? 'tb-btn--active' : ''}`}
              onClick={() => setUseCalendarContext((current) => !current)}
              disabled={busy}
            >
              Schedule {useCalendarContext ? 'On' : 'Off'}
            </button>
          )}

          {!pipMode && (
            <button
              type="button"
              className="tb-btn"
              onClick={handleAddLocalCalendarEvent}
              disabled={busy || calendarSyncing}
              title="Add a local calendar event"
            >
              + Event
            </button>
          )}

          {!pipMode && (
            <button
              type="button"
              className={`tb-btn tb-btn--green ${calendarSyncing ? 'tb-btn--active' : ''}`}
              onClick={handleGoogleCalendarImport}
              disabled={calendarSyncing}
              title="Import Google Calendar into local schedule"
            >
              {calendarSyncing ? 'Syncing...' : 'Google Sync'}
            </button>
          )}

          {!pipMode && canSaveReply && (
            <button type="button" className="tb-btn tb-btn--green" onClick={handleSaveLastReply}>
              Save
            </button>
          )}

          {!pipMode && (
            <button
              type="button"
              className="tb-btn"
              onClick={() => { void handleShowAuditTrail() }}
              title="Show recent audit records"
            >
              Audit
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

          <button
            type="button"
            className={`tb-btn tb-btn--live ${liveScreenMode ? 'tb-btn--active' : ''}`}
            onClick={handleToggleLiveScreen}
            title="Continuously capture screen frames and attach to prompts"
          >
            {pipMode ? 'L' : liveScreenMode ? 'Live On' : 'Live'}
          </button>

          <div className="tb-spacer" />

          {!pipMode && ragInfo && ragInfo.totalChunks > 0 && (
            <span className="tb-badge">
              <span className="tb-badge-dot" style={{ background: '#34d399', boxShadow: '0 0 6px rgba(52,211,153,0.4)' }} />
              RAG {ragInfo.totalChunks}
            </span>
          )}

          {!pipMode && calendarStats.totalEvents > 0 && (
            <span className="tb-badge">
              <span className="tb-badge-dot" style={{ background: '#60a5fa', boxShadow: '0 0 6px rgba(96,165,250,0.4)' }} />
              Cal {calendarStats.upcomingEvents}
            </span>
          )}

          {!pipMode && toolPermissions && (
            <span className="tb-badge" title={Object.entries(toolPermissions).map(([key, enabled]) => `${key}:${enabled ? 'on' : 'off'}`).join(' | ')}>
              <span className="tb-badge-dot" style={{ background: '#f59e0b', boxShadow: '0 0 6px rgba(245,158,11,0.4)' }} />
              {permissionBadge}
            </span>
          )}

          {!pipMode && liveScreenMode && liveScreenFrame && (
            <span className="tb-badge">
              <span className="tb-badge-dot" style={{ background: '#ef4444', boxShadow: '0 0 6px rgba(239,68,68,0.4)' }} />
              Live {liveScreenFrame.width}x{liveScreenFrame.height}
            </span>
          )}

          {!pipMode && liveScreenMode && liveScreenError && (
            <span className="tb-badge">
              <span className="tb-badge-dot" style={{ background: '#f59e0b', boxShadow: '0 0 6px rgba(245,158,11,0.4)' }} />
              Live degraded
            </span>
          )}

          {!pipMode && (
            <button
              type="button"
              className={`tb-btn ${showOnboarding ? 'tb-btn--active' : ''}`}
              onClick={() => { void handleOpenModelHub() }}
              title="Open model setup"
            >
              Models
            </button>
          )}

          {!pipMode && vaultIndexing && (
            <span className="tb-badge">
              <span className="tb-badge-dot" style={{ background: '#fbbf24', boxShadow: '0 0 6px rgba(251,191,36,0.4)' }} />
              Syncing vault
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
            onChange={(e) => {
              setModelPinned(true)
              setSelectedModel(e.target.value)
            }}
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
            {!pipMode && busy && queuedPrompts.length > 0 && (
              <div className="queue-hint">
                Keep typing while Jarvis responds. {queuedPrompts.length} message{queuedPrompts.length > 1 ? 's' : ''} queued.
              </div>
            )}
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

      {showOnboarding && (
        <div className="onboarding-overlay">
          <div className="onboarding-panel">
            <div className="onboarding-header">
              <div>
                <div className="onboarding-kicker">First run</div>
                <h2>Choose extra Ollama models</h2>
                <p className="onboarding-copy">
                  Jarvis already includes the baseline local stack. Use this page to pull any extra Ollama models before you start.
                </p>
              </div>
              <div className="onboarding-status-grid">
                <span className="onboarding-pill">{ollamaStatus.installed ? 'Ollama installed' : 'Install Ollama first'}</span>
                <span className="onboarding-pill">{ollamaStatus.provider === 'ollama' ? 'Jarvis on Ollama' : 'Jarvis fallback runtime'}</span>
                <span className="onboarding-pill">Catalog: {ollamaCatalog.source}</span>
              </div>
            </div>

            {(ollamaStatus.warning || ollamaCatalog.warning) && (
              <div className="onboarding-warning">
                {ollamaStatus.warning ?? ollamaCatalog.warning}
              </div>
            )}

            <div className="onboarding-sections">
              <section className="onboarding-section">
                <div className="onboarding-section-head">
                  <h3>Included baseline</h3>
                  <span>{baselineCatalogModels.length > 0 ? baselineCatalogModels.length : ollamaCatalog.baselineModelIds.length} models</span>
                </div>
                <div className="onboarding-baseline-list">
                  {(baselineCatalogModels.length > 0
                    ? baselineCatalogModels.map((model) => model.id)
                    : ollamaCatalog.baselineModelIds
                  ).map((modelId) => (
                    <span key={modelId} className="onboarding-baseline-chip">
                      {modelId}
                    </span>
                  ))}
                </div>
              </section>

              <section className="onboarding-section onboarding-section--models">
                <div className="onboarding-section-head">
                  <h3>Optional Ollama catalog</h3>
                  <span>{optionalCatalogModels.length} shown</span>
                </div>

                <div className="onboarding-toolbar">
                  <input
                    className="onboarding-search"
                    type="search"
                    value={modelCatalogQuery}
                    onChange={(event) => setModelCatalogQuery(event.target.value)}
                    placeholder="Search models, families, sizes..."
                  />
                  <button
                    type="button"
                    className="onboarding-action"
                    onClick={() => { void reloadOnboardingCatalog() }}
                    disabled={catalogLoading || installingExtraModels}
                  >
                    {catalogLoading ? 'Refreshing...' : 'Refresh'}
                  </button>
                </div>

                <div className="onboarding-model-list">
                  {optionalCatalogModels.map((model) => {
                    const checked = selectedExtraModels.includes(model.id)
                    const installing = installingExtraModels && checked && !model.installed

                    return (
                      <label
                        key={model.id}
                        className={`onboarding-model-card${checked ? ' onboarding-model-card--selected' : ''}${model.installed ? ' onboarding-model-card--installed' : ''}`}
                      >
                        <div className="onboarding-model-top">
                          <input
                            type="checkbox"
                            checked={checked || model.installed}
                            onChange={() => toggleExtraModelSelection(model.id)}
                            disabled={installingExtraModels || model.installed}
                          />
                          <div className="onboarding-model-main">
                            <div className="onboarding-model-title-row">
                              <span className="onboarding-model-title">{model.id}</span>
                              {model.installed && <span className="onboarding-model-badge">Installed</span>}
                            </div>
                            <div className="onboarding-model-meta">
                              <span>{model.family}</span>
                              <span>{formatBytesCompact(model.sizeBytes)}</span>
                              <span>{formatCatalogDate(model.modifiedAt)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="onboarding-model-submeta">
                          {model.parameterSize || 'parameter size unknown'} · {model.quantization || 'quant unknown'}
                        </div>
                        {pullMessages[model.id] && (
                          <div className="onboarding-model-progress">
                            {pullMessages[model.id]}
                          </div>
                        )}
                        {installing && (
                          <div className="onboarding-model-progress">
                            Pulling...
                          </div>
                        )}
                      </label>
                    )
                  })}

                  {!catalogLoading && optionalCatalogModels.length === 0 && (
                    <div className="onboarding-empty">
                      {modelCatalogQuery.trim()
                        ? 'No models match this search.'
                        : 'No optional models available from the current catalog response.'}
                    </div>
                  )}
                </div>
              </section>
            </div>

            <div className="onboarding-footer">
              <div className="onboarding-footer-copy">
                {pendingOptionalInstallCount > 0
                  ? `${pendingOptionalInstallCount} selected model${pendingOptionalInstallCount > 1 ? 's' : ''} will be pulled before you continue.`
                  : 'You can continue immediately with the included baseline models.'}
              </div>
              <div className="onboarding-footer-actions">
                <button
                  type="button"
                  className="onboarding-secondary"
                  onClick={() => { void completeOnboarding() }}
                  disabled={installingExtraModels}
                >
                  {onboardingState.complete ? 'Close' : 'Continue with baseline'}
                </button>
                <button
                  type="button"
                  className="onboarding-primary"
                  onClick={() => { void handleInstallSelectedExtraModels() }}
                  disabled={
                    installingExtraModels
                    || (!ollamaStatus.installed && pendingOptionalInstallCount > 0)
                    || (!ollamaStatus.running && pendingOptionalInstallCount > 0)
                  }
                >
                  {installingExtraModels
                    ? 'Pulling models...'
                    : pendingOptionalInstallCount > 0
                      ? `Install ${pendingOptionalInstallCount} + continue`
                      : 'Continue'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
