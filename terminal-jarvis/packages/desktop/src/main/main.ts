import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, Notification, screen, shell, desktopCapturer, Tray, Menu, nativeImage, session } from 'electron'
import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { homedir, hostname, userInfo, cpus, totalmem, freemem, platform, release } from 'node:os'
import { execFileSync, execSync, spawn } from 'node:child_process'
import type { AddressInfo } from 'node:net'
import { discoverOllamaModels, type CalendarEventInput, type ModelInfo, type SystemToolCallbacks } from '@jarvis/core'
import { createDesktopServices } from './create-services.js'
import {
  calendarAddEvent,
  calendarListEvents,
  calendarStats,
  calendarUpcomingEvents,
  connectObsidianVault,
  disconnectObsidianVault,
  getHealth,
  getObsidianStatus,
  getToolPermissions,
  listModels,
  listRecentAuditRecords,
  listObsidianNotes,
  ragIndex,
  recordAuditEvent,
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
let prePipBounds: Electron.Rectangle | null = null
let displayCaptureConfigured = false

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
const GOOGLE_AUTH_TIMEOUT_MS = 180_000
const GOOGLE_TOKEN_PATH = join(homedir(), '.jarvis', 'calendar', 'google-oauth.json')
const GOOGLE_SYNC_LOOKBACK_DAYS = 7
const GOOGLE_SYNC_LOOKAHEAD_DAYS = 365
const MS_PER_DAY = 86_400_000
const OLLAMA_LIBRARY_TAGS_URL = 'https://ollama.com/api/tags'
const OLLAMA_CATALOG_TIMEOUT_MS = 20_000
const ONBOARDING_STATE_PATH = join(homedir(), '.jarvis', 'desktop-onboarding.json')
const BASELINE_MODEL_IDS = [
  'qwen2.5:3b',
  'qwen2.5:1.5b',
  'qwen2.5',
  'qwen2.5vl:3b',
  'qwen2.5-vl:3b',
  'llava:7b',
  'llava',
  'nomic-embed-text'
] as const
const BASELINE_MODEL_SET = new Set<string>(BASELINE_MODEL_IDS)
const OLLAMA_MODEL_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._/-]*[a-z0-9])?(?::[a-z0-9._-]+)?$/i
const activeModelPulls = new Set<string>()
const DESKTOP_E2E_MODE = process.env.JARVIS_DESKTOP_E2E === '1'

interface GoogleTokenState {
  accessToken: string
  refreshToken?: string
  expiresAt: number
}

interface GoogleCalendarImportResult {
  imported: number
  total: number
  warning?: string
}

interface GoogleCalendarDateTime {
  dateTime?: string
  date?: string
}

interface GoogleCalendarApiEvent {
  id?: string
  status?: string
  summary?: string
  description?: string
  location?: string
  start?: GoogleCalendarDateTime
  end?: GoogleCalendarDateTime
  updated?: string
}

interface GoogleCalendarApiResponse {
  items?: GoogleCalendarApiEvent[]
  nextPageToken?: string
}

interface OllamaLibraryModel {
  name?: string
  model?: string
  modified_at?: string
  size?: number
  details?: {
    family?: string
    families?: string[] | null
    parameter_size?: string
    quantization_level?: string
  }
}

interface OllamaCatalogModel {
  id: string
  name: string
  sizeBytes: number
  modifiedAt: string | null
  family: string
  parameterSize: string
  quantization: string
  installed: boolean
  baseline: boolean
}

interface OllamaCatalogResponse {
  models: OllamaCatalogModel[]
  installedModelIds: string[]
  baselineModelIds: string[]
  source: 'remote' | 'installed' | 'none'
  warning?: string
}

interface OllamaStatusResponse {
  installed: boolean
  running: boolean
  provider: 'mock' | 'ollama'
  warning?: string
}

interface OnboardingState {
  complete: boolean
  selectedExtraModels: string[]
  completedAt: string | null
}

interface OllamaPullProgressEvent {
  requestId: string
  modelId: string
  type: 'progress' | 'done' | 'error'
  message: string
}

interface DesktopE2EConfig {
  ollamaStatus?: Partial<OllamaStatusResponse>
  catalog?: {
    models?: Array<Partial<OllamaCatalogModel> & { id: string }>
    installedModelIds?: string[]
    baselineModelIds?: string[]
    source?: OllamaCatalogResponse['source']
    warning?: string
  }
  pullScenarios?: Record<string, string[]>
  dialogSelections?: {
    folderPaths?: string[]
    filePaths?: string[]
  }
  googleCalendarImport?: GoogleCalendarImportResult
  screenCapture?: {
    path?: string
    width?: number
    height?: number
    timestamp?: string
    activeWindow?: string
    imageBase64?: string
  }
}

const toBase64Url = (value: Buffer): string =>
  value
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')

