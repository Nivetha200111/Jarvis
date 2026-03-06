import type {
  ChatMessage,
  ChatWithToolsResult,
  EngineAdapter,
  GenerationOptions,
  ModelInfo,
  StreamToolEvent,
  TokenChunk,
  ToolDefinition,
  UsageStats
} from '../types/index.js'
import type { ModelManager } from '../services/model-manager.js'

export interface OllamaEngineOptions {
  modelManager: ModelManager
  baseUrl?: string
  keepAlive?: string
  requestTimeoutMs?: number
}

interface OllamaStreamEvent {
  done?: boolean
  message?: {
    role?: string
    content?: string
    tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>
  }
  prompt_eval_count?: number
  eval_count?: number
}

const toOllamaMessageRole = (role: ChatMessage['role']): 'system' | 'user' | 'assistant' | 'tool' => {
  if (role === 'system' || role === 'user' || role === 'assistant' || role === 'tool') {
    return role
  }

  return 'user'
}

const toOllamaOptions = (options: GenerationOptions = {}): Record<string, number> => {
  const mapped: Record<string, number> = {}

  if (typeof options.temperature === 'number') {
    mapped.temperature = options.temperature
  }

  if (typeof options.topP === 'number') {
    mapped.top_p = options.topP
  }

  if (typeof options.maxTokens === 'number') {
    mapped.num_predict = options.maxTokens
  }

  return mapped
}

const toSyntheticModel = (modelId: string): ModelInfo => ({
  id: modelId,
  name: `Ollama ${modelId}`,
  path: `ollama://${modelId}`,
  sizeBytes: 0,
  quantization: 'unknown',
  contextLength: 0
})

