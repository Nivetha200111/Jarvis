import type { FastifyInstance } from 'fastify'
import type { ModelManager } from '@jarvis/core'

export interface ModelsRouteDeps {
  modelManager: ModelManager
}

export const registerModelsRoute = (app: FastifyInstance, deps: ModelsRouteDeps): void => {
  app.get('/v1/models', async () => {
    const models = deps.modelManager.list()

    return {
      object: 'list',
      data: models.map((model) => ({
        ...model,
        object: 'model',
        owned_by: 'local'
      }))
    }
  })
}