const createPkcePair = (): { verifier: string; challenge: string } => {
  const verifier = toBase64Url(randomBytes(48))
  const challenge = toBase64Url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

const parseJsonEnv = <T>(name: string): T | null => {
  const raw = process.env[name]?.trim()
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

const desktopE2EConfig = DESKTOP_E2E_MODE
  ? parseJsonEnv<DesktopE2EConfig>('JARVIS_DESKTOP_E2E_CONFIG')
  : null
const desktopE2EInstalledModelIds = new Set<string>()
const desktopE2ECatalogModels = new Map<string, OllamaCatalogModel>()

const toDesktopE2ECatalogModel = (
  input: Partial<OllamaCatalogModel> & { id: string },
  installedIds: Set<string>,
  baselineIds: Set<string>
): OllamaCatalogModel => ({
  id: input.id,
  name: input.name?.trim() || input.id,
  sizeBytes: typeof input.sizeBytes === 'number' ? input.sizeBytes : 0,
  modifiedAt: typeof input.modifiedAt === 'string' ? input.modifiedAt : null,
  family: input.family?.trim() || 'general',
  parameterSize: input.parameterSize?.trim() || '',
  quantization: input.quantization?.trim() || '',
  installed: input.installed === true || installedIds.has(input.id),
  baseline: input.baseline === true || baselineIds.has(input.id)
})

if (DESKTOP_E2E_MODE) {
  const configuredBaselineIds = desktopE2EConfig?.catalog?.baselineModelIds
    ? sanitizeModelIds(desktopE2EConfig.catalog.baselineModelIds)
    : [...BASELINE_MODEL_SET]
  const baselineIds = new Set<string>(configuredBaselineIds)
  const configuredInstalledIds = desktopE2EConfig?.catalog?.installedModelIds
    ? sanitizeModelIds(desktopE2EConfig.catalog.installedModelIds)
    : configuredBaselineIds

  for (const modelId of configuredInstalledIds) {
    desktopE2EInstalledModelIds.add(modelId)
  }

  const configuredModels = desktopE2EConfig?.catalog?.models ?? []
  for (const model of configuredModels) {
    desktopE2ECatalogModels.set(
      model.id,
      toDesktopE2ECatalogModel(model, desktopE2EInstalledModelIds, baselineIds)
    )
  }

  for (const modelId of baselineIds) {
    if (!desktopE2ECatalogModels.has(modelId)) {
      desktopE2ECatalogModels.set(modelId, {
        id: modelId,
        name: modelId,
        sizeBytes: 0,
        modifiedAt: null,
        family: modelId.includes('embed') ? 'embedding' : modelId.includes('vl') || modelId.includes('llava') ? 'vision' : 'chat',
        parameterSize: '',
        quantization: '',
        installed: desktopE2EInstalledModelIds.has(modelId),
        baseline: true
      })
    }
  }
}

const loadGoogleTokenState = (): GoogleTokenState | null => {
  if (!existsSync(GOOGLE_TOKEN_PATH)) {
    return null
  }

  try {
    const parsed = JSON.parse(readFileSync(GOOGLE_TOKEN_PATH, 'utf8')) as GoogleTokenState
    if (!parsed.accessToken || !Number.isFinite(parsed.expiresAt)) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

const saveGoogleTokenState = (state: GoogleTokenState): void => {
  const dir = join(homedir(), '.jarvis', 'calendar')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(GOOGLE_TOKEN_PATH, JSON.stringify(state), 'utf8')
}

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const raced = await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new Error(`Timed out after ${timeoutMs}ms`))
        })
      })
    ])
    return raced as T
  } finally {
    clearTimeout(timeout)
  }
}

const defaultOnboardingState = (): OnboardingState => ({
  complete: false,
  selectedExtraModels: [],
  completedAt: null
})

function sanitizeModelIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return [...new Set(
    value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => OLLAMA_MODEL_ID_PATTERN.test(entry))
  )]
}

const loadOnboardingState = (): OnboardingState => {
  if (!existsSync(ONBOARDING_STATE_PATH)) {
    return defaultOnboardingState()
  }

  try {
    const parsed = JSON.parse(readFileSync(ONBOARDING_STATE_PATH, 'utf8')) as Partial<OnboardingState>
    return {
      complete: parsed.complete === true,
      selectedExtraModels: sanitizeModelIds(parsed.selectedExtraModels),
      completedAt: typeof parsed.completedAt === 'string' ? parsed.completedAt : null
    }
  } catch {
    return defaultOnboardingState()
  }
}

const getDesktopE2EInstalledModels = (): ModelInfo[] => {
  if (!DESKTOP_E2E_MODE) {
    return []
  }

  return [...desktopE2EInstalledModelIds]
    .map((modelId) => {
      const catalogModel = desktopE2ECatalogModels.get(modelId)
      return {
        id: modelId,
        name: catalogModel?.name ?? modelId,
        path: `ollama://${modelId}`,
        sizeBytes: catalogModel?.sizeBytes ?? 0,
        quantization: catalogModel?.quantization ?? '',
        contextLength: 32_768
      } satisfies ModelInfo
    })
    .sort((left, right) => left.id.localeCompare(right.id))
}

