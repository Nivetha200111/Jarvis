import type { ModelInfo } from '../types/index.js'

export type ModelUseCase = 'fast' | 'agent' | 'vision'

const EMBEDDING_MODEL_PATTERN = /\b(embed|embedding|nomic-embed|mxbai|bge|e5|gte|rerank)\b/iu
const VISION_MODEL_PATTERN = /(llava|vision|moondream|bakllava|qwen2\.5(?:-|:)?vl|llama3\.2-vision)/i

const isChatModel = (modelId: string): boolean => !EMBEDDING_MODEL_PATTERN.test(modelId)
const isVisionModel = (modelId: string): boolean => VISION_MODEL_PATTERN.test(modelId)

const scoreFastModel = (model: ModelInfo): number => {
  const id = model.id.toLowerCase()
  let score = isChatModel(id) ? 100 : -500

  if (id === 'qwen2.5:1.5b') score += 200
  else if (id === 'qwen2.5:3b') score += 180
  else if (id.startsWith('qwen2.5')) score += 160
  else if (id.includes('phi')) score += 120
  else if (id.includes('gemma')) score += 90
  else if (id.includes('llama3.2:3b')) score += 80

  if (isVisionModel(id)) score -= 80
  if (model.sizeBytes > 0) score -= Math.floor(model.sizeBytes / (1024 ** 3))

  return score
}

const scoreAgentModel = (model: ModelInfo): number => {
  const id = model.id.toLowerCase()
  let score = isChatModel(id) ? 100 : -500

  if (id === 'qwen2.5:3b') score += 220
  else if (id === 'qwen2.5:1.5b') score += 150
  else if (id.startsWith('qwen2.5')) score += 180
  else if (id.includes('mistral')) score += 110
  else if (id.includes('llama3')) score += 100

  if (isVisionModel(id)) score -= 50
  if (model.sizeBytes > 0) score -= Math.floor(model.sizeBytes / (2 * 1024 ** 3))

  return score
}

const scoreVisionModel = (model: ModelInfo): number => {
  const id = model.id.toLowerCase()
  let score = isVisionModel(id) ? 300 : -500

  if (id.includes('qwen2.5vl') || id.includes('qwen2.5-vl') || id.includes('qwen2.5:vl')) score += 80
  if (id.includes('llava')) score += 60
  if (model.sizeBytes > 0) score -= Math.floor(model.sizeBytes / (2 * 1024 ** 3))

  return score
}

const scoreModel = (model: ModelInfo, useCase: ModelUseCase): number => {
  switch (useCase) {
    case 'agent':
      return scoreAgentModel(model)
    case 'vision':
      return scoreVisionModel(model)
    case 'fast':
    default:
      return scoreFastModel(model)
  }
}

export const pickRecommendedModel = (
  models: ModelInfo[],
  useCase: ModelUseCase
): ModelInfo | undefined =>
  [...models]
    .sort((a, b) => scoreModel(b, useCase) - scoreModel(a, useCase))
    .find((model) => scoreModel(model, useCase) > -400)

export const pickRecommendedModelId = (
  models: ModelInfo[],
  useCase: ModelUseCase
): string | undefined => pickRecommendedModel(models, useCase)?.id
