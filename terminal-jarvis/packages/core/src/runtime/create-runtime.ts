import { createMockEngineAdapter } from '../engine/mock-engine-adapter.js'
import { createOllamaEngineAdapter } from '../engine/ollama-engine-adapter.js'
import { discoverOllamaModels } from '../services/ollama-model-discovery.js'
import { createModelManager, type ModelManager } from '../services/model-manager.js'
import type { EngineAdapter } from '../types/index.js'

export type EngineProvider = 'mock' | 'ollama'

export interface RuntimeSelection {
  provider: EngineProvider
  modelManager: ModelManager
  engine: EngineAdapter
  defaultModel: string
}

const toPreferredProvider = (): 'auto' | EngineProvider => {
  const envPreference = process.env.JARVIS_ENGINE?.trim().toLowerCase()
  if (envPreference === 'mock' || envPreference === 'ollama') {
    return envPreference
  }

  return 'auto'
}

const createMockRuntime = (): RuntimeSelection => {
  const modelManager = createModelManager()

  return {
    provider: 'mock',
    modelManager,
    engine: createMockEngineAdapter({ modelManager }),
    defaultModel: modelManager.list()[0]?.id ?? 'mock-llama-3-8b-q4_k_m'
  }
}

const buildOllamaAliases = (modelIds: string[]): Record<string, string> => {
  const aliases = new Map<string, string>()

  for (const modelId of modelIds) {
    const [baseName] = modelId.split(':')
    if (!baseName) {
      continue
    }

    if (!aliases.has(baseName)) {
      aliases.set(baseName, modelId)
    }
  }

  return Object.fromEntries(aliases.entries())
}

export const createRuntimeSelection = (): RuntimeSelection => {
  const preferredProvider = toPreferredProvider()

  if (preferredProvider !== 'mock') {
    try {
      const ollamaModels = discoverOllamaModels()
      if (preferredProvider === 'ollama' || ollamaModels.length > 0) {
        const modelManager = createModelManager({
          seedModels: ollamaModels,
          aliases: buildOllamaAliases(ollamaModels.map((model) => model.id)),
          allowUnknownResolve: true
        })

        return {
          provider: 'ollama',
          modelManager,
          engine: createOllamaEngineAdapter({ modelManager }),
          defaultModel: ollamaModels[0]?.id ?? 'llama3'
        }
      }
    } catch {
      if (preferredProvider === 'ollama') {
        const modelManager = createModelManager({
          seedModels: [],
          allowUnknownResolve: true
        })

        return {
          provider: 'ollama',
          modelManager,
          engine: createOllamaEngineAdapter({ modelManager }),
          defaultModel: 'llama3'
        }
      }
    }
  }

  return createMockRuntime()
}
