import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'node:fs'
import {
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep
} from 'node:path'

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown'])
const IGNORED_DIRECTORIES = new Set(['.obsidian', '.trash', '.git', 'node_modules'])
const SEARCH_STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'what',
  'where',
  'when',
  'which',
  'from',
  'into',
  'your',
  'have',
  'been',
  'does',
  'about',
  'tell',
  'please',
  'there',
  'their',
  'ends',
  'end'
])

export interface ObsidianVaultStatus {
  connected: boolean
  vaultPath: string | null
  noteCount: number
}

export interface ObsidianNoteSummary {
  path: string
  title: string
  sizeBytes: number
  updatedAt: number
}

export interface ObsidianSearchHit {
  path: string
  title: string
  line: number
  snippet: string
}

export interface ObsidianWriteResult {
  path: string
  bytesWritten: number
  mode: 'overwrite' | 'append'
}

export interface ObsidianVaultService {
  connect(vaultPath: string): ObsidianVaultStatus
  disconnect(): void
  status(): ObsidianVaultStatus
  listNotes(limit?: number): ObsidianNoteSummary[]
  searchNotes(query: string, limit?: number): ObsidianSearchHit[]
  readNote(notePath: string): string
  writeNote(notePath: string, content: string, mode?: 'overwrite' | 'append'): ObsidianWriteResult
}

export interface CreateObsidianVaultServiceOptions {
  initialVaultPath?: string | null
}

const normalizeVaultPath = (vaultPath: string): string => {
  const trimmed = vaultPath.trim()
  if (!trimmed) {
    throw new Error('Vault path is required')
  }

  const resolved = resolve(trimmed)
  if (!existsSync(resolved)) {
    throw new Error(`Vault path does not exist: ${resolved}`)
  }

  const stats = statSync(resolved)
  if (!stats.isDirectory()) {
    throw new Error(`Vault path is not a directory: ${resolved}`)
  }

  return resolved
}

const normalizeNotePath = (notePath: string): string => {
  const trimmed = notePath.trim()
  if (!trimmed) {
    throw new Error('Note path is required')
  }

  const normalized = trimmed.replaceAll('\\', '/').replace(/^\/+/, '')
  if (!normalized) {
    throw new Error('Note path is required')
  }

  const extension = extname(normalized).toLowerCase()
  if (!extension) {
    return `${normalized}.md`
  }

  if (!MARKDOWN_EXTENSIONS.has(extension)) {
    throw new Error('Only markdown note paths are supported')
  }

  return normalized
}

const toRelativePath = (vaultPath: string, absolutePath: string): string =>
  relative(vaultPath, absolutePath).split(sep).join('/')

const toTitle = (notePath: string): string => {
  const normalized = notePath.replaceAll('\\', '/')
  const fileName = normalized.slice(normalized.lastIndexOf('/') + 1)
  const extension = extname(fileName)
  return extension ? fileName.slice(0, -extension.length) : fileName
}

const ensureInsideVault = (vaultPath: string, notePath: string): string => {
  if (isAbsolute(notePath)) {
    throw new Error('Note path must be relative to the connected vault')
  }

  const absolutePath = resolve(vaultPath, notePath)
  const rel = relative(vaultPath, absolutePath)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('Note path must stay inside the connected vault')
  }

  return absolutePath
}

const collectMarkdownFiles = (vaultPath: string, limit: number): string[] => {
  if (limit <= 0) {
    return []
  }

  const files: string[] = []
  const stack: string[] = [vaultPath]

  while (stack.length > 0 && files.length < limit) {
    const current = stack.pop()
    if (!current) {
      continue
    }

    const entries = readdirSync(current, { withFileTypes: true })
    for (const entry of entries) {
      if (files.length >= limit) {
        break
      }

      const absolutePath = resolve(current, entry.name)
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          stack.push(absolutePath)
        }
        continue
      }

      const extension = extname(entry.name).toLowerCase()
      if (MARKDOWN_EXTENSIONS.has(extension)) {
        files.push(absolutePath)
      }
    }
  }

  return files
}

const toSafeLimit = (value: number | undefined, fallback: number, max: number): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback
  }

  const rounded = Math.floor(value)
  if (rounded < 1) {
    return 1
  }

  return Math.min(rounded, max)
}

const toSearchTerms = (query: string): string[] => {
  const raw = query.toLowerCase().match(/[a-z0-9_]+/g) ?? []
  const deduped = new Set<string>()

  for (const term of raw) {
    if (term.length < 3) {
      continue
    }
    if (SEARCH_STOPWORDS.has(term)) {
      continue
    }
    deduped.add(term)
  }

  return [...deduped]
}

const ensureConnected = (vaultPath: string | null): string => {
  if (!vaultPath) {
    throw new Error('Obsidian vault is not connected')
  }

  return vaultPath
}

