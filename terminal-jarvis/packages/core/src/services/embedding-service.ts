const DEFAULT_EMBED_MODEL = 'nomic-embed-text'

export interface EmbeddingService {
  embed(texts: string[]): Promise<number[][]>
  getModel(): string
  ensureModel(): Promise<void>
}

export interface CreateEmbeddingServiceOptions {
  model?: string
  baseUrl?: string
}

export const createEmbeddingService = (
  options: CreateEmbeddingServiceOptions = {}
): EmbeddingService => {
  const model = options.model ?? DEFAULT_EMBED_MODEL
  const baseUrl = options.baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434'

  const embed = async (texts: string[]): Promise<number[][]> => {
    if (texts.length === 0) return []

    const response = await fetch(`${baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: texts })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Ollama embed failed (${response.status}): ${errorText}`)
    }

    const data = (await response.json()) as { embeddings: number[][] }
    return data.embeddings
  }

  const ensureModel = async (): Promise<void> => {
    // Check if model exists by trying to list it
    try {
      const response = await fetch(`${baseUrl}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model })
      })

      if (response.ok) return // Model already exists
    } catch {
      // Ollama may not be running — skip silently
      return
    }

    // Pull the model
    try {
      const response = await fetch(`${baseUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model, stream: false })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`Failed to pull embedding model ${model}: ${errorText}`)
      }
    } catch {
      // Ollama not available — RAG will be degraded but app still works
    }
  }

  return { embed, getModel: () => model, ensureModel }
}
