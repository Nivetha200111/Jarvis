import {
  createChatService,
  createConfigManager,
  createMockEngineAdapter,
  createModelManager,
  createTranscriptStore,
  type ChatService,
  type EngineAdapter,
  type ModelManager
} from '@jarvis/core'

export interface DesktopServices {
  chatService: ChatService
  modelManager: ModelManager
  engine: EngineAdapter
}

export const createDesktopServices = (): DesktopServices => {
  const modelManager = createModelManager()
  const configManager = createConfigManager()
  const transcriptStore = createTranscriptStore()
  const engine = createMockEngineAdapter({ modelManager })
  const chatService = createChatService({
    engine,
    modelManager,
    transcriptStore,
    configManager
  })

  return {
    chatService,
    modelManager,
    engine
  }
}
