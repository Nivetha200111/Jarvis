import { stdin as defaultInput, stdout as defaultOutput } from 'node:process'
import { runOneShotChat } from './chat-runner.js'
import type { CliContext } from './context.js'

const readStdin = async (input: NodeJS.ReadStream): Promise<string> => {
  let data = ''

  for await (const chunk of input) {
    data += chunk.toString()
  }

  return data.trim()
}

export const runPipeMode = async (
  context: CliContext,
  model?: string,
  input: NodeJS.ReadStream = defaultInput,
  output: NodeJS.WriteStream = defaultOutput
): Promise<void> => {
  const prompt = await readStdin(input)
  if (!prompt) {
    throw new Error('No input provided on stdin for --pipe mode')
  }

  const response = await runOneShotChat(context, prompt, model)
  output.write(`${response}\n`)
}
