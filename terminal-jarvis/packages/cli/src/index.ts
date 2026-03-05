import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import { runOneShotChat } from './chat-runner.js'
import { runModelListCommand } from './commands/model-list.js'
import { runServeCommand } from './commands/serve.js'
import { createCliContext } from './context.js'
import { runPipeMode } from './pipe-mode.js'
import { runRepl } from './repl.js'

export const createProgram = (): Command => {
  const context = createCliContext()

  const program = new Command()
  program
    .name('jarvis')
    .description('Terminal Jarvis local assistant CLI')
    .option('--pipe', 'read prompt from stdin and print a single response')

  program
    .command('chat [prompt]')
    .description('Run one-shot chat if prompt is provided, else open REPL')
    .option('-m, --model <model>', 'model id or alias')
    .option('-p, --prompt <prompt>', 'explicit prompt text')
    .action(async (prompt: string | undefined, options: { model?: string; prompt?: string }) => {
      const resolvedPrompt = options.prompt ?? prompt
      if (resolvedPrompt) {
        const response = await runOneShotChat(context, resolvedPrompt, options.model)
        console.log(response)
        return
      }

      await runRepl(context, { initialModel: options.model })
    })

  const model = program.command('model').description('Model commands')
  model
    .command('list')
    .description('List available local models')
    .action(() => {
      runModelListCommand(context)
    })

  program
    .command('serve')
    .description('Start REST API server')
    .option('-p, --port <port>', 'port to listen on', (value: string) => Number.parseInt(value, 10))
    .option('-m, --model <model>', 'default model alias/id')
    .action(async (options: { port?: number; model?: string }) => {
      await runServeCommand(options)
    })

  return program
}

export const run = async (argv: string[]): Promise<void> => {
  const context = createCliContext()
  const hasSubcommand = argv.some((arg) => ['chat', 'model', 'serve'].includes(arg))
  const usePipeMode = argv.includes('--pipe')

  if (usePipeMode) {
    const modelIndex = argv.findIndex((arg) => arg === '--model' || arg === '-m')
    const model = modelIndex >= 0 ? argv[modelIndex + 1] : undefined
    await runPipeMode(context, model)
    return
  }

  if (!hasSubcommand && argv.length === 0) {
    await runRepl(context)
    return
  }

  const program = createProgram()
  await program.parseAsync(['node', 'jarvis', ...argv])
}

const isDirectExecution = (): boolean => {
  if (!process.argv[1]) {
    return false
  }

  const currentFile = fileURLToPath(import.meta.url)
  return path.resolve(process.argv[1]) === currentFile
}

if (isDirectExecution()) {
  run(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exit(1)
  })
}
