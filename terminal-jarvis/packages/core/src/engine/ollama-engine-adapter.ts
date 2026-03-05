import type {
  ChatMessage,
  EngineAdapter,
  GenerationOptions,
  ModelInfo,
  TokenChunk,
  UsageStats
} from '../types/index.js'
import type { ModelManager } from '../services/model-manager.js'

export interface OllamaEngineOptions {
  modelManager: ModelManager
  baseUrl?: string
}

interface OllamaStreamEvent {
  done?: boolean
  message?: {
    role?: string
    content?: string
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
  private loadedModel: ModelInfo | null = null
  private usage: UsageStats = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0
  }

  public constructor(options: OllamaEngineOptions) {
    this.modelManager = options.modelManager
    this.baseUrl = options.baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434'
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
      this.loadedModel = defaultModel ?? toSyntheticModel('llama3')
    }

    const requestBody: {
      model: string
      stream: boolean
      messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>
      options?: Record<string, number>
    } = {
      model: this.loadedModel.id,
      stream: true,
      messages: messages.map((message) => ({
        role: toOllamaMessageRole(message.role),
        content: message.content
      }))
    }

    const mappedOptions = toOllamaOptions(options)
    if (Object.keys(mappedOptions).length > 0) {
      requestBody.options = mappedOptions
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
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

        const content = event.message?.content ?? ''
        if (content) {
          index += 1
          yield {
            token: content,
            index,
            done: Boolean(event.done)
          }
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
  }
}

export const createOllamaEngineAdapter = (options: OllamaEngineOptions): EngineAdapter =>
  new OllamaEngineAdapter(options)