export const createObsidianVaultService = (
  options: CreateObsidianVaultServiceOptions = {}
): ObsidianVaultService => {
  let connectedVaultPath: string | null = null

  const connect = (vaultPath: string): ObsidianVaultStatus => {
    connectedVaultPath = normalizeVaultPath(vaultPath)
    return status()
  }

  const disconnect = (): void => {
    connectedVaultPath = null
  }

  const status = (): ObsidianVaultStatus => {
    if (!connectedVaultPath) {
      return {
        connected: false,
        vaultPath: null,
        noteCount: 0
      }
    }

    return {
      connected: true,
      vaultPath: connectedVaultPath,
      noteCount: collectMarkdownFiles(connectedVaultPath, 10_000).length
    }
  }

  const listNotes = (limit?: number): ObsidianNoteSummary[] => {
    const vaultPath = ensureConnected(connectedVaultPath)
    const safeLimit = toSafeLimit(limit, 250, 5_000)
    const files = collectMarkdownFiles(vaultPath, safeLimit)

    return files
      .map((filePath) => {
        const stats = statSync(filePath)
        const notePath = toRelativePath(vaultPath, filePath)
        return {
          path: notePath,
          title: toTitle(notePath),
          sizeBytes: stats.size,
          updatedAt: stats.mtimeMs
        }
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  const searchNotes = (query: string, limit?: number): ObsidianSearchHit[] => {
    const vaultPath = ensureConnected(connectedVaultPath)
    const trimmed = query.trim()
    if (!trimmed) {
      return []
    }

    const safeLimit = toSafeLimit(limit, 20, 200)
    const files = collectMarkdownFiles(vaultPath, 5_000)
    const lowerQuery = trimmed.toLowerCase()
    const terms = toSearchTerms(trimmed)
    const scoredResults: Array<ObsidianSearchHit & { score: number; updatedAt: number }> = []

    for (const filePath of files) {
      const notePath = toRelativePath(vaultPath, filePath)
      const lowerPath = notePath.toLowerCase()
      const content = readFileSync(filePath, 'utf8')
      const lowerContent = content.toLowerCase()
      const stats = statSync(filePath)

      let score = 0
      let bestIndex = -1

      const phraseIndex = lowerContent.indexOf(lowerQuery)
      if (phraseIndex >= 0) {
        score += 100
        bestIndex = phraseIndex
      }

      for (const term of terms) {
        const termIndex = lowerContent.indexOf(term)
        if (termIndex >= 0) {
          score += 12
          if (bestIndex < 0 || termIndex < bestIndex) {
            bestIndex = termIndex
          }
        }

        if (lowerPath.includes(term)) {
          score += 6
        }
      }

      if (score <= 0 || bestIndex < 0) {
        continue
      }

      const snippetWindow = Math.max(160, Math.min(320, lowerQuery.length * 3))
      const start = Math.max(0, bestIndex - 80)
      const end = Math.min(content.length, bestIndex + snippetWindow)
      const snippet = content.slice(start, end).replace(/\s+/g, ' ').trim()
      const line = content.slice(0, bestIndex).split(/\r?\n/).length

      scoredResults.push({
        path: notePath,
        title: toTitle(notePath),
        line,
        snippet,
        score,
        updatedAt: stats.mtimeMs
      })
    }

    return scoredResults
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score
        }
        return b.updatedAt - a.updatedAt
      })
      .slice(0, safeLimit)
      .map(({ path, title, line, snippet }) => ({
        path,
        title,
        line,
        snippet
      }))
  }

  const readNote = (notePath: string): string => {
    const vaultPath = ensureConnected(connectedVaultPath)
    const normalized = normalizeNotePath(notePath)
    const absolutePath = ensureInsideVault(vaultPath, normalized)

    if (!existsSync(absolutePath)) {
      throw new Error(`Note not found: ${normalized}`)
    }

    return readFileSync(absolutePath, 'utf8')
  }

  const writeNote = (
    notePath: string,
    content: string,
    mode: 'overwrite' | 'append' = 'overwrite'
  ): ObsidianWriteResult => {
    const vaultPath = ensureConnected(connectedVaultPath)
    const normalized = normalizeNotePath(notePath)
    const absolutePath = ensureInsideVault(vaultPath, normalized)

    mkdirSync(dirname(absolutePath), { recursive: true })

    const data = String(content)
    const flags = mode === 'append' ? 'a' : 'w'
    writeFileSync(absolutePath, data, { encoding: 'utf8', flag: flags })

    return {
      path: normalized,
      bytesWritten: Buffer.byteLength(data, 'utf8'),
      mode
    }
  }

  if (options.initialVaultPath) {
    try {
      connect(options.initialVaultPath)
    } catch {
      connectedVaultPath = null
    }
  }

  return {
    connect,
    disconnect,
    status,
    listNotes,
    searchNotes,
    readNote,
    writeNote
  }
}