const saveOnboardingState = (nextState: Partial<OnboardingState>): OnboardingState => {
  const current = loadOnboardingState()
  const merged: OnboardingState = {
    complete: nextState.complete ?? current.complete,
    selectedExtraModels: nextState.selectedExtraModels
      ? sanitizeModelIds(nextState.selectedExtraModels)
      : current.selectedExtraModels,
    completedAt: nextState.completedAt ?? current.completedAt
  }

  const dir = join(homedir(), '.jarvis')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(ONBOARDING_STATE_PATH, JSON.stringify(merged, null, 2), 'utf8')
  return merged
}

const isOllamaInstalled = (): boolean => {
  if (DESKTOP_E2E_MODE) {
    return desktopE2EConfig?.ollamaStatus?.installed ?? true
  }

  try {
    execFileSync('ollama', ['--version'], { stdio: 'pipe', shell: process.platform === 'win32' })
    return true
  } catch {
    return false
  }
}

const getInstalledOllamaModels = (): ModelInfo[] => {
  if (DESKTOP_E2E_MODE) {
    return getDesktopE2EInstalledModels()
  }

  try {
    return discoverOllamaModels()
  } catch {
    return []
  }
}

const isOllamaResponsive = (): boolean => {
  if (DESKTOP_E2E_MODE) {
    return desktopE2EConfig?.ollamaStatus?.running ?? true
  }

  try {
    execFileSync('ollama', ['list'], { stdio: 'pipe', shell: process.platform === 'win32' })
    return true
  } catch {
    return false
  }
}

const getOllamaStatus = (): OllamaStatusResponse => {
  if (DESKTOP_E2E_MODE) {
    const provider = desktopE2EConfig?.ollamaStatus?.provider ?? 'ollama'
    return {
      installed: desktopE2EConfig?.ollamaStatus?.installed ?? true,
      running: desktopE2EConfig?.ollamaStatus?.running ?? true,
      provider,
      warning: desktopE2EConfig?.ollamaStatus?.warning
    }
  }

  const installed = isOllamaInstalled()
  const installedModels = installed ? getInstalledOllamaModels() : []
  const running = installed && isOllamaResponsive()

  let warning: string | undefined
  if (!installed) {
    warning = 'Ollama is not installed on this machine yet.'
  } else if (!running) {
    warning = 'Ollama is installed but not responding. Start Ollama before pulling extra models.'
  } else if (installedModels.length === 0 && services.provider !== 'ollama') {
    warning = 'No local Ollama models are active yet. Jarvis may still be running with mock fallback until restart.'
  } else if (services.provider !== 'ollama' && installedModels.length > 0) {
    warning = 'Jarvis started without Ollama as the active runtime. Restart after model install if you want Ollama responses in this session.'
  }

  return {
    installed,
    running,
    provider: services.provider,
    warning
  }
}

const normalizeCatalogModel = (
  model: OllamaLibraryModel,
  installedModelIds: Set<string>
): OllamaCatalogModel | null => {
  const id = model.model?.trim() || model.name?.trim()
  if (!id) {
    return null
  }

  const family = model.details?.family
    || model.details?.families?.find((entry) => typeof entry === 'string' && entry.trim().length > 0)
    || 'general'

  return {
    id,
    name: id,
    sizeBytes: typeof model.size === 'number' ? model.size : 0,
    modifiedAt: typeof model.modified_at === 'string' ? model.modified_at : null,
    family,
    parameterSize: model.details?.parameter_size ?? '',
    quantization: model.details?.quantization_level ?? '',
    installed: installedModelIds.has(id),
    baseline: BASELINE_MODEL_SET.has(id)
  }
}

const toFallbackCatalogModel = (model: ModelInfo): OllamaCatalogModel => ({
  id: model.id,
  name: model.name,
  sizeBytes: model.sizeBytes,
  modifiedAt: null,
  family: 'local',
  parameterSize: '',
  quantization: model.quantization,
  installed: true,
  baseline: BASELINE_MODEL_SET.has(model.id)
})

const sortCatalogModels = (models: OllamaCatalogModel[]): OllamaCatalogModel[] =>
  [...models].sort((left, right) => {
    const leftTime = left.modifiedAt ? Date.parse(left.modifiedAt) : 0
    const rightTime = right.modifiedAt ? Date.parse(right.modifiedAt) : 0
    if (rightTime !== leftTime) {
      return rightTime - leftTime
    }
    return left.id.localeCompare(right.id)
  })

