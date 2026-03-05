import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { createDesktopServices } from './create-services.js'
import { getHealth, listModels, sendChat, streamChat, toStreamPayload } from './ipc-handlers.js'

const currentDir = __dirname
const services = createDesktopServices()

const createWindow = async (): Promise<BrowserWindow> => {
  const window = new BrowserWindow({
    width: 1100,
    height: 760,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: join(currentDir, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  await window.loadFile(join(currentDir, 'index.html'))
  return window
}

const registerIpc = (): void => {
  ipcMain.handle('chat:send', async (_event, request) => sendChat(services, request))
  ipcMain.handle('model:list', async () => listModels(services))
  ipcMain.handle('health:get', async () => getHealth(services))

  ipcMain.on('chat:stream', async (event, payload: { requestId: string; request: { model?: string; messages: { role: 'user' | 'assistant' | 'system' | 'tool'; content: string }[] } }) => {
    try {
      await streamChat(services, payload.request, (streamEvent) => {
        event.sender.send('chat:stream', toStreamPayload(payload.requestId, streamEvent))
      })
    } catch (error: unknown) {
      event.sender.send(
        'chat:stream',
        toStreamPayload(payload.requestId, {
          type: 'error',
          message: error instanceof Error ? error.message : String(error)
        })
      )
    }
  })
}

app.whenReady().then(async () => {
  registerIpc()

  if (process.env.JARVIS_DESKTOP_SMOKE === '1') {
    app.exit(0)
    return
  }

  await createWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
