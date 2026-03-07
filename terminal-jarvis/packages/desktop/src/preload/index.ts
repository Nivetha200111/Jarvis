import { contextBridge, ipcRenderer } from 'electron'
import type {
  AgentEvent,
  AuditRecord,
  AuditRecordCategory,
  CalendarEvent,
  CalendarEventInput,
  CalendarStats,
  ChatCompletionRequest,
  ModelInfo,
  ObsidianVaultStatus,
  ObsidianNoteSummary,
  ObsidianSearchHit,
  ObsidianWriteResult,
  RagResult,
  RagStats,
  ToolPermissionSet
} from '@jarvis/core'
import type { ChatSendResponse, StreamEvent, AgentStreamEvent } from '../main/ipc-handlers.js'

export interface ScreenCapture {
  path: string
  width: number
  height: number
  timestamp: string
}

export interface LiveScreenFrame {
  imageBase64: string
  width: number
  height: number
  timestamp: string
  activeWindow: string
}

export interface GoogleCalendarImportResult {
  imported: number
  total: number
  warning?: string
}

export interface OllamaStatus {
  installed: boolean
  running: boolean
  provider: 'mock' | 'ollama'
  warning?: string
}

export interface OllamaCatalogModel {
  id: string
  name: string
  sizeBytes: number
  modifiedAt: string | null
  family: string
  parameterSize: string
  quantization: string
  installed: boolean
  baseline: boolean
}

export interface OllamaCatalogResponse {
  models: OllamaCatalogModel[]
  installedModelIds: string[]
  baselineModelIds: string[]
  source: 'remote' | 'installed' | 'none'
  warning?: string
}

export interface OnboardingState {
  complete: boolean
  selectedExtraModels: string[]
  completedAt: string | null
}

export interface OllamaModelPullEvent {
  requestId: string
  modelId: string
  type: 'progress' | 'done' | 'error'
  message: string
}

export interface PreloadApi {
  onboardingStateGet(): Promise<OnboardingState>
  onboardingStateSet(payload?: { complete?: boolean; selectedExtraModels?: string[] }): Promise<OnboardingState>
  ollamaStatus(): Promise<OllamaStatus>
  ollamaCatalog(): Promise<OllamaCatalogResponse>
  ollamaPullModel(modelId: string, onEvent: (event: OllamaModelPullEvent) => void): Promise<void>
  chatSend(request: ChatCompletionRequest): Promise<ChatSendResponse>
  chatStream(request: ChatCompletionRequest, onEvent: (event: StreamEvent) => void): () => void
  agentChat(
    model: string,
    messages: Array<{ role: 'user' | 'assistant' | 'system' | 'tool'; content: string; images?: string[] }>,
    onEvent: (event: AgentEvent) => void,
    options?: { includeCalendarContext?: boolean }
  ): () => void
  openFiles(): Promise<string[]>
  openFolder(): Promise<string[]>
  modelList(): Promise<ModelInfo[]>
  healthGet(): Promise<{ status: 'ok'; loadedModel: string | null }>
  permissionsGet(): Promise<ToolPermissionSet>
  auditRecent(limit?: number): Promise<AuditRecord[]>
  auditRecord(payload: {
    category: AuditRecordCategory
    action: string
    summary: string
    detail?: Record<string, unknown>
  }): Promise<AuditRecord>
  obsidianConnect(vaultPath?: string): Promise<ObsidianVaultStatus>
  obsidianDisconnect(): Promise<ObsidianVaultStatus>
  obsidianStatus(): Promise<ObsidianVaultStatus>
  obsidianListNotes(limit?: number): Promise<ObsidianNoteSummary[]>
  obsidianSearchNotes(query: string, limit?: number): Promise<ObsidianSearchHit[]>
  obsidianReadNote(path: string): Promise<string>
  obsidianWriteNote(path: string, content: string, mode?: 'overwrite' | 'append'): Promise<ObsidianWriteResult>
  ragIndex(source: string, text: string): Promise<number>
  ragSearch(query: string, limit?: number): Promise<RagResult[]>
  ragStats(): Promise<RagStats>
  ragRemove(source: string): Promise<number>
  calendarList(options?: { fromTime?: number; toTime?: number; limit?: number; source?: 'local' | 'google' }): Promise<CalendarEvent[]>
  calendarUpcoming(limit?: number, horizonDays?: number): Promise<CalendarEvent[]>
  calendarAddEvent(input: CalendarEventInput): Promise<CalendarEvent>
  calendarStats(): Promise<CalendarStats>
  calendarImportGoogle(): Promise<GoogleCalendarImportResult>
  // Window controls
  togglePip(): Promise<boolean>
  isPip(): Promise<boolean>
  minimize(): Promise<void>
  closeWindow(): Promise<void>
  onPipChanged(callback: (isPip: boolean) => void): () => void
  // Screen & system
  captureScreen(): Promise<ScreenCapture>
  captureScreenFrame(): Promise<LiveScreenFrame>
  getActiveWindow(): Promise<string>
  getSystemInfo(): Promise<Record<string, string>>
}

