import type { CliContext } from './context.js'
import { formatResponse } from './render/format-response.js'

export const runOneShotChat = async (
  context: CliContext,
  prompt: string,
  model?: string
): Promise<string> => {
  const completion = await context.chatService.generateCompletion({
    model,
    messages: [{ role: 'user', content: prompt }],
    stream: false
  })

  return formatResponse(completion.content)
}
