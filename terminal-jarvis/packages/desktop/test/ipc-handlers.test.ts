import { describe, expect, it } from 'vitest'
import { createDesktopServices } from '../src/main/create-services.js'
import { getHealth, listModels, sendChat, streamChat } from '../src/main/ipc-handlers.js'

describe('desktop IPC handlers', () => {
  it('streams chat tokens through desktop handler', async () => {
    const services = createDesktopServices()
    const tokens: string[] = []

    await streamChat(
      services,
      {
        model: 'llama3',
        messages: [{ role: 'user', content: 'desktop stream check' }],
        stream: true
      },
      (event) => {
        if (event.type === 'token' && event.token) {
          tokens.push(event.token)
        }
      }
    )

    expect(tokens.join('')).toContain('Mock reply')
  })

  it('returns model list and health state', async () => {
    const services = createDesktopServices()

    const models = listModels(services)
    expect(models.length).toBeGreaterThan(0)

    const response = await sendChat(services, {
      model: 'llama3',
      messages: [{ role: 'user', content: 'health check' }]
    })

    expect(response.content).toContain('Mock reply')

    const health = getHealth(services)
    expect(health.status).toBe('ok')
    expect(health.loadedModel).toBeTruthy()
  })
})
