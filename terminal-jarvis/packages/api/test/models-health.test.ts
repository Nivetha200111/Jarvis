import { afterEach, describe, expect, it } from 'vitest'
import { createApiServer } from '../src/server.js'

process.env.JARVIS_ENGINE = 'mock'

describe('API model and health routes', () => {
  const servers: ReturnType<typeof createApiServer>[] = []

  afterEach(async () => {
    while (servers.length > 0) {
      const server = servers.pop()
      if (server) {
        await server.close()
      }
    }
  })

  it('lists available models', async () => {
    const app = createApiServer()
    servers.push(app)

    const response = await app.inject({ method: 'GET', url: '/v1/models' })
    expect(response.statusCode).toBe(200)

    const payload = response.json()
    expect(payload.object).toBe('list')
    expect(payload.data.length).toBeGreaterThan(0)
  })

  it('reports health status', async () => {
    const app = createApiServer()
    servers.push(app)

    const response = await app.inject({ method: 'GET', url: '/health' })
    expect(response.statusCode).toBe(200)

    const payload = response.json()
    expect(payload.status).toBe('ok')
    expect(payload).toHaveProperty('loadedModel')
  })
})
