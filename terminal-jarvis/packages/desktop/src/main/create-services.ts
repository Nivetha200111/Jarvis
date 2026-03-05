import {
  createAgentService,
  createChatService,
  createConfigManager,
  createObsidianVaultService,
  createRuntimeSelection,
  createTranscriptStore,
  type AgentService,
  type ChatService,
  type ConfigManager,
  type EngineProvider,
  type EngineAdapter,
  type ModelManager,
  type ObsidianVaultService
} from '@jarvis/core'

export interface DesktopServices {
  chatService: ChatService
  agentService: AgentService
  modelManager: ModelManager
  engine: EngineAdapter
  provider: EngineProvider
  configManager: ConfigManager
  obsidianVaultService: ObsidianVaultService
}

export const createDesktopServices = (): DesktopServices => {
  const runtime = createRuntimeSelection()
  const modelManager = runtime.modelManager
  const configManager = createConfigManager({
    defaultModel: runtime.defaultModel
  })
  const obsidianVaultService = createObsidianVaultService({
    initialVaultPath: configManager.get('obsidianVaultPath')
  })
  const transcriptStore = createTranscriptStore()
  const chatService = createChatService({
    engine: runtime.engine,
    modelManager,
    transcriptStore,
    configManager
  })
  const agentService = createAgentService(runtime.engine, modelManager, {
    obsidianVault: obsidianVaultService
  })

  return {
    chatService,
    agentService,
    modelManager,
    engine: runtime.engine,
    provider: runtime.provider,
    configManager,
    obsidianVaultService
  }
}
