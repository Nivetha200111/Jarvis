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
const INDEX_MAX_AGE_MS = 300_000
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
  'their'
])
const ENDING_TERMS = new Set(['end', 'ending', 'ends', 'final', 'last', 'conclusion', 'epilogue', 'finish'])

interface VaultIndexEntry {
  absolutePath: string
  path: string
  title: string
  sizeBytes: number
  updatedAt: number
  content: string
  lowerContent: string
  lowerPath: string
}

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

const stemTerm = (term: string): string => {
  if (term.length > 5 && term.endsWith('ing')) {
    return term.slice(0, -3)
  }
  if (term.length > 4 && term.endsWith('ed')) {
    return term.slice(0, -2)
  }
  if (term.length > 4 && term.endsWith('es')) {
    return term.slice(0, -2)
  }
  if (term.length > 3 && term.endsWith('s')) {
    return term.slice(0, -1)
  }
  return term
}

const toBaseSearchTerms = (query: string): string[] => {
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

const toSearchTerms = (query: string): string[] => {
  const baseTerms = toBaseSearchTerms(query)

  const expanded = new Set<string>(baseTerms)
  for (const term of baseTerms) {
    expanded.add(stemTerm(term))
    if (ENDING_TERMS.has(term) || ENDING_TERMS.has(stemTerm(term))) {
      for (const endingTerm of ENDING_TERMS) {
        expanded.add(endingTerm)
      }
    }
  }

  return [...expanded]
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
  let index: VaultIndexEntry[] | null = null
  let indexBuiltAt = 0

  const rebuildIndex = (vaultPath: string): VaultIndexEntry[] => {
    const files = collectMarkdownFiles(vaultPath, 10_000)
    const next: VaultIndexEntry[] = files.map((absolutePath) => {
      const stats = statSync(absolutePath)
      const notePath = toRelativePath(vaultPath, absolutePath)
      const content = readFileSync(absolutePath, 'utf8')

      return {
        absolutePath,
        path: notePath,
        title: toTitle(notePath),
        sizeBytes: stats.size,
        updatedAt: stats.mtimeMs,
        content,
        lowerContent: content.toLowerCase(),
        lowerPath: notePath.toLowerCase()
      }
    })

    index = next
    indexBuiltAt = Date.now()
    return next
  }

  const getIndex = (vaultPath: string, force = false): VaultIndexEntry[] => {
    if (force || !index || Date.now() - indexBuiltAt > INDEX_MAX_AGE_MS) {
      return rebuildIndex(vaultPath)
    }
    return index
  }

  const connect = (vaultPath: string): ObsidianVaultStatus => {
    connectedVaultPath = normalizeVaultPath(vaultPath)
    rebuildIndex(connectedVaultPath)
    return status()
  }

  const disconnect = (): void => {
    connectedVaultPath = null
    index = null
    indexBuiltAt = 0
  }

  const status = (): ObsidianVaultStatus => {
    if (!connectedVaultPath) {
      return {
        connected: false,
        vaultPath: null,
        noteCount: 0
      }
    }

    const indexedNotes = getIndex(connectedVaultPath)
    return {
      connected: true,
      vaultPath: connectedVaultPath,
      noteCount: indexedNotes.length
    }
  }

  const listNotes = (limit?: number): ObsidianNoteSummary[] => {
    const vaultPath = ensureConnected(connectedVaultPath)
    const safeLimit = toSafeLimit(limit, 250, 5_000)
    const entries = getIndex(vaultPath)

    return entries
      .map((entry) => ({
        path: entry.path,
        title: entry.title,
        sizeBytes: entry.sizeBytes,
        updatedAt: entry.updatedAt
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, safeLimit)
  }

  const searchNotes = (query: string, limit?: number): ObsidianSearchHit[] => {
    const vaultPath = ensureConnected(connectedVaultPath)
    const trimmed = query.trim()
    if (!trimmed) {
      return []
    }

    const safeLimit = toSafeLimit(limit, 20, 200)
    const entries = getIndex(vaultPath)
    const lowerQuery = trimmed.toLowerCase()
    const baseTerms = toBaseSearchTerms(trimmed)
    const terms = toSearchTerms(trimmed)
    const baseTermStems = new Set<string>(
      baseTerms.flatMap((term) => [term, stemTerm(term)])
    )
    const hasEndingIntent = baseTerms.some((term) => ENDING_TERMS.has(term) || ENDING_TERMS.has(stemTerm(term)))
    const minimumBaseMatches = baseTerms.length === 0
      ? 0
      : hasEndingIntent || baseTerms.length <= 2
        ? 1
        : 2
    const scoredResults: Array<ObsidianSearchHit & { score: number; updatedAt: number }> = []

    for (const entry of entries) {
      const notePath = entry.path
      const lowerPath = entry.lowerPath
      const content = entry.content
      const lowerContent = entry.lowerContent

      let score = 0
      let bestIndex = -1
      const matchedBaseTerms = new Set<string>()

      const phraseIndex = lowerContent.indexOf(lowerQuery)
      if (phraseIndex >= 0) {
        score += 100
        bestIndex = phraseIndex
      }

      for (const term of terms) {
        const termIndex = lowerContent.indexOf(term)
        const isBaseTerm = baseTermStems.has(term)
        if (termIndex >= 0) {
          score += isBaseTerm ? 16 : 5
          if (isBaseTerm) {
            matchedBaseTerms.add(stemTerm(term))
          }
          if (bestIndex < 0 || termIndex < bestIndex) {
            bestIndex = termIndex
          }
        }

        if (lowerPath.includes(term)) {
          score += isBaseTerm ? 8 : 3
          if (isBaseTerm) {
            matchedBaseTerms.add(stemTerm(term))
          }
        }
      }

      if (phraseIndex < 0 && matchedBaseTerms.size < minimumBaseMatches) {
        continue
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
        title: entry.title,
        line,
        snippet,
        score,
        updatedAt: entry.updatedAt
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

    const entries = getIndex(vaultPath)
    const existing = entries.find((entry) => entry.path === normalized)
    if (existing) {
      return existing.content
    }

    if (!existsSync(absolutePath)) {
      throw new Error(`Note not found: ${normalized}`)
    }

    const content = readFileSync(absolutePath, 'utf8')
    const stats = statSync(absolutePath)
    const cachedEntry: VaultIndexEntry = {
      absolutePath,
      path: normalized,
      title: toTitle(normalized),
      sizeBytes: stats.size,
      updatedAt: stats.mtimeMs,
      content,
      lowerContent: content.toLowerCase(),
      lowerPath: normalized.toLowerCase()
    }

    if (index) {
      index = [...index.filter((entry) => entry.path !== normalized), cachedEntry]
      indexBuiltAt = Date.now()
    }

    return content
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
    const updatedContent = readFileSync(absolutePath, 'utf8')
    const stats = statSync(absolutePath)
    const updatedEntry: VaultIndexEntry = {
      absolutePath,
      path: normalized,
      title: toTitle(normalized),
      sizeBytes: stats.size,
      updatedAt: stats.mtimeMs,
      content: updatedContent,
      lowerContent: updatedContent.toLowerCase(),
      lowerPath: normalized.toLowerCase()
    }

    if (index) {
      index = [...index.filter((entry) => entry.path !== normalized), updatedEntry]
      indexBuiltAt = Date.now()
    }

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
