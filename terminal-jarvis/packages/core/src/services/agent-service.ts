import type { EngineAdapter, ChatMessage, AgentEvent, ToolCall } from '../types/index.js'
import type { ModelManager } from './model-manager.js'
import type { ObsidianVaultService } from './obsidian-vault.js'
import type { RagService } from './rag-service.js'
import type { SystemToolCallbacks } from '../tools/index.js'
import { createAgentTools, executeTool } from '../tools/index.js'

const SYSTEM_PROMPT = `You are Jarvis, a powerful agentic AI assistant running fully locally on the user's machine. You have tools to execute shell commands, read/write files, list directories, extract archives, capture screenshots, read clipboard, send notifications, open URLs, and get system information. If Obsidian tools are available, use them for vault tasks. If RAG tools are available, use rag_search to find relevant knowledge. Use tools proactively to help the user. Think step by step, use tools when needed, and give concise answers.`

const MAX_ROUNDS = 15

export interface AgentService {
  run(modelId: string, userMessages: ChatMessage[]): AsyncGenerator<AgentEvent>
}

export interface CreateAgentServiceOptions {
  obsidianVault?: ObsidianVaultService
  ragService?: RagService
  system?: SystemToolCallbacks
}

export const createAgentService = (
  engine: EngineAdapter,
  modelManager: ModelManager,
  options: CreateAgentServiceOptions = {}
): AgentService => {
  const run = async function* (modelId: string, userMessages: ChatMessage[]): AsyncGenerator<AgentEvent> {
    if (!engine.streamChatWithTools) {
      yield { type: 'error', message: 'Engine does not support tool calling' }
      return
    }

    const resolved = modelManager.resolveModel(modelId)
    if (resolved) {
      await engine.loadModel(resolved.id)
    }

    // Retrieve RAG context if available
    let ragContext = ''
    if (options.ragService) {
      const lastUserMsg = [...userMessages].reverse().find((m) => m.role === 'user')
      if (lastUserMsg) {
        try {
          const results = await options.ragService.retrieve(lastUserMsg.content, 5)
          if (results.length > 0) {
            const contextChunks = results.map((r) =>
              `[source: ${r.source} | relevance: ${r.score.toFixed(2)}]\n${r.text}`
            )
            ragContext = `\n\nRelevant knowledge from indexed documents:\n---\n${contextChunks.join('\n---\n')}\n---\nUse this context to inform your response when relevant.`
          }
        } catch {
          // RAG unavailable — continue without context
        }
      }
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT + ragContext },
      ...userMessages
    ]

    let toolsSupported = true

    for (let round = 0; round < MAX_ROUNDS; round++) {
      let fullContent = ''
      let toolCalls: ToolCall[] | undefined
      let isFirstTokenInRound = true

      try {
        const tools = toolsSupported ? createAgentTools({ obsidianVault: options.obsidianVault, ragService: options.ragService, system: options.system }) : []
        for await (const event of engine.streamChatWithTools(messages, tools)) {
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
          for await (const event of engine.streamChatWithTools(messages, [])) {
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
        const args = typeof toolCall.function.arguments === 'string'
          ? JSON.parse(toolCall.function.arguments) as Record<string, unknown>
          : toolCall.function.arguments

        yield { type: 'tool_call', name, arguments: args }

        const result = await executeTool(name, args, { obsidianVault: options.obsidianVault, ragService: options.ragService, system: options.system })

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
