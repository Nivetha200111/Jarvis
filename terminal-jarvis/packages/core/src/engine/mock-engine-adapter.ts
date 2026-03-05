import type { ChatMessage, EngineAdapter, GenerationOptions, ModelInfo, TokenChunk, UsageStats } from '../types/index.js'
import type { ModelManager } from '../services/model-manager.js'

export interface MockEngineOptions {
  modelManager: ModelManager
}

const splitTokens = (text: string): string[] => {
  const matches = text.match(/\S+\s*/g)
  return matches ?? [text]
}

const countWords = (text: string): number => {
  const trimmed = text.trim()
  if (!trimmed) {
    return 0
  }

  return trimmed.split(/\s+/u).length
}

export class MockEngineAdapter implements EngineAdapter {
  private readonly modelManager: ModelManager
  private loadedModel: ModelInfo | null = null
  private usage: UsageStats = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0
  }

  public constructor(options: MockEngineOptions) {
    this.modelManager = options.modelManager
  }

  public async loadModel(modelId: string): Promise<ModelInfo> {
    const model = this.modelManager.resolveModel(modelId)
    if (!model) {
      throw new Error(`Model not found: ${modelId}`)
    }

    this.loadedModel = model
    return model
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
      if (!defaultModel) {
        throw new Error('No models available for generation')
      }

      this.loadedModel = defaultModel
    }

    const lastUser = [...messages].reverse().find((message) => message.role === 'user')
    const userPrompt = lastUser?.content ?? 'hello'
    const response = `Mock reply from ${this.loadedModel.id}: ${userPrompt}`
    const tokens = splitTokens(response)

    this.usage.promptTokens = messages.reduce((total, message) => total + countWords(message.content), 0)
    this.usage.completionTokens = tokens.length
    this.usage.totalTokens = this.usage.promptTokens + this.usage.completionTokens

    const delay = options.streamDelayMs ?? 2

    for (let index = 0; index < tokens.length; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, delay))
      const token = tokens[index]
      if (!token) {
        continue
      }

      yield {
        token,
        index,
        done: index === tokens.length - 1
      }
    }
  }
}

export const createMockEngineAdapter = (options: MockEngineOptions): EngineAdapter =>
  new MockEngineAdapter(options)
