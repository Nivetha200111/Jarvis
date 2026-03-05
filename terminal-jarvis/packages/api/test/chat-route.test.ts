import { afterEach, describe, expect, it } from 'vitest'
import { createApiServer } from '../src/server.js'

describe('API chat routes', () => {
  const servers: ReturnType<typeof createApiServer>[] = []

  afterEach(async () => {
    while (servers.length > 0) {
      const server = servers.pop()
      if (server) {
        await server.close()
      }
    }
  })

  it('returns non-streaming OpenAI-compatible response shape', async () => {
    const app = createApiServer()
    servers.push(app)

    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: {
        model: 'llama3',
        messages: [{ role: 'user', content: 'test non-streaming' }],
        stream: false
      }
    })

    expect(response.statusCode).toBe(200)

    const payload = response.json()
    expect(payload.object).toBe('chat.completion')
    expect(payload.choices[0].message.content).toContain('Mock reply')
    expect(payload.usage.totalTokens).toBeGreaterThan(0)
  })

  it('returns SSE payload for streaming requests and ends with [DONE]', async () => {
    const app = createApiServer()
    servers.push(app)

    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: {
        model: 'llama3',
        messages: [{ role: 'user', content: 'stream please' }],
        stream: true
      }
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/event-stream')
    expect(response.body).toContain('chat.completion.chunk')
    expect(response.body).toContain('data: [DONE]')
  })
})