const api: PreloadApi = {
  onboardingStateGet: () => ipcRenderer.invoke('onboarding:get-state'),
  onboardingStateSet: (payload) => ipcRenderer.invoke('onboarding:set-state', payload),
  ollamaStatus: () => ipcRenderer.invoke('ollama:status'),
  ollamaCatalog: () => ipcRenderer.invoke('ollama:catalog'),
  ollamaPullModel: (modelId, onEvent) => new Promise<void>((resolve, reject) => {
    const requestId = `ollama-pull-${Date.now()}-${Math.floor(Math.random() * 100000)}`
    const listener = (_event: Electron.IpcRendererEvent, payload: OllamaModelPullEvent): void => {
      if (payload.requestId !== requestId) return
      onEvent(payload)
      if (payload.type === 'done') {
        ipcRenderer.removeListener('ollama:model-pull', listener)
        resolve()
      } else if (payload.type === 'error') {
        ipcRenderer.removeListener('ollama:model-pull', listener)
        reject(new Error(payload.message))
      }
    }

    ipcRenderer.on('ollama:model-pull', listener)
    ipcRenderer.send('ollama:model-pull', { requestId, modelId })
  }),
  chatSend: (request) => ipcRenderer.invoke('chat:send', request),
  chatStream: (request, onEvent) => {
    const requestId = `stream-${Date.now()}-${Math.floor(Math.random() * 100000)}`
    const listener = (_event: Electron.IpcRendererEvent, payload: StreamEvent): void => {
      if (payload.requestId !== requestId) return
      onEvent(payload)
      if (payload.type === 'done' || payload.type === 'error') {
        ipcRenderer.removeListener('chat:stream', listener)
      }
    }
    ipcRenderer.on('chat:stream', listener)
    ipcRenderer.send('chat:stream', { requestId, request })
    return () => { ipcRenderer.removeListener('chat:stream', listener) }
  },
  agentChat: (model, messages, onEvent, options) => {
    const requestId = `agent-${Date.now()}-${Math.floor(Math.random() * 100000)}`
    const listener = (_event: Electron.IpcRendererEvent, payload: AgentStreamEvent): void => {
      if (payload.requestId !== requestId) return
      onEvent(payload.event)
      if (payload.event.type === 'done' || payload.event.type === 'error') {
        ipcRenderer.removeListener('chat:agent', listener)
      }
    }
    ipcRenderer.on('chat:agent', listener)
    ipcRenderer.send('chat:agent', {
      requestId,
      model,
      messages,
      includeCalendarContext: options?.includeCalendarContext
    })
    return () => { ipcRenderer.removeListener('chat:agent', listener) }
  },
  openFiles: () => ipcRenderer.invoke('dialog:open-files'),
  openFolder: () => ipcRenderer.invoke('dialog:open-folder'),
  modelList: () => ipcRenderer.invoke('model:list'),
  healthGet: () => ipcRenderer.invoke('health:get'),
  permissionsGet: () => ipcRenderer.invoke('permissions:get'),
  auditRecent: (limit) => ipcRenderer.invoke('audit:recent', { limit }),
  auditRecord: (payload) => ipcRenderer.invoke('audit:record', payload),
  obsidianConnect: (vaultPath) => ipcRenderer.invoke('obsidian:connect', { vaultPath }),
  obsidianDisconnect: () => ipcRenderer.invoke('obsidian:disconnect'),
  obsidianStatus: () => ipcRenderer.invoke('obsidian:status'),
  obsidianListNotes: (limit) => ipcRenderer.invoke('obsidian:list', { limit }),
  obsidianSearchNotes: (query, limit) => ipcRenderer.invoke('obsidian:search', { query, limit }),
  obsidianReadNote: (path) => ipcRenderer.invoke('obsidian:read', { path }),
  obsidianWriteNote: (path, content, mode) => ipcRenderer.invoke('obsidian:write', { path, content, mode }),
  ragIndex: (source, text) => ipcRenderer.invoke('rag:index', { source, text }),
  ragSearch: (query, limit) => ipcRenderer.invoke('rag:search', { query, limit }),
  ragStats: () => ipcRenderer.invoke('rag:stats'),
  ragRemove: (source) => ipcRenderer.invoke('rag:remove', { source }),
  calendarList: (options) => ipcRenderer.invoke('calendar:list', options),
  calendarUpcoming: (limit, horizonDays) => ipcRenderer.invoke('calendar:upcoming', { limit, horizonDays }),
  calendarAddEvent: (input) => ipcRenderer.invoke('calendar:add', input),
  calendarStats: () => ipcRenderer.invoke('calendar:stats'),
  calendarImportGoogle: () => ipcRenderer.invoke('calendar:google-import'),
  // Window
  togglePip: () => ipcRenderer.invoke('window:toggle-pip'),
  isPip: () => ipcRenderer.invoke('window:is-pip'),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  onPipChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, value: boolean) => callback(value)
    ipcRenderer.on('pip:changed', listener)
    return () => { ipcRenderer.removeListener('pip:changed', listener) }
  },
  // Screen & system
  captureScreen: () => ipcRenderer.invoke('screen:capture'),
  captureScreenFrame: () => ipcRenderer.invoke('screen:capture-frame'),
  getActiveWindow: () => ipcRenderer.invoke('screen:active-window'),
  getSystemInfo: () => ipcRenderer.invoke('system:info')
}

contextBridge.exposeInMainWorld('jarvis', api)
