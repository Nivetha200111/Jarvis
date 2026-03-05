import type { ChatCompletionRequest } from '@jarvis/core'

export interface ApiChatCompletionRequest extends ChatCompletionRequest {
  stream?: boolean
}
