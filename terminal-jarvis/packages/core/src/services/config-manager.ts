import { homedir } from 'node:os'
import { join } from 'node:path'

export interface JarvisConfig {
  dataDir: string
  modelsDir: string
  configPath: string
  defaultModel: string
  apiPort: number
  obsidianVaultPath: string | null
  googleClientId: string | null
  logLevel: 'debug' | 'info' | 'warn' | 'error'
}

export interface ConfigManager {
  get<K extends keyof JarvisConfig>(key: K): JarvisConfig[K]
  set<K extends keyof JarvisConfig>(key: K, value: JarvisConfig[K]): void
  all(): JarvisConfig
}

const createDefaults = (): JarvisConfig => {
  const dataDir = join(homedir(), '.jarvis')

  return {
    dataDir,
    modelsDir: join(dataDir, 'models'),
    configPath: join(dataDir, 'config.toml'),
    defaultModel: 'mock-llama-3-8b-q4_k_m',
    apiPort: 8080,
    obsidianVaultPath: null,
    googleClientId: null,
    logLevel: 'info'
  }
}

const validateConfig = (config: JarvisConfig): void => {
  if (!config.dataDir) {
    throw new Error('Config validation failed: dataDir must not be empty')
  }

  if (!config.defaultModel) {
    throw new Error('Config validation failed: defaultModel must not be empty')
  }

  if (config.apiPort < 1 || config.apiPort > 65535) {
    throw new Error('Config validation failed: apiPort must be between 1 and 65535')
  }

  if (config.obsidianVaultPath !== null && config.obsidianVaultPath.trim().length === 0) {
    throw new Error('Config validation failed: obsidianVaultPath must be null or a non-empty path')
  }

  if (config.googleClientId !== null && config.googleClientId.trim().length === 0) {
    throw new Error('Config validation failed: googleClientId must be null or a non-empty string')
  }
}

export const createConfigManager = (overrides: Partial<JarvisConfig> = {}): ConfigManager => {
  const merged: JarvisConfig = {
    ...createDefaults(),
    ...overrides
  }

  validateConfig(merged)

  let current = merged

  const get = <K extends keyof JarvisConfig>(key: K): JarvisConfig[K] => current[key]

  const set = <K extends keyof JarvisConfig>(key: K, value: JarvisConfig[K]): void => {
    const next: JarvisConfig = {
      ...current,
      [key]: value
    }

    validateConfig(next)
    current = next
  }

  const all = (): JarvisConfig => ({ ...current })

  return {
    get,
    set,
    all
  }
}