const getOllamaCatalog = async (): Promise<OllamaCatalogResponse> => {
  if (DESKTOP_E2E_MODE) {
    const source = desktopE2EConfig?.catalog?.source ?? 'remote'
    const baselineModelIds = desktopE2EConfig?.catalog?.baselineModelIds
      ? sanitizeModelIds(desktopE2EConfig.catalog.baselineModelIds)
      : [...BASELINE_MODEL_SET]

    const models = [...desktopE2ECatalogModels.values()].map((model) => ({
      ...model,
      installed: desktopE2EInstalledModelIds.has(model.id),
      baseline: model.baseline || baselineModelIds.includes(model.id)
    }))

    return {
      models: sortCatalogModels(models),
      installedModelIds: [...desktopE2EInstalledModelIds].sort((left, right) => left.localeCompare(right)),
      baselineModelIds,
      source,
      warning: desktopE2EConfig?.catalog?.warning
    }
  }

  const installedModels = getInstalledOllamaModels()
  const installedIds = new Set(installedModels.map((model) => model.id))

  try {
    const response = await withTimeout(fetch(OLLAMA_LIBRARY_TAGS_URL), OLLAMA_CATALOG_TIMEOUT_MS)
    if (!response.ok) {
      throw new Error(`Catalog request failed with status ${response.status}`)
    }

    const payload = await response.json() as { models?: OllamaLibraryModel[] }
    const deduped = new Map<string, OllamaCatalogModel>()

    for (const model of payload.models ?? []) {
      const normalized = normalizeCatalogModel(model, installedIds)
      if (!normalized) {
        continue
      }
      deduped.set(normalized.id, normalized)
    }

    return {
      models: sortCatalogModels([...deduped.values()]),
      installedModelIds: [...installedIds],
      baselineModelIds: [...BASELINE_MODEL_SET],
      source: 'remote'
    }
  } catch (error: unknown) {
    const warning = error instanceof Error ? error.message : String(error)
    return {
      models: sortCatalogModels(installedModels.map(toFallbackCatalogModel)),
      installedModelIds: [...installedIds],
      baselineModelIds: [...BASELINE_MODEL_SET],
      source: installedModels.length > 0 ? 'installed' : 'none',
      warning: installedModels.length > 0
        ? `Could not load the live Ollama catalog. Showing installed models only. ${warning}`
        : `Could not load the live Ollama catalog. ${warning}`
    }
  }
}

const stripAnsi = (value: string): string => {
  let result = ''

  for (let index = 0; index < value.length; index += 1) {
    const charCode = value.charCodeAt(index)
    if (charCode !== 27) {
      result += value[index] ?? ''
      continue
    }

    index += 1
    while (index < value.length) {
      const nextCode = value.charCodeAt(index)
      if (nextCode >= 64 && nextCode <= 126) {
        break
      }
      index += 1
    }
  }

  return result
}

const emitModelPullEvent = (
  sender: Electron.WebContents,
  payload: OllamaPullProgressEvent
): void => {
  if (!sender.isDestroyed()) {
    sender.send('ollama:model-pull', payload)
  }
}

const runOllamaModelPull = async (
  sender: Electron.WebContents,
  requestId: string,
  modelId: string
): Promise<void> => {
  if (DESKTOP_E2E_MODE) {
    const messages = desktopE2EConfig?.pullScenarios?.[modelId] ?? [
      `Resolving ${modelId}...`,
      `Pulling ${modelId} layers...`,
      `${modelId} verified.`
    ]

    for (const message of messages) {
      emitModelPullEvent(sender, {
        requestId,
        modelId,
        type: 'progress',
        message
      })
      await new Promise((resolve) => setTimeout(resolve, 25))
    }

    desktopE2EInstalledModelIds.add(modelId)
    const existing = desktopE2ECatalogModels.get(modelId)
    desktopE2ECatalogModels.set(modelId, {
      id: modelId,
      name: existing?.name ?? modelId,
      sizeBytes: existing?.sizeBytes ?? 0,
      modifiedAt: existing?.modifiedAt ?? new Date().toISOString(),
      family: existing?.family ?? 'general',
      parameterSize: existing?.parameterSize ?? '',
      quantization: existing?.quantization ?? '',
      installed: true,
      baseline: existing?.baseline ?? BASELINE_MODEL_SET.has(modelId)
    })

    emitModelPullEvent(sender, {
      requestId,
      modelId,
      type: 'done',
      message: `${modelId} ready`
    })
    return
  }

  if (!OLLAMA_MODEL_ID_PATTERN.test(modelId)) {
    emitModelPullEvent(sender, {
      requestId,
      modelId,
      type: 'error',
      message: 'Invalid Ollama model id.'
    })
    return
  }

  if (!isOllamaInstalled()) {
    emitModelPullEvent(sender, {
      requestId,
      modelId,
      type: 'error',
      message: 'Ollama is not installed. Install Ollama before pulling extra models.'
    })
    return
  }

  if (activeModelPulls.has(modelId)) {
    emitModelPullEvent(sender, {
      requestId,
      modelId,
      type: 'error',
      message: `A pull is already in progress for ${modelId}.`
    })
    return
  }

  activeModelPulls.add(modelId)
  let lastMessage = `Starting pull for ${modelId}...`
  emitModelPullEvent(sender, {
    requestId,
    modelId,
    type: 'progress',
    message: lastMessage
  })

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('ollama', ['pull', modelId], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32'
      })

      const handleChunk = (chunk: Buffer): void => {
        const lines = stripAnsi(chunk.toString('utf8'))
          .split(/[\r\n]+/u)
          .map((line) => line.trim())
          .filter(Boolean)

        for (const line of lines) {
          if (line === lastMessage) {
            continue
          }
          lastMessage = line
          emitModelPullEvent(sender, {
            requestId,
            modelId,
            type: 'progress',
            message: line
          })
        }
      }

      child.stdout.on('data', handleChunk)
      child.stderr.on('data', handleChunk)
      child.once('error', reject)
      child.once('close', (code) => {
        if (code === 0) {
          resolve()
          return
        }

        reject(new Error(lastMessage || `ollama pull ${modelId} exited with code ${code ?? 'unknown'}`))
      })
    })

    services.refreshModels()
    emitModelPullEvent(sender, {
      requestId,
      modelId,
      type: 'done',
      message: `${modelId} ready`
    })
  } catch (error: unknown) {
    emitModelPullEvent(sender, {
      requestId,
      modelId,
      type: 'error',
      message: error instanceof Error ? error.message : String(error)
    })
  } finally {
    activeModelPulls.delete(modelId)
  }
}

