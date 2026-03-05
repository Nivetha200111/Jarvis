import { contextBridge, ipcRenderer } from 'electron'
import type { ChatCompletionRequest, ModelInfo, AgentEvent } from '@jarvis/core'
import type { ChatSendResponse, StreamEvent, AgentStreamEvent } from '../main/ipc-handlers.js'

export interface PreloadApi {
  chatSend(request: ChatCompletionRequest): Promise<ChatSendResponse>
  chatStream(
    request: ChatCompletionRequest,
    onEvent: (event: StreamEvent) => void
  ): () => void
  agentChat(
    model: string,
    messages: Array<{ role: 'user' | 'assistant' | 'system' | 'tool'; content: string }>,
    onEvent: (event: AgentEvent) => void
  ): () => void
  openFiles(): Promise<string[]>
  openFolder(): Promise<string[]>
  modelList(): Promise<ModelInfo[]>
  healthGet(): Promise<{ status: 'ok'; loadedModel: string | null }>
}

const api: PreloadApi = {
  chatSend: (request) => ipcRenderer.invoke('chat:send', request),
  chatStream: (request, onEvent) => {
    const requestId = `stream-${Date.now()}-${Math.floor(Math.random() * 100000)}`

    const listener = (_event: Electron.IpcRendererEvent, payload: StreamEvent): void => {
      if (payload.requestId !== requestId) {
        return
      }

      onEvent(payload)

      if (payload.type === 'done' || payload.type === 'error') {
        ipcRenderer.removeListener('chat:stream', listener)
      }
    }

    ipcRenderer.on('chat:stream', listener)
    ipcRenderer.send('chat:stream', { requestId, request })

    return () => {
      ipcRenderer.removeListener('chat:stream', listener)
    }
  },
  agentChat: (model, messages, onEvent) => {
    const requestId = `agent-${Date.now()}-${Math.floor(Math.random() * 100000)}`

    const listener = (_event: Electron.IpcRendererEvent, payload: AgentStreamEvent): void => {
      if (payload.requestId !== requestId) {
        return
      }

      onEvent(payload.event)

      if (payload.event.type === 'done' || payload.event.type === 'error') {
        ipcRenderer.removeListener('chat:agent', listener)
      }
    }

    ipcRenderer.on('chat:agent', listener)
    ipcRenderer.send('chat:agent', { requestId, model, messages })

    return () => {
      ipcRenderer.removeListener('chat:agent', listener)
    }
  },
  openFiles: () => ipcRenderer.invoke('dialog:open-files'),
  openFolder: () => ipcRenderer.invoke('dialog:open-folder'),
  modelList: () => ipcRenderer.invoke('model:list'),
  healthGet: () => ipcRenderer.invoke('health:get')
}

contextBridge.exposeInMainWorld('jarvis', api)
