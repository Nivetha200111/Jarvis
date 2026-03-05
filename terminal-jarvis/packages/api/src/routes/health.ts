import type { FastifyInstance } from 'fastify'
import type { EngineAdapter } from '@jarvis/core'

export interface HealthRouteDeps {
  engine: EngineAdapter
}

export const registerHealthRoute = (app: FastifyInstance, deps: HealthRouteDeps): void => {
  app.get('/health', async () => ({
    status: 'ok',
    loadedModel: deps.engine.getLoadedModel()?.id ?? null,
    timestamp: new Date().toISOString()
  }))
}
