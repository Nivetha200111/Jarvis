import type { ChatCompletionRequest, TokenChunk } from '@jarvis/core'
import type { DesktopServices } from './create-services.js'

export interface StreamEvent {
  requestId: string
  type: 'token' | 'done' | 'error'
  token?: string
  index?: number
  message?: string
}

export interface ChatSendResponse {
  model: string
  content: string
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export const sendChat = async (
  services: DesktopServices,
  request: ChatCompletionRequest
): Promise<ChatSendResponse> => services.chatService.generateCompletion(request)

export const streamChat = async (
  services: DesktopServices,
  request: ChatCompletionRequest,
  onEvent: (event: Omit<StreamEvent, 'requestId'>) => void
): Promise<void> => {
  for await (const chunk of services.chatService.streamCompletion(request)) {
    onEvent({
      type: 'token',
      token: chunk.token,
      index: chunk.index
    })

    if (chunk.done) {
      onEvent({
        type: 'done'
      })
    }
  }
}

export const listModels = (services: DesktopServices) => services.modelManager.list()

export const getHealth = (services: DesktopServices): { status: 'ok'; loadedModel: string | null } => ({
  status: 'ok',
  loadedModel: services.engine.getLoadedModel()?.id ?? null
})

export const toStreamPayload = (requestId: string, chunk: Omit<StreamEvent, 'requestId'>): StreamEvent => ({
  requestId,
  ...chunk
})

export const tokenChunkToStreamEvent = (chunk: TokenChunk): Omit<StreamEvent, 'requestId'> => ({
  type: 'token',
  token: chunk.token,
  index: chunk.index
})
