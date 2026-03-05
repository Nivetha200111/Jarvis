import { describe, expect, it } from 'vitest'
import { parseOllamaListOutput } from '../src/services/ollama-model-discovery.js'

describe('ollama-model-discovery', () => {
  it('parses model names from ollama list output', () => {
    const output = `NAME                     ID              SIZE      MODIFIED\nllama3:8b                1b2c3d4e5f6     4.7 GB    3 days ago\nqwen2.5:7b-instruct      abcdef123456    4.4 GB    2 hours ago\n`

    expect(parseOllamaListOutput(output)).toEqual(['llama3:8b', 'qwen2.5:7b-instruct'])
  })

  it('returns empty array when only headers are present', () => {
    const output = 'NAME    ID    SIZE    MODIFIED\n'
    expect(parseOllamaListOutput(output)).toEqual([])
  })
})
