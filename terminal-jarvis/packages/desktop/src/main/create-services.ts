import {
  createAgentService,
  createCalendarService,
  createChatService,
  createConfigManager,
  createEmbeddingService,
  createObsidianVaultService,
  createRagService,
  createRuntimeSelection,
  createTranscriptStore,
  createVectorStore,
  type AgentService,
  type CalendarService,
  type ChatService,
  type ConfigManager,
  type EngineProvider,
  type EngineAdapter,
  type ModelManager,
  type ObsidianVaultService,
  type RagService,
  type SystemToolCallbacks
} from '@jarvis/core'

export interface DesktopServices {
  chatService: ChatService
  agentService: AgentService
  calendarService: CalendarService
  modelManager: ModelManager
  engine: EngineAdapter
  provider: EngineProvider
  configManager: ConfigManager
  obsidianVaultService: ObsidianVaultService
  ragService: RagService
}

export const createDesktopServices = (system?: SystemToolCallbacks): DesktopServices => {
  const runtime = createRuntimeSelection()
  const modelManager = runtime.modelManager
  const configManager = createConfigManager({
    defaultModel: runtime.defaultModel
  })
  const obsidianVaultService = createObsidianVaultService({
    initialVaultPath: configManager.get('obsidianVaultPath')
  })
  const transcriptStore = createTranscriptStore()
  const calendarService = createCalendarService()
  const chatService = createChatService({
    engine: runtime.engine,
    modelManager,
    transcriptStore,
    configManager
  })

  const embeddingService = createEmbeddingService()
  const vectorStore = createVectorStore()
  vectorStore.load()
  const ragService = createRagService({ embeddingService, vectorStore })

  const agentService = createAgentService(runtime.engine, modelManager, {
    obsidianVault: obsidianVaultService,
    ragService,
    calendarService,
    system
  })

  // Auto-pull embedding model in the background (non-blocking)
  embeddingService.ensureModel().catch(() => {})

  return {
    chatService,
    agentService,
    calendarService,
    modelManager,
    engine: runtime.engine,
    provider: runtime.provider,
    configManager,
    obsidianVaultService,
    ragService
  }
}
