import { execFileSync } from 'node:child_process'
import type { ModelInfo } from '../types/index.js'

export interface OllamaListEntry {
  name: string
  sizeBytes: number
}

const EMBEDDING_MODEL_PATTERN = /\b(embed|embedding|nomic-embed|mxbai|bge|e5|gte)\b/iu
const RERANK_MODEL_PATTERN = /\b(rerank|reranker)\b/iu

const SIZE_UNITS: Record<string, number> = {
  B: 1,
  KB: 1024,
  MB: 1024 ** 2,
  GB: 1024 ** 3,
  TB: 1024 ** 4
}

const parseSizeBytes = (value: string): number => {
  const match = value.trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*([KMGT]?B)$/iu)
  if (!match) {
    return 0
  }

  const amount = Number.parseFloat(match[1] ?? '0')
  const unit = (match[2] ?? 'B').toUpperCase()
  const factor = SIZE_UNITS[unit] ?? 1
  return Number.isFinite(amount) ? Math.round(amount * factor) : 0
}

const extractBillionParams = (name: string): number => {
  const match = name.toLowerCase().match(/([0-9]+(?:\.[0-9]+)?)b/iu)
  if (!match) {
    return Number.POSITIVE_INFINITY
  }

  const value = Number.parseFloat(match[1] ?? '0')
  return Number.isFinite(value) && value > 0 ? value : Number.POSITIVE_INFINITY
}

const isLikelyNonChatModel = (name: string): boolean =>
  EMBEDDING_MODEL_PATTERN.test(name) || RERANK_MODEL_PATTERN.test(name)

const compareOllamaEntriesFastFirst = (a: OllamaListEntry, b: OllamaListEntry): number => {
  const aNonChatPenalty = isLikelyNonChatModel(a.name) ? 1 : 0
  const bNonChatPenalty = isLikelyNonChatModel(b.name) ? 1 : 0
  if (aNonChatPenalty !== bNonChatPenalty) {
    return aNonChatPenalty - bNonChatPenalty
  }

  const aSize = a.sizeBytes > 0 ? a.sizeBytes : Number.POSITIVE_INFINITY
  const bSize = b.sizeBytes > 0 ? b.sizeBytes : Number.POSITIVE_INFINITY
  if (aSize !== bSize) {
    return aSize - bSize
  }

  const aParams = extractBillionParams(a.name)
  const bParams = extractBillionParams(b.name)
  if (aParams !== bParams) {
    return aParams - bParams
  }

  return a.name.localeCompare(b.name)
}

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

export const parseOllamaListEntries = (output: string): OllamaListEntry[] => {
  const lines = output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.toUpperCase().startsWith('NAME'))

  return lines
    .map((line) => {
      const name = line.split(/\s+/u)[0]
      if (!name) {
        return null
      }

      const sizeMatch = line.match(/\s([0-9]+(?:\.[0-9]+)?)\s*([KMGT]?B)\s+/iu)
      const sizeBytes = sizeMatch
        ? parseSizeBytes(`${sizeMatch[1] ?? '0'} ${sizeMatch[2] ?? 'B'}`)
        : 0

      return {
        name,
        sizeBytes
      }
    })
    .filter((entry): entry is OllamaListEntry => Boolean(entry))
}

export const sortOllamaListEntriesFastFirst = (entries: OllamaListEntry[]): OllamaListEntry[] =>
  [...entries].sort(compareOllamaEntriesFastFirst)

export const toOllamaModelInfo = (name: string, sizeBytes = 0): ModelInfo => ({
  id: name,
  name: `Ollama ${name}`,
  path: `ollama://${name}`,
  sizeBytes,
  quantization: 'unknown',
  contextLength: 0
})

export const discoverOllamaModels = (): ModelInfo[] => {
  const raw = execFileSync('ollama', ['list'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32'
  })

  const entries = sortOllamaListEntriesFastFirst(parseOllamaListEntries(raw))

  return entries.map((entry) => toOllamaModelInfo(entry.name, entry.sizeBytes))
}
