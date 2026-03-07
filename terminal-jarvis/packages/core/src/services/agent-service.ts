import type { EngineAdapter, ChatMessage, AgentEvent, ToolCall } from '../types/index.js'
import type { ToolPermissionSet } from '../types/index.js'
import type { ModelManager } from './model-manager.js'
import type { ObsidianVaultService } from './obsidian-vault.js'
import type { RagService } from './rag-service.js'
import type { CalendarService } from './calendar-service.js'
import type { AuditTrail } from './audit-trail.js'
import { compactChatMessages, derivePromptBudgetChars } from './prompt-compactor.js'
import type { SystemToolCallbacks } from '../tools/index.js'
import { createAgentTools, executeTool, resolveToolPermissions, toToolPermissionSummary } from '../tools/index.js'

const SYSTEM_PROMPT = `You are Jarvis, a powerful agentic AI assistant running fully locally on the user's machine. You have tools to execute shell commands, read/write files, list directories, extract archives, capture screenshots, read clipboard, send notifications, open URLs, and get system information. If Obsidian tools are available, use them for vault tasks. If RAG tools are available, use rag_search to find relevant knowledge. Use tools proactively to help the user. Think step by step, use tools when needed, and give concise answers.`

const MAX_ROUNDS = 15
const VAULT_CONTEXT_NOTE_LIMIT = 3
const VAULT_CONTEXT_CHAR_BUDGET = 4_800
let hasWarnedAboutUnrestrictedTools = false

const trimRagSourceLabel = (source: string): string =>
  source
    .replace(/^vault:/, '')
    .replace(/@\d+$/u, '')

const toVaultExcerpt = (content: string, maxChars = 1200): string => {
  if (!content) {
    return ''
  }

  const normalized = content.replace(/\s+/gu, ' ').trim()
  if (normalized.length <= maxChars) {
    return normalized
  }

  const head = normalized.slice(0, Math.floor(maxChars * 0.65))
  const tail = normalized.slice(-Math.floor(maxChars * 0.35))
  return `${head}\n...\n${tail}`
}

export interface AgentService {
  run(
    modelId: string,
    userMessages: ChatMessage[],
    runOptions?: { includeCalendarContext?: boolean }
  ): AsyncGenerator<AgentEvent>
}

export interface CreateAgentServiceOptions {
  obsidianVault?: ObsidianVaultService
  ragService?: RagService
  calendarService?: CalendarService
  system?: SystemToolCallbacks
  auditTrail?: AuditTrail
  toolPermissions?: Partial<ToolPermissionSet>
}

