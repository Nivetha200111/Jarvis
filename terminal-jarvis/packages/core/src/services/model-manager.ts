import type { ModelInfo } from '../types/index.js'

const seededModels: ModelInfo[] = [
  {
    id: 'mock-llama-3-8b-q4_k_m',
    name: 'Mock Llama 3 8B Q4_K_M',
    path: '~/.jarvis/models/mock-llama-3-8b-q4_k_m.gguf',
    sizeBytes: 4_294_967_296,
    quantization: 'Q4_K_M',
    contextLength: 8192
  },
  {
    id: 'mock-mistral-7b-q5_k_m',
    name: 'Mock Mistral 7B Q5_K_M',
    path: '~/.jarvis/models/mock-mistral-7b-q5_k_m.gguf',
    sizeBytes: 5_153_960_755,
    quantization: 'Q5_K_M',
    contextLength: 8192
  }
]

export interface ModelManager {
  list(): ModelInfo[]
  getById(id: string): ModelInfo | undefined
  resolveModel(input?: string): ModelInfo | undefined
  registerAlias(alias: string, modelId: string): void
}

export const createModelManager = (): ModelManager => {
  const models = new Map<string, ModelInfo>(seededModels.map((model) => [model.id, model]))
  const aliases = new Map<string, string>([
    ['llama3', 'mock-llama-3-8b-q4_k_m'],
    ['mistral', 'mock-mistral-7b-q5_k_m']
  ])

  const list = (): ModelInfo[] => Array.from(models.values())

  const getById = (id: string): ModelInfo | undefined => models.get(id)

  const resolveModel = (input?: string): ModelInfo | undefined => {
    if (!input) {
      return list()[0]
    }

    const direct = models.get(input)
    if (direct) {
      return direct
    }

    const aliasId = aliases.get(input)
    if (!aliasId) {
      return undefined
    }

    return models.get(aliasId)
  }

  const registerAlias = (alias: string, modelId: string): void => {
    if (!models.has(modelId)) {
      throw new Error(`Cannot create alias for unknown model: ${modelId}`)
    }

    aliases.set(alias, modelId)
  }

  return {
    list,
    getById,
    resolveModel,
    registerAlias
  }
}
