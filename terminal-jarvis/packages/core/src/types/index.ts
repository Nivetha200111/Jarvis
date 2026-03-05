export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ChatMessage {
  role: MessageRole
  content: string
}

export interface GenerationOptions {
  temperature?: number
  topP?: number
  maxTokens?: number
  streamDelayMs?: number
}

export interface TokenChunk {
  token: string
  index: number
  done: boolean
}

export interface ModelInfo {
  id: string
  name: string
  path: string
  sizeBytes: number
  quantization: string
  contextLength: number
}

export interface UsageStats {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface ChatCompletionRequest {
  model?: string
  messages: ChatMessage[]
  stream?: boolean
  temperature?: number
  top_p?: number
  max_tokens?: number
}

export interface ChatCompletionChunk {
  id: string
  object: 'chat.completion.chunk'
  created: number
  model: string
  choices: [
    {
      index: number
      delta: {
        role?: 'assistant'
        content?: string
      }
      finish_reason: string | null
    }
  ]
}

export interface TranscriptRecord {
  id: string
  model: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

export interface EngineAdapter {
  loadModel(modelId: string): Promise<ModelInfo>
  unloadModel(): Promise<void>
  generate(messages: ChatMessage[], options?: GenerationOptions): AsyncGenerator<TokenChunk>
  getUsage(): UsageStats
  getLoadedModel(): ModelInfo | null
}
