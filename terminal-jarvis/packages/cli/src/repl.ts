import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import type { CliContext } from './context.js'
import { formatResponse } from './render/format-response.js'

export interface ReplOptions {
  initialModel?: string
}

const printHelp = (): void => {
  console.log('/model <id>   switch model')
  console.log('/clear        clear terminal')
  console.log('/save         show last transcript id')
  console.log('/exit         exit repl')
}

export const runRepl = async (context: CliContext, options: ReplOptions = {}): Promise<void> => {
  const rl = readline.createInterface({
    input,
    output,
    terminal: true
  })

  let currentModel = options.initialModel ?? context.configManager.get('defaultModel')
  let lastConversationId: string | null = null

  console.log(`Terminal Jarvis REPL (${context.provider} engine, model: ${currentModel})`)
  console.log('Type /help for commands')

  let multilineBuffer = ''
  let running = true

  try {
    while (running) {
      const prompt = multilineBuffer ? '... ' : '❯ '
      const line = await rl.question(prompt)
      const trimmed = line.trim()

      if (!trimmed && !multilineBuffer) {
        continue
      }

      if (trimmed.endsWith('\\')) {
        multilineBuffer += `${trimmed.slice(0, -1)}\n`
        continue
      }

      const fullInput = `${multilineBuffer}${trimmed}`.trim()
      multilineBuffer = ''

      if (fullInput === '/exit') {
        running = false
        continue
      }

      if (fullInput === '/help') {
        printHelp()
        continue
      }

      if (fullInput === '/clear') {
        output.write('\x1Bc')
        continue
      }

      if (fullInput === '/save') {
        const latest = context.transcriptStore.listConversations().at(-1)
        lastConversationId = latest?.id ?? null
        console.log(lastConversationId ? `Last transcript: ${lastConversationId}` : 'No transcript found')
        continue
      }

      if (fullInput.startsWith('/model')) {
        const [, nextModel] = fullInput.split(/\s+/, 2)
        if (!nextModel) {
          console.log(`Current model: ${currentModel}`)
          continue
        }

        const resolved = context.modelManager.resolveModel(nextModel)
        if (!resolved) {
          console.log(`Unknown model: ${nextModel}`)
          continue
        }

        currentModel = resolved.id
        console.log(`Switched model to ${currentModel}`)
        continue
      }

      const stream = context.chatService.streamCompletion({
        model: currentModel,
        messages: [{ role: 'user', content: fullInput }],
        stream: true
      })

      let response = ''
      for await (const chunk of stream) {
        response += chunk.token
        output.write(chunk.token)
      }

      output.write('\n')
      const formatted = formatResponse(response)
      if (formatted !== response.trim()) {
        output.write(`${formatted}\n`)
      }
    }
  } finally {
    rl.close()
  }
}
