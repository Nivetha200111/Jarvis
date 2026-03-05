import { randomUUID } from 'node:crypto'
import type { FastifyReply } from 'fastify'
import type { ChatCompletionChunk, TokenChunk } from '@jarvis/core'

const writeSseChunk = (reply: FastifyReply, payload: unknown): void => {
  reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`)
}

const toOpenAiChunk = (id: string, model: string, chunk: TokenChunk): ChatCompletionChunk => ({
  id,
  object: 'chat.completion.chunk',
  created: Math.floor(Date.now() / 1000),
  model,
  choices: [
    {
      index: 0,
      delta: {
        content: chunk.token
      },
      finish_reason: chunk.done ? 'stop' : null
    }
  ]
})

export const streamToSse = async (
  reply: FastifyReply,
  model: string,
  tokenStream: AsyncGenerator<TokenChunk>
): Promise<void> => {
  reply.hijack()
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  })

  const id = `chatcmpl-${randomUUID()}`

  for await (const chunk of tokenStream) {
    writeSseChunk(reply, toOpenAiChunk(id, model, chunk))
  }

  reply.raw.write('data: [DONE]\n\n')
  reply.raw.end()
}