const fetchGoogleTokens = async (
  body: URLSearchParams
): Promise<{ access_token: string; expires_in: number; refresh_token?: string }> => {
  const response = await withTimeout(
    fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    }),
    GOOGLE_AUTH_TIMEOUT_MS
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Google OAuth token exchange failed (${response.status}): ${errorText}`)
  }

  return response.json() as Promise<{ access_token: string; expires_in: number; refresh_token?: string }>
}

const exchangeGoogleAuthCode = async (
  clientId: string,
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<GoogleTokenState> => {
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri
  })

  const tokenResponse = await fetchGoogleTokens(body)
  return {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    expiresAt: Date.now() + Math.max(1, tokenResponse.expires_in - 60) * 1000
  }
}

const refreshGoogleAccessToken = async (
  clientId: string,
  refreshToken: string
): Promise<GoogleTokenState> => {
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  })
  const tokenResponse = await fetchGoogleTokens(body)
  return {
    accessToken: tokenResponse.access_token,
    refreshToken,
    expiresAt: Date.now() + Math.max(1, tokenResponse.expires_in - 60) * 1000
  }
}

const runGoogleOAuthFlow = async (clientId: string): Promise<GoogleTokenState> => {
  const { verifier, challenge } = createPkcePair()
  const state = toBase64Url(randomBytes(24))
  const server = createServer()

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve())
    })

    const { port } = server.address() as AddressInfo
    const redirectUri = `http://127.0.0.1:${port}/oauth2callback`

    const codePromise = new Promise<string>((resolve, reject) => {
      server.on('request', (req, res) => {
        const parsed = new URL(req.url ?? '/', redirectUri)
        if (parsed.pathname !== '/oauth2callback') {
          res.writeHead(404, { 'Content-Type': 'text/plain' })
          res.end('Not found')
          return
        }

        const returnedState = parsed.searchParams.get('state')
        const code = parsed.searchParams.get('code')
        const authError = parsed.searchParams.get('error')

        if (authError) {
          res.writeHead(400, { 'Content-Type': 'text/plain' })
          res.end('Google authorization failed. You can close this tab.')
          reject(new Error(`Google authorization failed: ${authError}`))
          return
        }

        if (!returnedState || returnedState !== state || !code) {
          res.writeHead(400, { 'Content-Type': 'text/plain' })
          res.end('Invalid OAuth callback state. You can close this tab.')
          return
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<html><body><h3>Google Calendar connected.</h3><p>You can close this tab and return to Jarvis.</p></body></html>')
        resolve(code)
      })
    })

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar.readonly')
    authUrl.searchParams.set('access_type', 'offline')
    authUrl.searchParams.set('prompt', 'consent')
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('code_challenge', challenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')

    await shell.openExternal(authUrl.toString())

    const code = await Promise.race([
      codePromise,
      new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error('Google OAuth authorization timed out.')), GOOGLE_AUTH_TIMEOUT_MS)
      })
    ])

    const tokenState = await exchangeGoogleAuthCode(clientId, code, verifier, redirectUri)
    saveGoogleTokenState(tokenState)
    return tokenState
  } finally {
    server.close()
  }
}

const isGoogleTokenUsable = (state: GoogleTokenState): boolean =>
  state.expiresAt > Date.now() + 30_000

const ensureGoogleTokenState = async (clientId: string): Promise<GoogleTokenState> => {
  const existing = loadGoogleTokenState()
  if (existing && isGoogleTokenUsable(existing)) {
    return existing
  }

  if (existing?.refreshToken) {
    try {
      const refreshed = await refreshGoogleAccessToken(clientId, existing.refreshToken)
      saveGoogleTokenState(refreshed)
      return refreshed
    } catch {
      // Refresh can fail when token was revoked; fall through to interactive auth.
    }
  }

  const authorized = await runGoogleOAuthFlow(clientId)
  saveGoogleTokenState(authorized)
  return authorized
}

