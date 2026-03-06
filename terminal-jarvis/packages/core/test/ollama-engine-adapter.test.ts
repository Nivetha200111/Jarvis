import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelInfo } from '../src/types/index.js'
import { createModelManager } from '../src/services/model-manager.js'
import { createOllamaEngineAdapter } from '../src/engine/ollama-engine-adapter.js'

const originalFetch = globalThis.fetch

const TEST_MODEL: ModelInfo = {
  id: 'qwen2.5:1.5b',
  name: 'qwen2.5:1.5b',
  path: 'ollama://qwen2.5:1.5b',
  sizeBytes: 0,
  quantization: 'unknown',
  contextLength: 0
}

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('ollama-engine-adapter', () => {
  it('sends keep_alive and mapped generation options to Ollama', async () => {
    const fetchMock = vi.fn(async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder()
          controller.enqueue(
            encoder.encode(JSON.stringify({ message: { content: 'hello ' }, done: false }) + '\n')
          )
          controller.enqueue(
            encoder.encode(JSON.stringify({ done: true, prompt_eval_count: 12, eval_count: 3 }) + '\n')
          )
          controller.close()
        }
      })

      return new Response(stream, { status: 200 })
    })
    globalThis.fetch = fetchMock as typeof globalThis.fetch

    const modelManager = createModelManager({
      seedModels: [TEST_MODEL]
    })
    const adapter = createOllamaEngineAdapter({
      modelManager,
      baseUrl: 'http://127.0.0.1:11434',
      keepAlive: '45m',
      requestTimeoutMs: 1_000
    })

    await adapter.loadModel(TEST_MODEL.id)

    const chunks: string[] = []
    for await (const chunk of adapter.generate(
      [{ role: 'user', content: 'hi', images: ['base64-image'] }],
      { maxTokens: 64, temperature: 0.2, topP: 0.9 }
    )) {
      chunks.push(chunk.token)
    }

    expect(chunks.join('')).toBe('hello ')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [, init] = fetchMock.mock.calls[0] ?? []
    const body = JSON.parse(String(init?.body)) as {
      keep_alive?: string
      options?: Record<string, number>
      messages?: Array<{ images?: string[] }>
    }
    expect(body.keep_alive).toBe('45m')
    expect(body.messages?.[0]?.images).toEqual(['base64-image'])
    expect(body.options).toMatchObject({
      num_predict: 64,
      temperature: 0.2,
      top_p: 0.9
    })
  })

  it('fails with a timeout error when Ollama does not respond', async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => {
      const signal = init?.signal
      signal?.addEventListener('abort', () => {
        const abortError = new Error('aborted')
        abortError.name = 'AbortError'
        reject(abortError)
      })
    }))
    globalThis.fetch = fetchMock as typeof globalThis.fetch

    const modelManager = createModelManager({
      seedModels: [TEST_MODEL]
    })
    const adapter = createOllamaEngineAdapter({
      modelManager,
      baseUrl: 'http://127.0.0.1:11434',
      requestTimeoutMs: 10
    })

    await adapter.loadModel(TEST_MODEL.id)

    const iterator = adapter.generate([{ role: 'user', content: 'timeout please' }])
    await expect(iterator.next()).rejects.toThrow(/timed out/i)
  })
})