export const createAgentService = (
  engine: EngineAdapter,
  modelManager: ModelManager,
  options: CreateAgentServiceOptions = {}
): AgentService => {
  if (!hasWarnedAboutUnrestrictedTools && process.env.JARVIS_SUPPRESS_SECURITY_WARNINGS !== '1') {
    console.warn(
      '[security] Agent mode exposes powerful local tools (shell/file/system access). ' +
      'This is intentional for feature parity; use only in trusted local environments.'
    )
    hasWarnedAboutUnrestrictedTools = true
  }

  const run = async function* (
    modelId: string,
    userMessages: ChatMessage[],
    runOptions: { includeCalendarContext?: boolean } = {}
  ): AsyncGenerator<AgentEvent> {
    if (!engine.streamChatWithTools) {
      yield { type: 'error', message: 'Engine does not support tool calling' }
      return
    }

    const resolved = modelManager.resolveModel(modelId)
    if (resolved) {
      await engine.loadModel(resolved.id)
    }

    const lastUserMsg = [...userMessages].reverse().find((message) => message.role === 'user')
    const toolPermissions = resolveToolPermissions(options.toolPermissions)
    const permissionSummary = toToolPermissionSummary(toolPermissions)

    yield { type: 'audit', title: 'Permissions', content: permissionSummary }
    options.auditTrail?.record({
      category: 'permission',
      action: 'agent_permissions',
      summary: permissionSummary,
      detail: { ...toolPermissions }
    })

    // Retrieve direct vault context when available. This improves first-response
    // quality even before background RAG indexing has completed.
    let vaultContext = ''
    if (options.obsidianVault && lastUserMsg) {
      try {
        const hits = options.obsidianVault
          .searchNotes(lastUserMsg.content, VAULT_CONTEXT_NOTE_LIMIT)
          .slice(0, VAULT_CONTEXT_NOTE_LIMIT)

        if (hits.length > 0) {
          const blocks: string[] = []
          let consumed = 0

          for (const hit of hits) {
            const content = options.obsidianVault.readNote(hit.path)
            const excerpt = toVaultExcerpt(content, 1_300)
            if (!excerpt) {
              continue
            }

            const block = `[vault:${hit.path}:${hit.line}]\n${excerpt}`
            if (consumed + block.length > VAULT_CONTEXT_CHAR_BUDGET) {
              break
            }
            blocks.push(block)
            consumed += block.length
          }

          if (blocks.length > 0) {
            vaultContext = `\n\nRelevant vault context:\n---\n${blocks.join('\n---\n')}\n---\nUse this context when answering vault-related questions.`
            const paths = hits.map((hit) => hit.path)
            const summary = `Vault context attached from ${paths.length} note${paths.length === 1 ? '' : 's'}: ${paths.join(', ')}.`
            yield { type: 'audit', title: 'Vault Context', content: summary }
            options.auditTrail?.record({
              category: 'context',
              action: 'vault_context',
              summary,
              detail: { paths }
            })
          }
        }
      } catch {
        // Obsidian context unavailable — continue without blocking response generation.
      }
    }

    // Retrieve RAG context if available
    let ragContext = ''
    if (options.ragService && lastUserMsg) {
      try {
        const results = await options.ragService.retrieve(lastUserMsg.content, 5)
        if (results.length > 0) {
          const contextChunks = results.map((result) =>
            `[source: ${trimRagSourceLabel(result.source)} | relevance: ${result.score.toFixed(2)}]\n${result.text}`
          )
          ragContext = `\n\nRelevant knowledge from indexed documents:\n---\n${contextChunks.join('\n---\n')}\n---\nUse this context to inform your response when relevant.`
          const sources = [...new Set(results.map((result) => trimRagSourceLabel(result.source)))]
          const summary = `Semantic retrieval attached ${results.length} chunk${results.length === 1 ? '' : 's'} from ${sources.join(', ')}.`
          yield { type: 'audit', title: 'Semantic Context', content: summary }
          options.auditTrail?.record({
            category: 'context',
            action: 'rag_context',
            summary,
            detail: { sources, count: results.length }
          })
        }
      } catch {
        // RAG unavailable — continue without context
      }
    }

    let calendarContext = ''
    if (options.calendarService && runOptions.includeCalendarContext !== false) {
      try {
        const upcomingEvents = options.calendarService.upcomingEvents(6, 14)
        calendarContext = `\n\n${options.calendarService.getContextSummary(Date.now(), 14, 6)}`
        if (upcomingEvents.length > 0) {
          const summary = `Schedule context attached from ${upcomingEvents.length} upcoming event${upcomingEvents.length === 1 ? '' : 's'}.`
          yield { type: 'audit', title: 'Schedule Context', content: summary }
          options.auditTrail?.record({
            category: 'context',
            action: 'calendar_context',
            summary,
            detail: { count: upcomingEvents.length }
          })
        }
      } catch {
        // Calendar context unavailable — continue without schedule info.
      }
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT + vaultContext + ragContext + calendarContext },
      ...userMessages
    ]

    let toolsSupported = true
    const promptBudgetChars = derivePromptBudgetChars(resolved?.contextLength ?? 0, 768)

    for (let round = 0; round < MAX_ROUNDS; round++) {
      let fullContent = ''
      let toolCalls: ToolCall[] | undefined
      let isFirstTokenInRound = true

      try {
        const tools = toolsSupported
          ? createAgentTools({
            obsidianVault: options.obsidianVault,
            ragService: options.ragService,
            calendarService: options.calendarService,
            system: options.system,
            permissions: toolPermissions
          })
          : []
        const compactedRound = compactChatMessages(messages, {
          maxInputChars: promptBudgetChars,
          latestUserHint: lastUserMsg?.content
        })
        for await (const event of engine.streamChatWithTools(compactedRound.messages, tools)) {
          if (event.type === 'token') {
            if (isFirstTokenInRound && round === 0) {
              // Could be final text or thinking — stream it either way
            }
            isFirstTokenInRound = false
            yield { type: 'stream_token', token: event.token }
          }
          if (event.type === 'complete') {
            fullContent = event.content
            toolCalls = event.toolCalls
          }
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error)
        if (msg.includes('does not support tools') || msg.includes('400')) {
          toolsSupported = false
          // Retry this round without tools
          const compactedRound = compactChatMessages(messages, {
            maxInputChars: promptBudgetChars,
            latestUserHint: lastUserMsg?.content
          })
          for await (const event of engine.streamChatWithTools(compactedRound.messages, [])) {
            if (event.type === 'token') {
              yield { type: 'stream_token', token: event.token }
            }
            if (event.type === 'complete') {
              fullContent = event.content
              toolCalls = undefined
            }
          }
        } else {
          throw error
        }
      }

      if (!toolCalls || toolCalls.length === 0) {
        // Final text response — tokens were already streamed
        yield { type: 'done' }
        return
      }

      // Had tool calls — the streamed text was thinking
      messages.push({
        role: 'assistant',
        content: fullContent,
        tool_calls: toolCalls
      })

      for (const toolCall of toolCalls) {
        const name = toolCall.function.name
        let args: Record<string, unknown>
        if (typeof toolCall.function.arguments === 'string') {
          try {
            args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>
          } catch {
            args = {}
          }
        } else {
          args = toolCall.function.arguments
        }

        yield { type: 'tool_call', name, arguments: args }

        const result = await executeTool(name, args, {
          obsidianVault: options.obsidianVault,
          ragService: options.ragService,
          calendarService: options.calendarService,
          system: options.system,
          permissions: toolPermissions
        })

        options.auditTrail?.record({
          category: /write|clipboard|calendar_add_event|obsidian_write_note/u.test(name) ? 'write' : 'tool',
          action: name,
          summary: `${name} ${result.success ? 'succeeded' : 'failed'}.`,
          detail: {
            success: result.success,
            arguments: args,
            outputPreview: result.output.slice(0, 400)
          }
        })

        yield { type: 'tool_result', name, output: result.output, success: result.success }

        messages.push({
          role: 'tool',
          content: result.output
        })
      }
    }

    yield { type: 'error', message: 'Reached maximum tool-calling rounds' }
  }

  return { run }
}
