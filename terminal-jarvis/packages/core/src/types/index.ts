export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ToolCall {
  function: {
    name: string
    arguments: Record<string, unknown>
  }
}

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, { type: string; description: string }>
      required: string[]
    }
  }
}

export interface ChatMessage {
  role: MessageRole
  content: string
  tool_calls?: ToolCall[]
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

export type AgentEvent =
  | { type: 'thinking'; content: string }
  | { type: 'tool_call'; name: string; arguments: Record<string, unknown> }
  | { type: 'tool_result'; name: string; output: string; success: boolean }
  | { type: 'text'; content: string }
  | { type: 'stream_token'; token: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

export interface ChatWithToolsResult {
  content: string
  toolCalls?: ToolCall[]
}

export type StreamToolEvent =
  | { type: 'token'; token: string }
  | { type: 'complete'; content: string; toolCalls?: ToolCall[] }

export interface EngineAdapter {
  loadModel(modelId: string): Promise<ModelInfo>
  unloadModel(): Promise<void>
  generate(messages: ChatMessage[], options?: GenerationOptions): AsyncGenerator<TokenChunk>
  getUsage(): UsageStats
  getLoadedModel(): ModelInfo | null
  chatWithTools?(messages: ChatMessage[], tools: ToolDefinition[]): Promise<ChatWithToolsResult>
  streamChatWithTools?(messages: ChatMessage[], tools: ToolDefinition[]): AsyncGenerator<StreamToolEvent>
}
