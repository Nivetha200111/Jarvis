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
})
