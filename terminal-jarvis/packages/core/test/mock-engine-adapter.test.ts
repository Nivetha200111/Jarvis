import { describe, expect, it } from 'vitest'
import { createMockEngineAdapter } from '../src/engine/mock-engine-adapter.js'
import { createModelManager } from '../src/services/model-manager.js'

describe('MockEngineAdapter', () => {
  it('streams deterministic chunks in order', async () => {
    const modelManager = createModelManager()
    const engine = createMockEngineAdapter({ modelManager })

    await engine.loadModel('mock-llama-3-8b-q4_k_m')

    const chunks: string[] = []

    for await (const chunk of engine.generate([{ role: 'user', content: 'hello world' }], { streamDelayMs: 0 })) {
      chunks.push(chunk.token)
    }

    expect(chunks.join('')).toContain('Mock reply from mock-llama-3-8b-q4_k_m: hello world')
    expect(engine.getUsage().completionTokens).toBeGreaterThan(0)
  })
})
