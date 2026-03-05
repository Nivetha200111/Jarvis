import { createApiServer } from '../packages/api/dist/server.js'

const server = createApiServer()
const address = await server.listen({ host: '127.0.0.1', port: 0 })

try {
  const response = await fetch(`${address}/health`)
  const payload = await response.json()

  if (!response.ok || payload.status !== 'ok') {
    throw new Error(`Unexpected health payload: ${JSON.stringify(payload)}`)
  }

  console.log('API smoke passed')
} finally {
  await server.close()
}
