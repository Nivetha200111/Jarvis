import { fileURLToPath } from 'node:url'
import path from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import {
  createChatService,
  createConfigManager,
  createRuntimeSelection,
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

type CorsOriginResolver = (
  origin: string | undefined,
  cb: (err: Error | null, allow: boolean) => void
) => void

type CorsOriginPolicy = boolean | string | string[] | CorsOriginResolver

const shouldWarn = (): boolean => process.env.JARVIS_SUPPRESS_SECURITY_WARNINGS !== '1'

const isTrustedBrowserOrigin = (origin: string): boolean => {
  if (origin.startsWith('app://obsidian.md') || origin.startsWith('obsidian://')) {
    return true
  }

  try {
    const parsed = new URL(origin)
    return parsed.hostname === 'localhost'
      || parsed.hostname === '127.0.0.1'
      || parsed.hostname === '::1'
      || parsed.hostname === '[::1]'
  } catch {
    return false
  }
}

const toLocalCorsResolver = (): CorsOriginResolver => (origin, cb) => {
  if (!origin) {
    cb(null, true)
    return
  }

  cb(null, isTrustedBrowserOrigin(origin))
}

const resolveCorsOrigin = (): { origin: CorsOriginPolicy; warning?: string } => {
  const raw = process.env.JARVIS_CORS_ORIGIN?.trim()
  if (!raw || raw === '*' || raw.toLowerCase() === 'true') {
    if (!raw) {
      return { origin: toLocalCorsResolver() }
    }

    return {
      origin: true,
      warning: 'JARVIS_CORS_ORIGIN is permissive (* / true). Any browser origin can call the local API.'
    }
  }

  if (raw.toLowerCase() === 'false') {
    return { origin: false }
  }

  const allowList = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)

  if (allowList.length === 0) {
    return { origin: toLocalCorsResolver() }
  }

  return {
    origin: (origin, cb) => {
      if (!origin) {
        cb(null, true)
        return
      }

      cb(null, allowList.includes(origin))
    }
  }
}

const extractClientApiKey = (headers: Record<string, unknown>): string => {
  const rawAuth = headers.authorization
  const authValue = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth
  if (typeof authValue === 'string') {
    const bearerMatch = authValue.match(/^Bearer\s+(.+)$/iu)
    if (bearerMatch?.[1]) {
      return bearerMatch[1].trim()
    }
  }

  const rawKey = headers['x-api-key']
  const keyValue = Array.isArray(rawKey) ? rawKey[0] : rawKey
  if (typeof keyValue === 'string') {
    return keyValue.trim()
  }

  return ''
}

export const createApiServer = (options: ApiServerOptions = {}): FastifyInstance => {
  const app = Fastify({ logger: false })

  const runtime = createRuntimeSelection()
  const modelManager = runtime.modelManager
  const configManager = createConfigManager(
    {
      defaultModel: options.model ?? runtime.defaultModel
    }
  )
  const transcriptStore = createTranscriptStore()
  const engine = runtime.engine
  const chatService = createChatService({
    engine,
    modelManager,
    transcriptStore,
    configManager
  })

  const expectedApiKey = process.env.JARVIS_API_KEY?.trim() ?? ''
  if (!expectedApiKey && shouldWarn()) {
    console.warn('[security] JARVIS_API_KEY is not set. Local API endpoints are unauthenticated.')
  }

  if (expectedApiKey) {
    app.addHook('onRequest', async (request, reply) => {
      if (!request.url.startsWith('/v1/')) {
        return
      }

      const clientKey = extractClientApiKey(request.headers as Record<string, unknown>)
      if (clientKey !== expectedApiKey) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Provide a valid Bearer token or x-api-key'
        })
      }
    })
  }

  const corsPolicy = resolveCorsOrigin()
  if (corsPolicy.warning && shouldWarn()) {
    console.warn(`[security] ${corsPolicy.warning}`)
  }

  app.register(cors, { origin: corsPolicy.origin })
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
