import type { EngineAdapter, GenerationOptions, ChatCompletionRequest, ChatMessage, UsageStats } from '../types/index.js'
import type { ConfigManager } from './config-manager.js'
import type { ModelManager } from './model-manager.js'
import { compactChatMessages, derivePromptBudgetChars } from './prompt-compactor.js'
import type { TranscriptStore } from './transcript-store.js'

export interface ChatService {
  streamCompletion(request: ChatCompletionRequest): AsyncGenerator<{ token: string; index: number; done: boolean }>
  generateCompletion(request: ChatCompletionRequest): Promise<{ content: string; usage: UsageStats; model: string }>
}

export interface ChatServiceDeps {
  engine: EngineAdapter
  modelManager: ModelManager
  transcriptStore: TranscriptStore
  configManager: ConfigManager
}

const toGenerationOptions = (request: ChatCompletionRequest): GenerationOptions => ({
  temperature: request.temperature,
  topP: request.top_p,
  maxTokens: request.max_tokens
})

const cloneMessages = (messages: ChatMessage[]): ChatMessage[] =>
  messages.map((message) => ({ ...message }))

export const createChatService = (deps: ChatServiceDeps): ChatService => {
  const { engine, modelManager, transcriptStore, configManager } = deps

  const streamCompletion: ChatService['streamCompletion'] = async function* (request) {
    const resolvedModel = modelManager.resolveModel(request.model ?? configManager.get('defaultModel'))
    if (!resolvedModel) {
      throw new Error('No model could be resolved for completion request')
    }

    await engine.loadModel(resolvedModel.id)

    const inputMessages = cloneMessages(request.messages)
    const compactedInput = compactChatMessages(inputMessages, {
      maxInputChars: derivePromptBudgetChars(resolvedModel.contextLength, request.max_tokens)
    })
    const conversation = transcriptStore.createConversation(resolvedModel.id, inputMessages)

    let assistantContent = ''

    for await (const chunk of engine.generate(compactedInput.messages, toGenerationOptions(request))) {
      assistantContent += chunk.token
      yield chunk
    }

    transcriptStore.appendMessage(conversation.id, {
      role: 'assistant',
      content: assistantContent.trimEnd()
    })
  }

  const generateCompletion: ChatService['generateCompletion'] = async (request) => {
    let content = ''

    for await (const chunk of streamCompletion(request)) {
      content += chunk.token
    }

    const loadedModel = engine.getLoadedModel()
    const modelId = loadedModel?.id ?? configManager.get('defaultModel')

    return {
      content: content.trimEnd(),
      usage: engine.getUsage(),
      model: modelId
    }
  }

  return {
    streamCompletion,
    generateCompletion
  }
}
