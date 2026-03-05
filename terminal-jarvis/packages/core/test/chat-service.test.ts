import { describe, expect, it } from 'vitest'
import { createChatService } from '../src/services/chat-service.js'
import { createConfigManager } from '../src/services/config-manager.js'
import { createModelManager } from '../src/services/model-manager.js'
import { createTranscriptStore } from '../src/services/transcript-store.js'
import { createMockEngineAdapter } from '../src/engine/mock-engine-adapter.js'

describe('chat-service', () => {
  it('preserves message ordering and aggregates streamed response', async () => {
    const modelManager = createModelManager()
    const configManager = createConfigManager()
    const transcriptStore = createTranscriptStore()
    const engine = createMockEngineAdapter({ modelManager })
    const chatService = createChatService({
      engine,
      modelManager,
      transcriptStore,
      configManager
    })

    const input = [
      { role: 'system', content: 'You are concise.' },
      { role: 'user', content: 'Say hello once' }
    ] as const

    const response = await chatService.generateCompletion({
      model: 'llama3',
      messages: [...input]
    })

    expect(response.content).toContain('Say hello once')

    const conversations = transcriptStore.listConversations()
    expect(conversations).toHaveLength(1)
    expect(conversations[0]?.messages[0]?.role).toBe('system')
    expect(conversations[0]?.messages[1]?.role).toBe('user')
    expect(conversations[0]?.messages.at(-1)?.role).toBe('assistant')
  })
})
