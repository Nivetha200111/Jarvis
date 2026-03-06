import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, Notification, screen, shell, desktopCapturer, Tray, Menu, nativeImage } from 'electron'
import { join } from 'node:path'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { homedir, hostname, userInfo, cpus, totalmem, freemem, platform, release } from 'node:os'
import { execSync } from 'node:child_process'
import type { SystemToolCallbacks } from '@jarvis/core'
import { createDesktopServices } from './create-services.js'
import {
  connectObsidianVault,
  disconnectObsidianVault,
  getHealth,
  getObsidianStatus,
  listModels,
  listObsidianNotes,
  ragIndex,
  ragSearch,
  ragRemoveSource,
  ragStats,
  readObsidianNote,
  runAgent,
  searchObsidianNotes,
  sendChat,
  streamChat,
  toAgentStreamPayload,
  toStreamPayload,
  writeObsidianNote
} from './ipc-handlers.js'

const currentDir = __dirname
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isPip = false

if (process.platform === 'linux') {
  const ozonePlatform = process.env.JARVIS_OZONE_PLATFORM?.trim()
  if (ozonePlatform) {
    app.commandLine.appendSwitch('ozone-platform', ozonePlatform)
    app.commandLine.appendSwitch('ozone-platform-hint', ozonePlatform)
  }
  app.commandLine.appendSwitch('disable-features', 'Vulkan')
  app.commandLine.appendSwitch('enable-features', 'UseOzonePlatform')
  app.commandLine.appendSwitch('disable-gpu-compositing')
}

const PIP_WIDTH = 420
const PIP_HEIGHT = 520
const FULL_WIDTH = 1100
const FULL_HEIGHT = 760

const captureScreen = async (): Promise<{ path: string; width: number; height: number; timestamp: string; activeWindow: string }> => {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1920, height: 1080 }
  })

  const primary = sources[0]
  if (!primary) throw new Error('No screen source available')

  const screenshotDir = join(homedir(), '.jarvis', 'screenshots')
  if (!existsSync(screenshotDir)) mkdirSync(screenshotDir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filePath = join(screenshotDir, `screen-${timestamp}.png`)
  const png = primary.thumbnail.toPNG()
  writeFileSync(filePath, png)

  const size = primary.thumbnail.getSize()
  const activeWindow = getActiveWindowInfo()
  return {
    path: filePath,
    width: size.width,
    height: size.height,
    timestamp: new Date().toISOString(),
    activeWindow
  }
}

