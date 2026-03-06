import { contextBridge, ipcRenderer } from 'electron'
import type {
  AgentEvent,
  ChatCompletionRequest,
  ModelInfo,
  ObsidianVaultStatus,
  ObsidianNoteSummary,
  ObsidianSearchHit,
  ObsidianWriteResult,
  RagResult,
  RagStats
} from '@jarvis/core'
import type { ChatSendResponse, StreamEvent, AgentStreamEvent } from '../main/ipc-handlers.js'

export interface ScreenCapture {
  path: string
  width: number
  height: number
  timestamp: string
}

export interface PreloadApi {
  chatSend(request: ChatCompletionRequest): Promise<ChatSendResponse>
  chatStream(request: ChatCompletionRequest, onEvent: (event: StreamEvent) => void): () => void
  agentChat(model: string, messages: Array<{ role: 'user' | 'assistant' | 'system' | 'tool'; content: string }>, onEvent: (event: AgentEvent) => void): () => void
  openFiles(): Promise<string[]>
  openFolder(): Promise<string[]>
  modelList(): Promise<ModelInfo[]>
  healthGet(): Promise<{ status: 'ok'; loadedModel: string | null }>
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
  // Window controls
  togglePip(): Promise<boolean>
  isPip(): Promise<boolean>
  minimize(): Promise<void>
  closeWindow(): Promise<void>
  onPipChanged(callback: (isPip: boolean) => void): () => void
  // Screen & system
  captureScreen(): Promise<ScreenCapture>
  getActiveWindow(): Promise<string>
  getSystemInfo(): Promise<Record<string, string>>
}

const api: PreloadApi = {
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
  agentChat: (model, messages, onEvent) => {
    const requestId = `agent-${Date.now()}-${Math.floor(Math.random() * 100000)}`
    const listener = (_event: Electron.IpcRendererEvent, payload: AgentStreamEvent): void => {
      if (payload.requestId !== requestId) return
      onEvent(payload.event)
      if (payload.event.type === 'done' || payload.event.type === 'error') {
        ipcRenderer.removeListener('chat:agent', listener)
      }
    }
    ipcRenderer.on('chat:agent', listener)
    ipcRenderer.send('chat:agent', { requestId, model, messages })
    return () => { ipcRenderer.removeListener('chat:agent', listener) }
  },
  openFiles: () => ipcRenderer.invoke('dialog:open-files'),
  openFolder: () => ipcRenderer.invoke('dialog:open-folder'),
  modelList: () => ipcRenderer.invoke('model:list'),
  healthGet: () => ipcRenderer.invoke('health:get'),
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
  getActiveWindow: () => ipcRenderer.invoke('screen:active-window'),
  getSystemInfo: () => ipcRenderer.invoke('system:info')
}

contextBridge.exposeInMainWorld('jarvis', api)