const parseGoogleCalendarTime = (
  value: GoogleCalendarDateTime | undefined
): { timestamp: number; allDay: boolean } | null => {
  if (!value) {
    return null
  }

  if (value.dateTime) {
    const timestamp = Date.parse(value.dateTime)
    if (!Number.isNaN(timestamp)) {
      return { timestamp, allDay: false }
    }
  }

  if (value.date) {
    const timestamp = Date.parse(`${value.date}T00:00:00`)
    if (!Number.isNaN(timestamp)) {
      return { timestamp, allDay: true }
    }
  }

  return null
}

const toGoogleCalendarInput = (event: GoogleCalendarApiEvent): CalendarEventInput | null => {
  if (!event.id || event.status === 'cancelled') {
    return null
  }

  const start = parseGoogleCalendarTime(event.start)
  if (!start) {
    return null
  }

  const end = parseGoogleCalendarTime(event.end)
  const fallbackEnd = start.timestamp + (start.allDay ? MS_PER_DAY : 3_600_000)
  const parsedEnd = end?.timestamp ?? fallbackEnd
  const endTime = parsedEnd > start.timestamp ? parsedEnd : fallbackEnd

  return {
    id: `google:${event.id}`,
    title: event.summary?.trim() || '(Untitled event)',
    description: event.description?.trim() || '',
    location: event.location?.trim() || '',
    startTime: start.timestamp,
    endTime,
    allDay: start.allDay,
    source: 'google',
    updatedAt: event.updated ? Date.parse(event.updated) || Date.now() : Date.now()
  }
}

const fetchGoogleCalendarEvents = async (
  accessToken: string,
  timeMinIso: string,
  timeMaxIso: string
): Promise<GoogleCalendarApiEvent[]> => {
  const events: GoogleCalendarApiEvent[] = []
  let pageToken: string | undefined

  do {
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
    url.searchParams.set('singleEvents', 'true')
    url.searchParams.set('orderBy', 'startTime')
    url.searchParams.set('showDeleted', 'false')
    url.searchParams.set('maxResults', '2500')
    url.searchParams.set('timeMin', timeMinIso)
    url.searchParams.set('timeMax', timeMaxIso)
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken)
    }

    const response = await withTimeout(
      fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }),
      GOOGLE_AUTH_TIMEOUT_MS
    )

    if (response.status === 401) {
      throw new Error('Google Calendar request unauthorized (401).')
    }

    if (!response.ok) {
      const details = await response.text()
      throw new Error(`Google Calendar request failed (${response.status}): ${details}`)
    }

    const payload = await response.json() as GoogleCalendarApiResponse
    if (Array.isArray(payload.items)) {
      events.push(...payload.items)
    }
    pageToken = payload.nextPageToken
  } while (pageToken)

  return events
}

const importGoogleCalendarIntoLocal = async (): Promise<GoogleCalendarImportResult> => {
  const clientId = process.env.JARVIS_GOOGLE_CLIENT_ID?.trim()
  if (!clientId) {
    throw new Error(
      'Google Calendar sync is not configured. Set JARVIS_GOOGLE_CLIENT_ID and restart Jarvis.'
    )
  }

  const now = Date.now()
  const timeMinIso = new Date(now - GOOGLE_SYNC_LOOKBACK_DAYS * MS_PER_DAY).toISOString()
  const timeMaxIso = new Date(now + GOOGLE_SYNC_LOOKAHEAD_DAYS * MS_PER_DAY).toISOString()

  let tokenState = await ensureGoogleTokenState(clientId)
  let remoteEvents: GoogleCalendarApiEvent[] = []

  try {
    remoteEvents = await fetchGoogleCalendarEvents(tokenState.accessToken, timeMinIso, timeMaxIso)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('401')) {
      throw error
    }
    tokenState = await runGoogleOAuthFlow(clientId)
    remoteEvents = await fetchGoogleCalendarEvents(tokenState.accessToken, timeMinIso, timeMaxIso)
  }

  const normalizedEvents = remoteEvents
    .map(toGoogleCalendarInput)
    .filter((event): event is CalendarEventInput => event !== null)

  services.calendarService.clearSource('google')
  const imported = services.calendarService.upsertEvents(normalizedEvents)

  return {
    imported,
    total: normalizedEvents.length,
    warning: normalizedEvents.length === 0
      ? 'No Google events found in the sync window.'
      : undefined
  }
}