export class OllamaEngineAdapter implements EngineAdapter {
  private readonly modelManager: ModelManager
  private readonly baseUrl: string
  private readonly keepAlive: string
  private readonly requestTimeoutMs: number
  private loadedModel: ModelInfo | null = null
  private usage: UsageStats = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0
  }

  public constructor(options: OllamaEngineOptions) {
    this.modelManager = options.modelManager
    this.baseUrl = options.baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434'
    this.keepAlive = options.keepAlive ?? process.env.JARVIS_OLLAMA_KEEP_ALIVE ?? '30m'
    const timeoutFromEnv = Number.parseInt(process.env.JARVIS_OLLAMA_TIMEOUT_MS ?? '', 10)
    this.requestTimeoutMs = options.requestTimeoutMs
      ?? (Number.isFinite(timeoutFromEnv) && timeoutFromEnv > 0 ? timeoutFromEnv : 180_000)
  }

  private createAbortController(): { controller: AbortController; timeout: ReturnType<typeof setTimeout> } {
    const controller = new AbortController()
    const timeout = setTimeout(() => {
      controller.abort()
    }, this.requestTimeoutMs)
    return { controller, timeout }
  }

  public async loadModel(modelId: string): Promise<ModelInfo> {
    const resolved = this.modelManager.resolveModel(modelId) ?? toSyntheticModel(modelId)
    this.loadedModel = resolved
    return resolved
  }

  public async unloadModel(): Promise<void> {
    this.loadedModel = null
  }

  public getLoadedModel(): ModelInfo | null {
    return this.loadedModel
  }

  public getUsage(): UsageStats {
    return { ...this.usage }
  }

  public async *generate(
    messages: ChatMessage[],
    options: GenerationOptions = {}
  ): AsyncGenerator<TokenChunk> {
    if (!this.loadedModel) {
      const defaultModel = this.modelManager.list()[0]
      this.loadedModel = defaultModel ?? toSyntheticModel('qwen2.5')
    }

    const requestBody: {
      model: string
      stream: boolean
      keep_alive: string
      messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>
      options?: Record<string, number>
    } = {
      model: this.loadedModel.id,
      stream: true,
      keep_alive: this.keepAlive,
      messages: messages.map((message) => ({
        role: toOllamaMessageRole(message.role),
        content: message.content,
        ...(message.images && message.images.length > 0 ? { images: message.images } : {})
      }))
    }

    const mappedOptions = toOllamaOptions(options)
    if (Object.keys(mappedOptions).length > 0) {
      requestBody.options = mappedOptions
    }

    const { controller, timeout } = this.createAbortController()
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Ollama request failed (${response.status}): ${errorText}`)
      }

      if (!response.body) {
        throw new Error('Ollama response did not include a stream body')
      }

      const decoder = new TextDecoder()
      const reader = response.body.getReader()

      let buffer = ''
      let index = 0

      const processEvent = (event: OllamaStreamEvent): TokenChunk | null => {
        const content = event.message?.content ?? ''
        if (content) {
          index += 1
          return {
            token: content,
            index,
            done: Boolean(event.done)
          }
        }
        return null
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const rawLine of lines) {
          const line = rawLine.trim()
          if (!line) {
            continue
          }

          let event: OllamaStreamEvent
          try {
            event = JSON.parse(line) as OllamaStreamEvent
          } catch {
            continue
          }

          const chunk = processEvent(event)
          if (chunk) {
            yield chunk
          }

          if (event.done) {
            const promptTokens = event.prompt_eval_count ?? 0
            const completionTokens = event.eval_count ?? index
            this.usage = {
              promptTokens,
              completionTokens,
              totalTokens: promptTokens + completionTokens
            }
          }
        }
      }

      const tailLine = buffer.trim()
      if (tailLine) {
        try {
          const event = JSON.parse(tailLine) as OllamaStreamEvent
          const chunk = processEvent(event)
          if (chunk) {
            yield chunk
          }
          if (event.done) {
            const promptTokens = event.prompt_eval_count ?? 0
            const completionTokens = event.eval_count ?? index
            this.usage = {
              promptTokens,
              completionTokens,
              totalTokens: promptTokens + completionTokens
            }
          }
        } catch {
          // ignore trailing non-JSON tail
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Ollama request timed out after ${this.requestTimeoutMs}ms`)
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }

  public async chatWithTools(messages: ChatMessage[], tools: ToolDefinition[]): Promise<ChatWithToolsResult> {
    if (!this.loadedModel) {
      const defaultModel = this.modelManager.list()[0]
      this.loadedModel = defaultModel ?? toSyntheticModel('qwen2.5')
    }

    const requestBody = {
      model: this.loadedModel.id,
      stream: false,
      keep_alive: this.keepAlive,
      messages: messages.map((message) => {
        const mapped: Record<string, unknown> = {
          role: toOllamaMessageRole(message.role),
          content: message.content
        }
        if (message.images && message.images.length > 0) {
          mapped.images = message.images
        }
        if (message.tool_calls) {
          mapped.tool_calls = message.tool_calls
        }
        return mapped
      }),
      tools
    }

    const { controller, timeout } = this.createAbortController()
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Ollama request failed (${response.status}): ${errorText}`)
      }

      const data = (await response.json()) as {
        message?: { content?: string; tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }> }
      }
      const msg = data.message ?? {}

      return {
        content: msg.content ?? '',
        toolCalls: msg.tool_calls
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Ollama request timed out after ${this.requestTimeoutMs}ms`)
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }

  public async *streamChatWithTools(messages: ChatMessage[], tools: ToolDefinition[]): AsyncGenerator<StreamToolEvent> {
    if (!this.loadedModel) {
      const defaultModel = this.modelManager.list()[0]
      this.loadedModel = defaultModel ?? toSyntheticModel('qwen2.5')
    }

    const requestBody = {
      model: this.loadedModel.id,
      stream: true,
      keep_alive: this.keepAlive,
      messages: messages.map((message) => {
        const mapped: Record<string, unknown> = {
          role: toOllamaMessageRole(message.role),
          content: message.content
        }
        if (message.images && message.images.length > 0) {
          mapped.images = message.images
        }
        if (message.tool_calls) {
          mapped.tool_calls = message.tool_calls
        }
        return mapped
      }),
      ...(tools.length > 0 ? { tools } : {})
    }

    const { controller, timeout } = this.createAbortController()
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Ollama request failed (${response.status}): ${errorText}`)
      }

      if (!response.body) {
        throw new Error('Ollama response did not include a stream body')
      }

      const decoder = new TextDecoder()
      const reader = response.body.getReader()
      let buffer = ''
      let fullContent = ''
      let toolCalls: Array<{ function: { name: string; arguments: Record<string, unknown> } }> | undefined

      const processEvent = (event: OllamaStreamEvent): void => {
        const content = event.message?.content ?? ''
        if (content) {
          fullContent += content
        }

        if (event.message?.tool_calls) {
          toolCalls = event.message.tool_calls
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const rawLine of lines) {
          const line = rawLine.trim()
          if (!line) continue

          let event: OllamaStreamEvent
          try {
            event = JSON.parse(line) as OllamaStreamEvent
          } catch {
            continue
          }

          processEvent(event)
          const content = event.message?.content ?? ''
          if (content) {
            yield { type: 'token', token: content }
          }
        }
      }

      const tailLine = buffer.trim()
      if (tailLine) {
        try {
          const event = JSON.parse(tailLine) as OllamaStreamEvent
          processEvent(event)
          const content = event.message?.content ?? ''
          if (content) {
            yield { type: 'token', token: content }
          }
        } catch {
          // ignore trailing non-JSON tail
        }
      }

      yield { type: 'complete', content: fullContent, toolCalls }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Ollama request timed out after ${this.requestTimeoutMs}ms`)
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }
}

export const createOllamaEngineAdapter = (options: OllamaEngineOptions): EngineAdapter =>
  new OllamaEngineAdapter(options)
