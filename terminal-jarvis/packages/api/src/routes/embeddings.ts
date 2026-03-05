import type { FastifyInstance } from 'fastify'

export const registerEmbeddingsRoute = (app: FastifyInstance): void => {
  app.post('/v1/embeddings', async (_, reply) => {
    return reply.code(501).send({
      error: 'Embeddings are not implemented in the baseline setup'
    })
  })
}
