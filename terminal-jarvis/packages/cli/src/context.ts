import {
  createChatService,
  createConfigManager,
  createRuntimeSelection,
  createTranscriptStore,
  type ChatService,
  type EngineProvider,
  type ConfigManager,
  type ModelManager,
  type TranscriptStore
} from '@jarvis/core'

export interface CliContext {
  chatService: ChatService
  modelManager: ModelManager
  configManager: ConfigManager
  transcriptStore: TranscriptStore
  provider: EngineProvider
}

export const createCliContext = (): CliContext => {
  const runtime = createRuntimeSelection()
  const modelManager = runtime.modelManager
  const configManager = createConfigManager({
    defaultModel: runtime.defaultModel
  })
  const transcriptStore = createTranscriptStore()
  const chatService = createChatService({
    engine: runtime.engine,
    modelManager,
    transcriptStore,
    configManager
  })

  return {
    chatService,
    modelManager,
    configManager,
    transcriptStore,
    provider: runtime.provider
  }
}
