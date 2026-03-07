import type {
  AgentEvent,
  AuditRecord,
  AuditRecordCategory,
  ChatCompletionRequest,
  TokenChunk,
  ObsidianVaultStatus,
  ObsidianNoteSummary,
  ObsidianSearchHit,
  ObsidianWriteResult,
  CalendarEvent,
  CalendarEventInput,
  CalendarStats,
  RagStats,
  RagResult
} from '@jarvis/core'
import type { DesktopServices } from './create-services.js'

export interface StreamEvent {
  requestId: string
  type: 'token' | 'done' | 'error'
  token?: string
  index?: number
  message?: string
}

export interface AgentStreamEvent {
  requestId: string
  event: AgentEvent
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
  let doneSent = false

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
      doneSent = true
    }
  }

  if (!doneSent) {
    onEvent({
      type: 'done'
    })
  }
}

export const runAgent = async (
  services: DesktopServices,
  payload: {
    model: string
    messages: Array<{ role: 'user' | 'assistant' | 'system' | 'tool'; content: string; images?: string[] }>
    includeCalendarContext?: boolean
  },
  onEvent: (event: AgentEvent) => void
): Promise<void> => {
  for await (const agentEvent of services.agentService.run(payload.model, payload.messages, {
    includeCalendarContext: payload.includeCalendarContext
  })) {
    onEvent(agentEvent)
  }
}

export const listModels = (services: DesktopServices) => services.refreshModels()

export const getHealth = (services: DesktopServices): { status: 'ok'; loadedModel: string | null } => ({
  status: 'ok',
  loadedModel: services.engine.getLoadedModel()?.id ?? null
})

export const getToolPermissions = (services: DesktopServices) => services.toolPermissions

export const listRecentAuditRecords = (services: DesktopServices, limit?: number): AuditRecord[] =>
  services.auditTrail.listRecent(limit)

export const recordAuditEvent = (
  services: DesktopServices,
  payload: {
    category: AuditRecordCategory
    action: string
    summary: string
    detail?: Record<string, unknown>
  }
): AuditRecord => services.auditTrail.record(payload)

export const connectObsidianVault = (
  services: DesktopServices,
  vaultPath: string
): ObsidianVaultStatus => {
  const status = services.obsidianVaultService.connect(vaultPath)
  services.configManager.set('obsidianVaultPath', status.vaultPath)
  return status
}

export const disconnectObsidianVault = (services: DesktopServices): ObsidianVaultStatus => {
  services.obsidianVaultService.disconnect()
  services.configManager.set('obsidianVaultPath', null)
  return services.obsidianVaultService.status()
}

export const getObsidianStatus = (services: DesktopServices): ObsidianVaultStatus =>
  services.obsidianVaultService.status()

export const listObsidianNotes = (
  services: DesktopServices,
  limit?: number
): ObsidianNoteSummary[] => services.obsidianVaultService.listNotes(limit)

export const searchObsidianNotes = (
  services: DesktopServices,
  query: string,
  limit?: number
): ObsidianSearchHit[] => services.obsidianVaultService.searchNotes(query, limit)

export const readObsidianNote = (services: DesktopServices, notePath: string): string =>
  services.obsidianVaultService.readNote(notePath)

export const writeObsidianNote = (
  services: DesktopServices,
  notePath: string,
  content: string,
  mode?: 'overwrite' | 'append'
): ObsidianWriteResult => services.obsidianVaultService.writeNote(notePath, content, mode)

export const ragIndex = async (
  services: DesktopServices,
  source: string,
  text: string
): Promise<number> => services.ragService.index(source, text)

export const ragStats = (services: DesktopServices): RagStats =>
  services.ragService.getStats()

export const ragSearch = async (
  services: DesktopServices,
  query: string,
  limit?: number
): Promise<RagResult[]> => services.ragService.retrieve(query, limit)

export const ragRemoveSource = (services: DesktopServices, source: string): number =>
  services.ragService.removeSource(source)

export const calendarListEvents = (
  services: DesktopServices,
  options?: { fromTime?: number; toTime?: number; limit?: number; source?: 'local' | 'google' }
): CalendarEvent[] => services.calendarService.listEvents(options)

export const calendarUpcomingEvents = (
  services: DesktopServices,
  limit?: number,
  horizonDays?: number
): CalendarEvent[] => services.calendarService.upcomingEvents(limit, horizonDays)

export const calendarAddEvent = (
  services: DesktopServices,
  input: CalendarEventInput
): CalendarEvent => services.calendarService.addEvent(input)

export const calendarStats = (services: DesktopServices): CalendarStats =>
  services.calendarService.getStats()

export const toStreamPayload = (requestId: string, chunk: Omit<StreamEvent, 'requestId'>): StreamEvent => ({
  requestId,
  ...chunk
})

export const toAgentStreamPayload = (requestId: string, event: AgentEvent): AgentStreamEvent => ({
  requestId,
  event
})

export const tokenChunkToStreamEvent = (chunk: TokenChunk): Omit<StreamEvent, 'requestId'> => ({
  type: 'token',
  token: chunk.token,
  index: chunk.index
})
