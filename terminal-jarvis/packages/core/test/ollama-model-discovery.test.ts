import { describe, expect, it } from 'vitest'
import {
  parseOllamaListEntries,
  parseOllamaListOutput,
  sortOllamaListEntriesFastFirst
} from '../src/services/ollama-model-discovery.js'

describe('ollama-model-discovery', () => {
  it('parses model names from ollama list output', () => {
    const output = `NAME                     ID              SIZE      MODIFIED\nllama3:8b                1b2c3d4e5f6     4.7 GB    3 days ago\nqwen2.5:7b-instruct      abcdef123456    4.4 GB    2 hours ago\n`

    expect(parseOllamaListOutput(output)).toEqual(['llama3:8b', 'qwen2.5:7b-instruct'])
  })

  it('returns empty array when only headers are present', () => {
    const output = 'NAME    ID    SIZE    MODIFIED\n'
    expect(parseOllamaListOutput(output)).toEqual([])
  })

  it('parses ollama list entries with size bytes', () => {
    const output = `NAME                     ID              SIZE      MODIFIED\nllama3.2:3b              1b2c3d4e5f6     2.0 GB    3 days ago\nqwen2.5:0.5b             abcdef123456    397 MB    2 hours ago\n`

    expect(parseOllamaListEntries(output)).toEqual([
      {
        name: 'llama3.2:3b',
        sizeBytes: 2_147_483_648
      },
      {
        name: 'qwen2.5:0.5b',
        sizeBytes: 416_284_672
      }
    ])
  })

  it('sorts chat models before embedding/rerank models, then by smaller size', () => {
    const output = `NAME                     ID              SIZE      MODIFIED\nnomic-embed-text:latest  aaa111          274 MB    2 days ago\nqwen2.5:1.5b             bbb222          986 MB    1 day ago\nqwen2.5:0.5b             ccc333          397 MB    3 hours ago\n`

    const sorted = sortOllamaListEntriesFastFirst(parseOllamaListEntries(output))

    expect(sorted.map((entry) => entry.name)).toEqual([
      'qwen2.5:0.5b',
      'qwen2.5:1.5b',
      'nomic-embed-text:latest'
    ])
  })
})