const getActiveWindowInfo = (): string => {
  try {
    if (process.platform === 'linux') {
      return execSync('xdotool getactivewindow getwindowname 2>/dev/null || echo "unknown"', { encoding: 'utf8', timeout: 3000 }).trim()
    }
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

const getSystemInfo = (): Record<string, string> => {
  const cpu = cpus()
  return {
    hostname: hostname(),
    user: userInfo().username,
    platform: `${platform()} ${release()}`,
    cpu: cpu[0]?.model ?? 'unknown',
    cores: String(cpu.length),
    totalMemGB: (totalmem() / 1073741824).toFixed(1),
    freeMemGB: (freemem() / 1073741824).toFixed(1),
    uptime: `${(process.uptime() / 60).toFixed(0)} min`
  }
}

// System tool callbacks for the agent
const systemCallbacks: SystemToolCallbacks = {
  captureScreen: async () => captureScreen(),
  getSystemInfo: async () => getSystemInfo(),
  getActiveWindow: async () => getActiveWindowInfo(),
  openUrl: async (url: string) => { await shell.openExternal(url) },
  notify: async (title: string, body: string) => {
    new Notification({ title, body }).show()
  },
  getClipboard: async () => clipboard.readText(),
  setClipboard: async (text: string) => { clipboard.writeText(text) }
}

const services = createDesktopServices(systemCallbacks)

const createWindow = async (): Promise<BrowserWindow> => {
  const window = new BrowserWindow({
    width: FULL_WIDTH,
    height: FULL_HEIGHT,
    minWidth: 380,
    minHeight: 300,
    frame: false,
    backgroundColor: '#0a0a0c',
    skipTaskbar: false,
    webPreferences: {
      preload: join(currentDir, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  await window.loadFile(join(currentDir, 'index.html'))
  mainWindow = window

  window.on('closed', () => {
    mainWindow = null
  })

  return window
}

const togglePip = (): void => {
  if (!mainWindow) return

  isPip = !isPip
  if (isPip) {
    const display = screen.getPrimaryDisplay()
    const { width: sw, height: sh } = display.workAreaSize
    mainWindow.setAlwaysOnTop(true, 'floating')
    mainWindow.setSize(PIP_WIDTH, PIP_HEIGHT, true)
    mainWindow.setPosition(sw - PIP_WIDTH - 20, sh - PIP_HEIGHT - 20, true)
    mainWindow.setResizable(true)
    mainWindow.setMinimumSize(320, 240)
  } else {
    mainWindow.setAlwaysOnTop(false)
    mainWindow.setSize(FULL_WIDTH, FULL_HEIGHT, true)
    mainWindow.center()
    mainWindow.setMinimumSize(380, 300)
  }
  mainWindow.webContents.send('pip:changed', isPip)
}

const createTray = (): void => {
  const icon = nativeImage.createFromBuffer(
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAOklEQVQ4y2P4z8BQz0BAwIBLAQMDA0M9AwFAjQKG/wwM/xkYGBgYCCmAGUJIAQMhBfgUMFDiAgYGAOI8EP+mFqjuAAAAAElFTkSuQmCC', 'base64'),
    { width: 16, height: 16 }
  )

  tray = new Tray(icon)
  tray.setToolTip('Jarvis')

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Jarvis', click: () => { mainWindow?.show(); mainWindow?.focus() } },
    { label: 'PiP Mode', click: () => togglePip() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])

  tray.setContextMenu(contextMenu)
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus()
      } else {
        mainWindow.show()
      }
    }
  })
}

const registerIpc = (): void => {
  ipcMain.handle('chat:send', async (_event, request) => sendChat(services, request))
  ipcMain.handle('model:list', async () => listModels(services))
  ipcMain.handle('health:get', async () => getHealth(services))
  ipcMain.handle('obsidian:status', async () => getObsidianStatus(services))
  ipcMain.handle('obsidian:disconnect', async () => disconnectObsidianVault(services))
  ipcMain.handle('obsidian:list', async (_event, payload?: { limit?: number }) =>
    listObsidianNotes(services, payload?.limit)
  )
  ipcMain.handle('obsidian:search', async (_event, payload: { query: string; limit?: number }) =>
    searchObsidianNotes(services, payload.query, payload.limit)
  )
  ipcMain.handle('obsidian:read', async (_event, payload: { path: string }) =>
    readObsidianNote(services, payload.path)
  )
  ipcMain.handle(
    'obsidian:write',
    async (_event, payload: { path: string; content: string; mode?: 'overwrite' | 'append' }) =>
      writeObsidianNote(services, payload.path, payload.content, payload.mode)
  )

  ipcMain.handle('rag:index', async (_event, payload: { source: string; text: string }) =>
    ragIndex(services, payload.source, payload.text)
  )
  ipcMain.handle('rag:search', async (_event, payload: { query: string; limit?: number }) =>
    ragSearch(services, payload.query, payload.limit)
  )
  ipcMain.handle('rag:stats', async () => ragStats(services))
  ipcMain.handle('rag:remove', async (_event, payload: { source: string }) =>
    ragRemoveSource(services, payload.source)
  )

  ipcMain.handle('dialog:open-files', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], title: 'Select files' })
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle('dialog:open-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Select folder' })
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle('obsidian:connect', async (_event, payload?: { vaultPath?: string }) => {
    let vaultPath = payload?.vaultPath?.trim()
    if (!vaultPath) {
      const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Select Obsidian vault' })
      if (result.canceled || result.filePaths.length === 0) return getObsidianStatus(services)
      const selectedPath = result.filePaths[0]
      if (!selectedPath) return getObsidianStatus(services)
      vaultPath = selectedPath
    }
    return connectObsidianVault(services, vaultPath)
  })

  // PiP / window controls
  ipcMain.handle('window:toggle-pip', async () => {
    togglePip()
    return isPip
  })
  ipcMain.handle('window:is-pip', async () => isPip)
  ipcMain.handle('window:minimize', async () => mainWindow?.minimize())
  ipcMain.handle('window:close', async () => mainWindow?.close())

  // Screen capture
  ipcMain.handle('screen:capture', async () => captureScreen())
  ipcMain.handle('screen:active-window', async () => getActiveWindowInfo())
  ipcMain.handle('system:info', async () => getSystemInfo())

  // Streaming handlers
  ipcMain.on('chat:stream', async (event, payload: { requestId: string; request: { model?: string; messages: { role: 'user' | 'assistant' | 'system' | 'tool'; content: string }[] } }) => {
    try {
      await streamChat(services, payload.request, (streamEvent) => {
        event.sender.send('chat:stream', toStreamPayload(payload.requestId, streamEvent))
      })
    } catch (error: unknown) {
      event.sender.send('chat:stream', toStreamPayload(payload.requestId, {
        type: 'error',
        message: error instanceof Error ? error.message : String(error)
      }))
    }
  })

  ipcMain.on('chat:agent', async (event, payload: { requestId: string; model: string; messages: { role: 'user' | 'assistant' | 'system' | 'tool'; content: string }[] }) => {
    try {
      await runAgent(services, { model: payload.model, messages: payload.messages }, (agentEvent) => {
        event.sender.send('chat:agent', toAgentStreamPayload(payload.requestId, agentEvent))
      })
    } catch (error: unknown) {
      event.sender.send('chat:agent', toAgentStreamPayload(payload.requestId, {
        type: 'error',
        message: error instanceof Error ? error.message : String(error)
      }))
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
  createTray()

  // Global hotkey: Ctrl+Shift+J toggles window
  globalShortcut.register('CommandOrControl+Shift+J', () => {
    if (!mainWindow) return
    if (mainWindow.isVisible() && mainWindow.isFocused()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  // Ctrl+Shift+P toggles PiP
  globalShortcut.register('CommandOrControl+Shift+P', () => {
    togglePip()
  })

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow()
    }
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Don't quit — keep tray alive
  }
})
