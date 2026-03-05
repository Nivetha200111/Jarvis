export interface ServeOptions {
  port?: number
  model?: string
}

export const runServeCommand = async (options: ServeOptions): Promise<void> => {
  const { startApiServer } = await import('@jarvis/api')
  const { address } = await startApiServer({
    port: options.port,
    model: options.model
  })

  console.log(`Jarvis API running at ${address}`)
}
