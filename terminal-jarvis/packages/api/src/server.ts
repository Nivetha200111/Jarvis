import { fileURLToPath } from 'node:url'
import path from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import {
  createChatService,
  createConfigManager,
  createMockEngineAdapter,
  createModelManager,
  createTranscriptStore
} from '@jarvis/core'
import { registerChatRoute } from './routes/chat.js'
import { registerEmbeddingsRoute } from './routes/embeddings.js'
import { registerHealthRoute } from './routes/health.js'
import { registerModelsRoute } from './routes/models.js'

export interface ApiServerOptions {
  port?: number
  model?: string
}

export const createApiServer = (options: ApiServerOptions = {}): FastifyInstance => {
  const app = Fastify({ logger: false })

  const modelManager = createModelManager()
  const configManager = createConfigManager(
    options.model
      ? {
          defaultModel: options.model
        }
      : {}
  )
  const transcriptStore = createTranscriptStore()
  const engine = createMockEngineAdapter({ modelManager })
  const chatService = createChatService({
    engine,
    modelManager,
    transcriptStore,
    configManager
  })

  app.register(cors, { origin: false })
  app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute'
  })

  registerChatRoute(app, { chatService })
  registerModelsRoute(app, { modelManager })
  registerHealthRoute(app, { engine })
  registerEmbeddingsRoute(app)

  return app
}

export const startApiServer = async (options: ApiServerOptions = {}): Promise<{ app: FastifyInstance; address: string }> => {
  const app = createApiServer(options)
  const port = options.port ?? 8080
  const address = await app.listen({ host: '127.0.0.1', port })

  return {
    app,
    address
  }
}

const isDirectExecution = (): boolean => {
  if (!process.argv[1]) {
    return false
  }

  const currentFile = fileURLToPath(import.meta.url)
  return path.resolve(process.argv[1]) === currentFile
}

if (isDirectExecution()) {
  const portArg = process.argv.find((arg) => arg.startsWith('--port='))
  const port = portArg ? Number.parseInt(portArg.replace('--port=', ''), 10) : 8080

  startApiServer({ port })
    .then(({ address }) => {
      console.log(`Jarvis API listening on ${address}`)
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      console.error(message)
      process.exit(1)
    })
}