const captureScreen = async (): Promise<{ path: string; width: number; height: number; timestamp: string; activeWindow: string }> => {
  if (DESKTOP_E2E_MODE) {
    return {
      path: desktopE2EConfig?.screenCapture?.path ?? join(homedir(), '.jarvis', 'screenshots', 'e2e-screen.png'),
      width: desktopE2EConfig?.screenCapture?.width ?? 1280,
      height: desktopE2EConfig?.screenCapture?.height ?? 720,
      timestamp: desktopE2EConfig?.screenCapture?.timestamp ?? new Date().toISOString(),
      activeWindow: desktopE2EConfig?.screenCapture?.activeWindow ?? 'Jarvis E2E Window'
    }
  }

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

const captureScreenFrame = async (): Promise<{ imageBase64: string; width: number; height: number; timestamp: string; activeWindow: string }> => {
  if (DESKTOP_E2E_MODE) {
    return {
      imageBase64: desktopE2EConfig?.screenCapture?.imageBase64
        ?? 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5L2s8AAAAASUVORK5CYII=',
      width: desktopE2EConfig?.screenCapture?.width ?? 1024,
      height: desktopE2EConfig?.screenCapture?.height ?? 576,
      timestamp: desktopE2EConfig?.screenCapture?.timestamp ?? new Date().toISOString(),
      activeWindow: desktopE2EConfig?.screenCapture?.activeWindow ?? 'Jarvis E2E Window'
    }
  }

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1024, height: 576 }
  })

  const primary = sources[0]
  if (!primary) {
    throw new Error('No screen source available')
  }

  const image = primary.thumbnail
  const size = image.getSize()
  const jpeg = image.toJPEG(72)

  return {
    imageBase64: jpeg.toString('base64'),
    width: size.width,
    height: size.height,
    timestamp: new Date().toISOString(),
    activeWindow: getActiveWindowInfo()
  }
}

const getActiveWindowInfo = (): string => {
  if (DESKTOP_E2E_MODE) {
    return desktopE2EConfig?.screenCapture?.activeWindow ?? 'Jarvis E2E Window'
  }

  try {
    if (process.platform === 'linux') {
      return execSync('xdotool getactivewindow getwindowname 2>/dev/null || echo "unknown"', { encoding: 'utf8', timeout: 3000 }).trim()
    }
    if (process.platform === 'win32') {
      return execFileSync('powershell.exe', [
        '-NoProfile', '-Command',
        'Add-Type -MemberDefinition \'[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll", CharSet = CharSet.Auto)] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n);\' -Name FG -Namespace W -PassThru | Out-Null; $h = [W.FG]::GetForegroundWindow(); $s = New-Object System.Text.StringBuilder 256; [void][W.FG]::GetWindowText($h, $s, 256); $s.ToString()'
      ], { encoding: 'utf8', timeout: 5000 }).trim() || 'unknown'
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

const configureDisplayCapture = (): void => {
  if (displayCaptureConfigured) {
    return
  }

  const targetSession = session.defaultSession
  targetSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 640, height: 360 }
      })

      const primaryDisplayId = String(screen.getPrimaryDisplay().id)
      const source = sources.find((entry) => entry.display_id === primaryDisplayId) ?? sources[0]
      if (!source) {
        callback({})
        return
      }

      callback({
        video: {
          id: source.id,
          name: source.name
        }
      })
    } catch {
      callback({})
    }
  })

  displayCaptureConfigured = true
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

if (DESKTOP_E2E_MODE) {
  services.modelManager.sync(getDesktopE2EInstalledModels())
}

