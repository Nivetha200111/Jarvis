import { describe, expect, it } from 'vitest'
import { createChatService } from '../src/services/chat-service.js'
import { createConfigManager } from '../src/services/config-manager.js'
import { createModelManager } from '../src/services/model-manager.js'
import { createTranscriptStore } from '../src/services/transcript-store.js'
import { createMockEngineAdapter } from '../src/engine/mock-engine-adapter.js'
import type { ChatMessage, EngineAdapter, TokenChunk, UsageStats } from '../src/types/index.js'

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

  it('compacts oversized prompt context before hitting the engine', async () => {
    const capturedInputs: ChatMessage[][] = []
    const modelManager = createModelManager()
    const configManager = createConfigManager()
    const transcriptStore = createTranscriptStore()
    const fakeEngine: EngineAdapter = {
      loadModel: async (modelId) => modelManager.resolveModel(modelId) ?? modelManager.list()[0]!,
      unloadModel: async () => {},
      getUsage: (): UsageStats => ({ promptTokens: 12, completionTokens: 4, totalTokens: 16 }),
      getLoadedModel: () => modelManager.list()[0] ?? null,
      generate: async function* (messages: ChatMessage[]): AsyncGenerator<TokenChunk> {
        capturedInputs.push(messages)
        yield { token: 'ok', index: 1, done: true }
      }
    }

    const chatService = createChatService({
      engine: fakeEngine,
      modelManager,
      transcriptStore,
      configManager
    })

    const oversizedContext = Array.from({ length: 18 }, (_, index) =>
      `[Daily-${index}.md] release checklist and sprint notes repeated repeated repeated`
    ).join('\n')

    await chatService.generateCompletion({
      model: 'llama3',
      messages: [
        { role: 'system', content: 'You are concise and local-only.' },
        {
          role: 'user',
          content: `Summarize the release blockers.\n\n[Obsidian context]\n${oversizedContext}`
        }
      ],
      max_tokens: 128
    })

    expect(capturedInputs).toHaveLength(1)
    const compactedUser = capturedInputs[0]?.at(-1)?.content ?? ''
    const originalUser = `Summarize the release blockers.\n\n[Obsidian context]\n${oversizedContext}`
    expect(compactedUser).toContain('Summarize the release blockers.')
    expect(compactedUser.length).toBeLessThan(originalUser.length)
  })
})
