import {
  createAgentService,
  createAuditTrail,
  createCalendarService,
  createChatService,
  createConfigManager,
  createEmbeddingService,
  discoverOllamaModels,
  createObsidianVaultService,
  pickRecommendedModelId,
  createRagService,
  createRuntimeSelection,
  createTranscriptStore,
  createVectorStore,
  type AgentService,
  type AuditTrail,
  type CalendarService,
  type ChatService,
  type ConfigManager,
  type EngineProvider,
  type EngineAdapter,
  type ModelManager,
  type ModelInfo,
  type ObsidianVaultService,
  type RagService,
  type SystemToolCallbacks,
  type ToolPermissionSet
} from '@jarvis/core'

export interface DesktopServices {
  chatService: ChatService
  agentService: AgentService
  auditTrail: AuditTrail
  calendarService: CalendarService
  modelManager: ModelManager
  engine: EngineAdapter
  provider: EngineProvider
  configManager: ConfigManager
  obsidianVaultService: ObsidianVaultService
  ragService: RagService
  toolPermissions: ToolPermissionSet
  refreshModels(): ModelInfo[]
}

const toEnvFlag = (value: string | undefined, fallback = true): boolean => {
  if (value === undefined) {
    return fallback
  }

  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

const resolveToolPermissionsFromEnv = (): ToolPermissionSet => ({
  shell: toEnvFlag(process.env.JARVIS_ENABLE_SHELL_TOOLS, true),
  files: toEnvFlag(process.env.JARVIS_ENABLE_FILE_TOOLS, true),
  system: toEnvFlag(process.env.JARVIS_ENABLE_SYSTEM_TOOLS, true),
  obsidian: toEnvFlag(process.env.JARVIS_ENABLE_OBSIDIAN_TOOLS, true),
  rag: toEnvFlag(process.env.JARVIS_ENABLE_RAG_TOOLS, true),
  calendar: toEnvFlag(process.env.JARVIS_ENABLE_CALENDAR_TOOLS, true)
})

const buildOllamaAliases = (modelIds: string[]): Record<string, string> => {
  const aliases = new Map<string, string>()

  for (const modelId of modelIds) {
    const [baseName] = modelId.split(':')
    if (!baseName || aliases.has(baseName)) {
      continue
    }
    aliases.set(baseName, modelId)
  }

  return Object.fromEntries(aliases.entries())
}

const extendAliasesWithRecommendations = (
  aliases: Record<string, string>,
  models: ModelInfo[]
): Record<string, string> => {
  const recommendedFast = pickRecommendedModelId(models, 'fast')
  const recommendedAgent = pickRecommendedModelId(models, 'agent')
  const recommendedVision = pickRecommendedModelId(models, 'vision')

  return {
    ...aliases,
    ...(recommendedFast ? { fast: recommendedFast } : {}),
    ...(recommendedAgent ? { agent: recommendedAgent } : {}),
    ...(recommendedVision ? { vision: recommendedVision } : {})
  }
}

export const createDesktopServices = (system?: SystemToolCallbacks): DesktopServices => {
  const runtime = createRuntimeSelection()
  const modelManager = runtime.modelManager
  const toolPermissions = resolveToolPermissionsFromEnv()
  const configManager = createConfigManager({
    defaultModel: runtime.defaultModel
  })
  const obsidianVaultService = createObsidianVaultService({
    initialVaultPath: configManager.get('obsidianVaultPath')
  })
  const transcriptStore = createTranscriptStore()
  const auditTrail = createAuditTrail()
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
    system,
    auditTrail,
    toolPermissions
  })

  // Auto-pull embedding model in the background (non-blocking)
  embeddingService.ensureModel().catch(() => {})

  const refreshModels = (): ModelInfo[] => {
    if (runtime.provider !== 'ollama') {
      return modelManager.list()
    }

    try {
      const discovered = discoverOllamaModels()
      const aliases = extendAliasesWithRecommendations(
        buildOllamaAliases(discovered.map((model) => model.id)),
        discovered
      )
      modelManager.sync(discovered, aliases)

      const recommendedFast = pickRecommendedModelId(discovered, 'fast')
      if (recommendedFast) {
        configManager.set('defaultModel', recommendedFast)
      }

      return modelManager.list()
    } catch {
      return modelManager.list()
    }
  }

  return {
    chatService,
    agentService,
    auditTrail,
    calendarService,
    modelManager,
    engine: runtime.engine,
    provider: runtime.provider,
    configManager,
    obsidianVaultService,
    ragService,
    toolPermissions,
    refreshModels
  }
}