const createWindow = async (): Promise<BrowserWindow> => {
  configureDisplayCapture()

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
    prePipBounds = mainWindow.getBounds()
    const currentDisplay = screen.getDisplayMatching(prePipBounds)
    const { x: wx, y: wy, width: sw, height: sh } = currentDisplay.workArea
    const pipLevel = process.platform === 'win32' ? 'screen-saver' as const : 'floating' as const
    mainWindow.setAlwaysOnTop(true, pipLevel)
    mainWindow.setMinimumSize(280, 200)
    mainWindow.setSize(PIP_WIDTH, PIP_HEIGHT, true)
    mainWindow.setPosition(wx + sw - PIP_WIDTH - 16, wy + sh - PIP_HEIGHT - 16, true)
    mainWindow.setResizable(true)
    mainWindow.setSkipTaskbar(true)
  } else {
    mainWindow.setAlwaysOnTop(false)
    mainWindow.setSkipTaskbar(false)
    mainWindow.setMinimumSize(380, 300)
    if (prePipBounds) {
      mainWindow.setBounds(prePipBounds, true)
      prePipBounds = null
    } else {
      mainWindow.setSize(FULL_WIDTH, FULL_HEIGHT, true)
      mainWindow.center()
    }
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
  ipcMain.handle('onboarding:get-state', async () => loadOnboardingState())
  ipcMain.handle(
    'onboarding:set-state',
    async (
      _event,
      payload?: { complete?: boolean; selectedExtraModels?: string[] }
    ) => saveOnboardingState({
      complete: payload?.complete,
      selectedExtraModels: payload?.selectedExtraModels,
      completedAt: payload?.complete === true ? new Date().toISOString() : undefined
    })
  )
  ipcMain.handle('ollama:status', async () => getOllamaStatus())
  ipcMain.handle('ollama:catalog', async () => getOllamaCatalog())
  ipcMain.handle('chat:send', async (_event, request) => sendChat(services, request))
  ipcMain.handle('model:list', async () => DESKTOP_E2E_MODE ? getInstalledOllamaModels() : listModels(services))
  ipcMain.handle('health:get', async () => getHealth(services))
  ipcMain.handle('permissions:get', async () => getToolPermissions(services))
  ipcMain.handle('audit:recent', async (_event, payload?: { limit?: number }) =>
    listRecentAuditRecords(services, payload?.limit)
  )
  ipcMain.handle(
    'audit:record',
    async (
      _event,
      payload: {
        category: 'permission' | 'context' | 'tool' | 'write' | 'system'
        action: string
        summary: string
        detail?: Record<string, unknown>
      }
    ) => recordAuditEvent(services, payload)
  )
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

  ipcMain.handle(
    'calendar:list',
    async (
      _event,
      payload?: { fromTime?: number; toTime?: number; limit?: number; source?: 'local' | 'google' }
    ) => calendarListEvents(services, payload)
  )
  ipcMain.handle(
    'calendar:upcoming',
    async (_event, payload?: { limit?: number; horizonDays?: number }) =>
      calendarUpcomingEvents(services, payload?.limit, payload?.horizonDays)
  )
  ipcMain.handle('calendar:add', async (_event, payload: CalendarEventInput) =>
    calendarAddEvent(services, payload)
  )
  ipcMain.handle('calendar:stats', async () => calendarStats(services))
  ipcMain.handle('calendar:google-import', async () => {
    if (DESKTOP_E2E_MODE && desktopE2EConfig?.googleCalendarImport) {
      return desktopE2EConfig.googleCalendarImport
    }
    return importGoogleCalendarIntoLocal()
  })

  ipcMain.handle('dialog:open-files', async () => {
    if (DESKTOP_E2E_MODE) {
      return desktopE2EConfig?.dialogSelections?.filePaths ?? []
    }
    const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], title: 'Select files' })
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle('dialog:open-folder', async () => {
    if (DESKTOP_E2E_MODE) {
      return desktopE2EConfig?.dialogSelections?.folderPaths ?? []
    }
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Select folder' })
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle('obsidian:connect', async (_event, payload?: { vaultPath?: string }) => {
    let vaultPath = payload?.vaultPath?.trim()
    if (!vaultPath) {
      const selectedPath = DESKTOP_E2E_MODE
        ? desktopE2EConfig?.dialogSelections?.folderPaths?.[0]
        : (await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Select Obsidian vault' })).filePaths[0]
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
  ipcMain.handle('screen:capture-frame', async () => captureScreenFrame())
  ipcMain.handle('screen:active-window', async () => getActiveWindowInfo())
  ipcMain.handle('system:info', async () => getSystemInfo())

  // Streaming handlers
  ipcMain.on('chat:stream', async (
    event,
    payload: {
      requestId: string
      request: {
        model?: string
        messages: { role: 'user' | 'assistant' | 'system' | 'tool'; content: string; images?: string[] }[]
      }
    }
  ) => {
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

  ipcMain.on('ollama:model-pull', async (
    event,
    payload: { requestId: string; modelId: string }
  ) => {
    await runOllamaModelPull(event.sender, payload.requestId, payload.modelId)
  })

  ipcMain.on('chat:agent', async (
    event,
    payload: {
      requestId: string
      model: string
      messages: { role: 'user' | 'assistant' | 'system' | 'tool'; content: string; images?: string[] }[]
      includeCalendarContext?: boolean
    }
  ) => {
    try {
      await runAgent(
        services,
        {
          model: payload.model,
          messages: payload.messages,
          includeCalendarContext: payload.includeCalendarContext
        },
        (agentEvent) => {
          event.sender.send('chat:agent', toAgentStreamPayload(payload.requestId, agentEvent))
        }
      )
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
  if (!DESKTOP_E2E_MODE) {
    createTray()
  }

  // Global hotkey: Ctrl+Shift+J toggles window
  if (!DESKTOP_E2E_MODE) {
    globalShortcut.register('CommandOrControl+Shift+J', () => {
      if (!mainWindow) return
      if (mainWindow.isVisible() && mainWindow.isFocused()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
        mainWindow.focus()
      }
    })
  }

  // Ctrl+Shift+P toggles PiP
  if (!DESKTOP_E2E_MODE) {
    globalShortcut.register('CommandOrControl+Shift+P', () => {
      togglePip()
    })
  }

  if (!DESKTOP_E2E_MODE) {
    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await createWindow()
      }
    })
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (DESKTOP_E2E_MODE) {
    app.quit()
    return
  }

  if (process.platform !== 'darwin') {
    // Keep tray alive in normal desktop mode.
  }
})
