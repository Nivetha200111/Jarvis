import { createHash } from 'node:crypto'
import type { EmbeddingService } from './embedding-service.js'
import type { VectorStore, VectorChunk } from './vector-store.js'

export interface RagService {
  index(source: string, text: string, metadata?: Record<string, unknown>): Promise<number>
  retrieve(query: string, topK?: number): Promise<RagResult[]>
  removeSource(source: string): number
  getStats(): RagStats
  isReady(): boolean
}

export interface RagResult {
  text: string
  source: string
  score: number
}

export interface RagStats {
  totalChunks: number
  sources: string[]
  embeddingModel: string
}

export interface CreateRagServiceOptions {
  embeddingService: EmbeddingService
  vectorStore: VectorStore
  chunkSize?: number
  chunkOverlap?: number
}

const CHUNK_SIZE = 512
const CHUNK_OVERLAP = 64

const chunkText = (text: string, chunkSize: number, overlap: number): string[] => {
  const chunks: string[] = []
  const words = text.split(/\s+/)

  if (words.length <= chunkSize) {
    const joined = words.join(' ').trim()
    if (joined) chunks.push(joined)
    return chunks
  }

  let start = 0
  while (start < words.length) {
    const end = Math.min(start + chunkSize, words.length)
    const chunk = words.slice(start, end).join(' ').trim()
    if (chunk) chunks.push(chunk)
    if (end >= words.length) break
    start += chunkSize - overlap
  }

  return chunks
}

const chunkId = (source: string, index: number): string => {
  const hash = createHash('md5').update(`${source}:${index}`).digest('hex').slice(0, 12)
  return `${hash}-${index}`
}

export const createRagService = (options: CreateRagServiceOptions): RagService => {
  const {
    embeddingService,
    vectorStore,
    chunkSize = CHUNK_SIZE,
    chunkOverlap = CHUNK_OVERLAP
  } = options

  let ready = false

  // Try a simple embed to check if embedding model is available
  const checkReady = async (): Promise<boolean> => {
    if (ready) return true
    try {
      await embeddingService.embed(['test'])
      ready = true
      return true
    } catch {
      return false
    }
  }

  const index = async (
    source: string,
    text: string,
    metadata?: Record<string, unknown>
  ): Promise<number> => {
    if (!(await checkReady())) return 0

    // Remove old chunks for this source before re-indexing
    vectorStore.remove(source)

    const textChunks = chunkText(text, chunkSize, chunkOverlap)
    if (textChunks.length === 0) return 0

    // Embed in batches of 32 to avoid overwhelming Ollama
    const BATCH_SIZE = 32
    const allVectorChunks: VectorChunk[] = []

    for (let i = 0; i < textChunks.length; i += BATCH_SIZE) {
      const batch = textChunks.slice(i, i + BATCH_SIZE)
      const embeddings = await embeddingService.embed(batch)

      for (let j = 0; j < batch.length; j++) {
        const globalIndex = i + j
        allVectorChunks.push({
          id: chunkId(source, globalIndex),
          text: batch[j]!,
          source,
          embedding: embeddings[j]!,
          metadata
        })
      }
    }

    vectorStore.add(allVectorChunks)
    vectorStore.persist()

    return allVectorChunks.length
  }

  const retrieve = async (query: string, topK = 5): Promise<RagResult[]> => {
    if (!(await checkReady())) return []
    if (vectorStore.size() === 0) return []

    const [queryEmbedding] = await embeddingService.embed([query])
    if (!queryEmbedding) return []

    return vectorStore.search(queryEmbedding, topK).map((result) => ({
      text: result.chunk.text,
      source: result.chunk.source,
      score: result.score
    }))
  }

  const removeSource = (source: string): number => {
    const removed = vectorStore.remove(source)
    if (removed > 0) vectorStore.persist()
    return removed
  }

  const getStats = (): RagStats => ({
    totalChunks: vectorStore.size(),
    sources: vectorStore.sources(),
    embeddingModel: embeddingService.getModel()
  })

  const isReady = (): boolean => ready

  return { index, retrieve, removeSource, getStats, isReady }
}
