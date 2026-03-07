import { describe, expect, it } from 'vitest'
import { createModelManager } from '../src/services/model-manager.js'

describe('model-manager', () => {
  it('returns seeded models and resolves aliases', () => {
    const manager = createModelManager()

    const models = manager.list()
    expect(models.length).toBeGreaterThanOrEqual(2)

    const resolved = manager.resolveModel('llama3')
    expect(resolved?.id).toBe('mock-llama-3-8b-q4_k_m')
  })

  it('syncs models and aliases at runtime', () => {
    const manager = createModelManager({
      seedModels: [],
      allowUnknownResolve: true
    })

    manager.sync(
      [
        {
          id: 'qwen2.5:3b',
          name: 'qwen2.5:3b',
          path: 'ollama://qwen2.5:3b',
          sizeBytes: 2_000_000_000,
          quantization: 'Q4_K_M',
          contextLength: 32768
        }
      ],
      {
        fast: 'qwen2.5:3b'
      }
    )

    expect(manager.list()).toHaveLength(1)
    expect(manager.resolveModel('fast')?.id).toBe('qwen2.5:3b')
  })
})
