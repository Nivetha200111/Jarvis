import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

export interface VectorChunk {
  id: string
  text: string
  source: string
  embedding: number[]
  metadata?: Record<string, unknown>
}

export interface SearchResult {
  chunk: VectorChunk
  score: number
}

export interface VectorStore {
  add(chunks: VectorChunk[]): void
  search(queryEmbedding: number[], topK?: number, minScore?: number): SearchResult[]
  remove(source: string): number
  size(): number
  sources(): string[]
  persist(): void
  load(): void
}

export interface CreateVectorStoreOptions {
  storagePath?: string
}

const cosineSimilarity = (a: number[], b: number[]): number => {
  if (a.length !== b.length || a.length === 0) return 0

  let dot = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!
    const bi = b[i]!
    dot += ai * bi
    normA += ai * ai
    normB += bi * bi
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

interface StoredData {
  version: number
  chunks: Array<{
    id: string
    text: string
    source: string
    embedding: number[]
    metadata?: Record<string, unknown>
  }>
}

export const createVectorStore = (options: CreateVectorStoreOptions = {}): VectorStore => {
  const storagePath = options.storagePath ?? join(homedir(), '.jarvis', 'vectors.json')
  const chunks: VectorChunk[] = []

  const add = (newChunks: VectorChunk[]): void => {
    for (const chunk of newChunks) {
      // Deduplicate by id
      const existingIndex = chunks.findIndex((c) => c.id === chunk.id)
      if (existingIndex >= 0) {
        chunks[existingIndex] = chunk
      } else {
        chunks.push(chunk)
      }
    }
  }

  const search = (queryEmbedding: number[], topK = 5, minScore = 0.3): SearchResult[] => {
    if (chunks.length === 0) return []

    const scored: SearchResult[] = chunks.map((chunk) => ({
      chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding)
    }))

    return scored
      .filter((r) => r.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }

  const remove = (source: string): number => {
    let removed = 0
    for (let i = chunks.length - 1; i >= 0; i--) {
      if (chunks[i]!.source === source) {
        chunks.splice(i, 1)
        removed++
      }
    }
    return removed
  }

  const size = (): number => chunks.length

  const sources = (): string[] => [...new Set(chunks.map((c) => c.source))]

  const persist = (): void => {
    try {
      const dir = dirname(storagePath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }

      const data: StoredData = {
        version: 1,
        chunks: chunks.map((c) => ({
          id: c.id,
          text: c.text,
          source: c.source,
          embedding: c.embedding,
          ...(c.metadata ? { metadata: c.metadata } : {})
        }))
      }

      writeFileSync(storagePath, JSON.stringify(data), 'utf8')
    } catch (error) {
      console.error('Failed to persist vector store:', error instanceof Error ? error.message : String(error))
    }
  }

  const load = (): void => {
    try {
      if (!existsSync(storagePath)) return

      const raw = readFileSync(storagePath, 'utf8')
      const data = JSON.parse(raw) as StoredData

      if (data.version !== 1) return

      chunks.length = 0
      for (const c of data.chunks) {
        chunks.push({
          id: c.id,
          text: c.text,
          source: c.source,
          embedding: c.embedding,
          metadata: c.metadata
        })
      }
    } catch {
      // Corrupted or missing — start fresh
    }
  }

  return { add, search, remove, size, sources, persist, load }
}
