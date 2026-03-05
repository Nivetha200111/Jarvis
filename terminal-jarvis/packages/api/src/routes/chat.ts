import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { ChatService } from '@jarvis/core'
import { streamToSse } from '../sse.js'
import type { ApiChatCompletionRequest } from '../types.js'

export interface ChatRouteDeps {
  chatService: ChatService
}

export const registerChatRoute = (app: FastifyInstance, deps: ChatRouteDeps): void => {
  app.post<{ Body: ApiChatCompletionRequest }>('/v1/chat/completions', async (request, reply) => {
    const payload = request.body

    if (!payload || !Array.isArray(payload.messages) || payload.messages.length === 0) {
      return reply.code(400).send({ error: 'messages must be a non-empty array' })
    }

    if (payload.stream) {
      const tokenStream = deps.chatService.streamCompletion(payload)
      await streamToSse(reply, payload.model ?? 'mock-llama-3-8b-q4_k_m', tokenStream)
      return reply
    }

    const completion = await deps.chatService.generateCompletion(payload)

    return {
      id: `chatcmpl-${randomUUID()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: completion.model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: completion.content
          },
          finish_reason: 'stop'
        }
      ],
      usage: completion.usage
    }
  })
}
