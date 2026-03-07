import { describe, expect, it } from 'vitest'
import { pickRecommendedModelId } from '../src/services/model-router.js'
import type { ModelInfo } from '../src/types/index.js'

const models: ModelInfo[] = [
  {
    id: 'qwen2.5:1.5b',
    name: 'qwen2.5:1.5b',
    path: 'ollama://qwen2.5:1.5b',
    sizeBytes: 1_000_000_000,
    quantization: 'unknown',
    contextLength: 0
  },
  {
    id: 'qwen2.5:3b',
    name: 'qwen2.5:3b',
    path: 'ollama://qwen2.5:3b',
    sizeBytes: 2_000_000_000,
    quantization: 'unknown',
    contextLength: 0
  },
  {
    id: 'qwen2.5-vl:3b',
    name: 'qwen2.5-vl:3b',
    path: 'ollama://qwen2.5-vl:3b',
    sizeBytes: 2_500_000_000,
    quantization: 'unknown',
    contextLength: 0
  },
  {
    id: 'moondream:latest',
    name: 'moondream:latest',
    path: 'ollama://moondream:latest',
    sizeBytes: 900_000_000,
    quantization: 'unknown',
    contextLength: 0
  },
  {
    id: 'nomic-embed-text',
    name: 'nomic-embed-text',
    path: 'ollama://nomic-embed-text',
    sizeBytes: 300_000_000,
    quantization: 'unknown',
    contextLength: 0
  }
]

describe('model-router', () => {
  it('prefers the fastest qwen model for fast mode', () => {
    expect(pickRecommendedModelId(models, 'fast')).toBe('qwen2.5:1.5b')
  })

  it('prefers a stronger qwen model for agent mode', () => {
    expect(pickRecommendedModelId(models, 'agent')).toBe('qwen2.5:3b')
  })

  it('prefers a vision-capable model for vision mode', () => {
    expect(pickRecommendedModelId(models, 'vision')).toBe('qwen2.5-vl:3b')
  })

  it('recognizes the Ollama qwen2.5vl tag variant for vision mode', () => {
    const variantModels: ModelInfo[] = [
      models[0],
      {
        id: 'qwen2.5vl:3b',
        name: 'qwen2.5vl:3b',
        path: 'ollama://qwen2.5vl:3b',
        sizeBytes: 2_500_000_000,
        quantization: 'unknown',
        contextLength: 0
      }
    ]

    expect(pickRecommendedModelId(variantModels, 'vision')).toBe('qwen2.5vl:3b')
  })
})
