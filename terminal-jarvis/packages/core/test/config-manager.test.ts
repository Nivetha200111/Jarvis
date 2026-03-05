import { describe, expect, it } from 'vitest'
import { createConfigManager } from '../src/services/config-manager.js'

describe('config-manager', () => {
  it('resolves defaults and enforces config validation', () => {
    const manager = createConfigManager()

    expect(manager.get('defaultModel')).toBe('mock-llama-3-8b-q4_k_m')
    expect(manager.get('dataDir')).toContain('.jarvis')

    expect(() => {
      manager.set('apiPort', 70000)
    }).toThrowError(/apiPort/)
  })
})
