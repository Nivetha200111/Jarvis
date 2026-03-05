import {
  createAgentService,
  createChatService,
  createConfigManager,
  createRuntimeSelection,
  createTranscriptStore,
  type AgentService,
  type ChatService,
  type EngineProvider,
  type EngineAdapter,
  type ModelManager
} from '@jarvis/core'

export interface DesktopServices {
  chatService: ChatService
  agentService: AgentService
  modelManager: ModelManager
  engine: EngineAdapter
  provider: EngineProvider
}

export const createDesktopServices = (): DesktopServices => {
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
  const agentService = createAgentService(runtime.engine, modelManager)

  return {
    chatService,
    agentService,
    modelManager,
    engine: runtime.engine,
    provider: runtime.provider
  }
}
