import type { CliContext } from '../context.js'

export const runModelListCommand = (context: CliContext): void => {
  const models = context.modelManager.list()

  if (models.length === 0) {
    console.log('No models registered')
    return
  }

  for (const model of models) {
    console.log(`${model.id}\t${model.quantization}\tctx=${model.contextLength}\t${model.path}`)
  }
}
