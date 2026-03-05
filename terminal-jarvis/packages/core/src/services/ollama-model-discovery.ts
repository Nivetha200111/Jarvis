import { execFileSync } from 'node:child_process'
import type { ModelInfo } from '../types/index.js'

export const parseOllamaListOutput = (output: string): string[] => {
  const lines = output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) {
    return []
  }

  return lines
    .filter((line) => !line.toUpperCase().startsWith('NAME'))
    .map((line) => line.split(/\s+/u)[0])
    .filter((name): name is string => Boolean(name))
}

export const toOllamaModelInfo = (name: string): ModelInfo => ({
  id: name,
  name: `Ollama ${name}`,
  path: `ollama://${name}`,
  sizeBytes: 0,
  quantization: 'unknown',
  contextLength: 0
})

export const discoverOllamaModels = (): ModelInfo[] => {
  const raw = execFileSync('ollama', ['list'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })

  const names = parseOllamaListOutput(raw)
  return names.map((name) => toOllamaModelInfo(name))
}
