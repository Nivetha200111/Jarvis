import { Readable, Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { createCliContext } from '../src/context.js'
import { runOneShotChat } from '../src/chat-runner.js'
import { runPipeMode } from '../src/pipe-mode.js'

process.env.JARVIS_ENGINE = 'mock'

describe('CLI behavior', () => {
  it('produces one-shot chat output', async () => {
    const context = createCliContext()
    const output = await runOneShotChat(context, 'integration prompt', 'llama3')

    expect(output).toContain('Mock reply')
    expect(output).toContain('integration prompt')
  })

  it('reads stdin and writes stdout in pipe mode', async () => {
    const context = createCliContext()
    const input = Readable.from(['pipe prompt']) as NodeJS.ReadStream

    let buffer = ''
    const output = new Writable({
      write(chunk, _encoding, callback) {
        buffer += chunk.toString()
        callback()
      }
    }) as unknown as NodeJS.WriteStream

    await runPipeMode(context, 'llama3', input, output)

    expect(buffer).toContain('Mock reply')
    expect(buffer).toContain('pipe prompt')
  })
})
