import { contextBridge, ipcRenderer } from 'electron'
import type { ChatCompletionRequest, ModelInfo } from '@jarvis/core'
import type { ChatSendResponse, StreamEvent } from '../main/ipc-handlers.js'

export interface PreloadApi {
  chatSend(request: ChatCompletionRequest): Promise<ChatSendResponse>
  chatStream(
    request: ChatCompletionRequest,
    onEvent: (event: StreamEvent) => void
  ): () => void
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
  modelList: () => ipcRenderer.invoke('model:list'),
  healthGet: () => ipcRenderer.invoke('health:get')
}

contextBridge.exposeInMainWorld('jarvis', api)
