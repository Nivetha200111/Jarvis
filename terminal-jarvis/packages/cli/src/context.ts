import {
  createChatService,
  createConfigManager,
  createMockEngineAdapter,
  createModelManager,
  createTranscriptStore,
  type ChatService,
  type ConfigManager,
  type ModelManager,
  type TranscriptStore
} from '@jarvis/core'

export interface CliContext {
  chatService: ChatService
  modelManager: ModelManager
  configManager: ConfigManager
  transcriptStore: TranscriptStore
}

export const createCliContext = (): CliContext => {
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
    configManager,
    transcriptStore
  }
}
