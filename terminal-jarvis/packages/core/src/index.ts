export type {
  ChatMessage,
  GenerationOptions,
  TokenChunk,
  ModelInfo,
  UsageStats,
  ChatCompletionRequest,
  ChatCompletionChunk,
  TranscriptRecord,
  EngineAdapter,
  ToolCall,
  ToolDefinition,
  AgentEvent,
  ChatWithToolsResult,
  StreamToolEvent,
  ToolPermissionSet,
  AuditRecord,
  AuditRecordCategory
} from './types/index.js'

export { createModelManager } from './services/model-manager.js'
export type { ModelManager, CreateModelManagerOptions } from './services/model-manager.js'

export { createConfigManager } from './services/config-manager.js'
export type { ConfigManager, JarvisConfig } from './services/config-manager.js'

export { createTranscriptStore } from './services/transcript-store.js'
export type { TranscriptStore } from './services/transcript-store.js'

export { createAuditTrail } from './services/audit-trail.js'
export type { AuditTrail, AuditRecordInput, CreateAuditTrailOptions } from './services/audit-trail.js'

export { createChatService } from './services/chat-service.js'
export type { ChatService } from './services/chat-service.js'

export { compactChatMessages, derivePromptBudgetChars } from './services/prompt-compactor.js'
export type { PromptCompactionOptions, PromptCompactionResult } from './services/prompt-compactor.js'

export { pickRecommendedModel, pickRecommendedModelId } from './services/model-router.js'
export type { ModelUseCase } from './services/model-router.js'

export { createMockEngineAdapter, MockEngineAdapter } from './engine/mock-engine-adapter.js'
export { createOllamaEngineAdapter, OllamaEngineAdapter } from './engine/ollama-engine-adapter.js'

export { discoverOllamaModels, parseOllamaListOutput } from './services/ollama-model-discovery.js'

export { createAgentService } from './services/agent-service.js'
export type { AgentService, CreateAgentServiceOptions } from './services/agent-service.js'

export { agentTools, createAgentTools, executeTool } from './tools/index.js'
export type { ToolExecutionContext, SystemToolCallbacks } from './tools/index.js'
export { resolveToolPermissions, toToolPermissionSummary } from './tools/index.js'

export { createObsidianVaultService } from './services/obsidian-vault.js'
export type {
  ObsidianVaultService,
  ObsidianVaultStatus,
  ObsidianNoteSummary,
  ObsidianSearchHit,
  ObsidianWriteResult,
  CreateObsidianVaultServiceOptions
} from './services/obsidian-vault.js'

export { createEmbeddingService } from './services/embedding-service.js'
export type { EmbeddingService, CreateEmbeddingServiceOptions } from './services/embedding-service.js'

export { createVectorStore } from './services/vector-store.js'
export type { VectorStore, VectorChunk, SearchResult, CreateVectorStoreOptions } from './services/vector-store.js'

export { createRagService } from './services/rag-service.js'
export type { RagService, RagResult, RagStats, CreateRagServiceOptions } from './services/rag-service.js'

export { createCalendarService } from './services/calendar-service.js'
export type {
  CalendarService,
  CalendarEvent,
  CalendarEventInput,
  CalendarEventSource,
  CalendarListOptions,
  CalendarStats,
  CreateCalendarServiceOptions
} from './services/calendar-service.js'

export { createRuntimeSelection } from './runtime/create-runtime.js'
export type { RuntimeSelection, EngineProvider } from './runtime/create-runtime.js'
