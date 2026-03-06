import type { ChatMessage } from '../types/index.js'

export interface PromptCompactionOptions {
  maxInputChars?: number
  maxSystemMessageChars?: number
  maxRecentMessageChars?: number
  maxMemoryMessageChars?: number
  preserveRecentMessages?: number
  maxMemoryItems?: number
  latestUserHint?: string
}

export interface PromptCompactionResult {
  messages: ChatMessage[]
  originalChars: number
  compactedChars: number
  droppedMessages: number
  memoryItems: number
}

const DEFAULT_MAX_INPUT_CHARS = 14_000
const DEFAULT_MAX_SYSTEM_MESSAGE_CHARS = 3_200
const DEFAULT_MAX_RECENT_MESSAGE_CHARS = 1_400
const DEFAULT_MAX_MEMORY_MESSAGE_CHARS = 1_800
const DEFAULT_PRESERVE_RECENT_MESSAGES = 6
const DEFAULT_MAX_MEMORY_ITEMS = 8
const MIN_MESSAGE_CHARS = 180

const STOPWORDS = new Set([
  'about',
  'after',
  'again',
  'agent',
  'assist',
  'assistant',
  'before',
  'being',
  'build',
  'could',
  'from',
  'have',
  'into',
  'just',
  'local',
  'make',
  'need',
  'note',
  'please',
  'reply',
  'some',
  'that',
  'them',
  'then',
  'there',
  'they',
  'this',
  'user',
  'using',
  'what',
  'when',
  'where',
  'which',
  'with',
  'would',
  'your'
])

const normalizeWhitespace = (content: string): string =>
  content
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const toCharCount = (messages: ChatMessage[]): number =>
  messages.reduce((sum, message) => sum + message.content.length, 0)

const toQueryTerms = (messages: ChatMessage[], latestUserHint?: string): string[] => {
  const userMessages = messages
    .filter((message) => message.role === 'user')
    .slice(-3)
    .map((message) => message.content)

  if (latestUserHint) {
    userMessages.push(latestUserHint)
  }

  const matches = userMessages
    .join(' ')
    .toLowerCase()
    .match(/[a-z0-9_./:-]{3,}/g) ?? []

  const filtered = matches.filter((term) => !STOPWORDS.has(term))
  return [...new Set(filtered)].slice(0, 24)
}

const dedupeKey = (segment: string): string =>
  segment
    .toLowerCase()
    .replace(/[`*_>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const isSectionHeader = (segment: string): boolean => {
  const trimmed = segment.trim()
  if (!trimmed || trimmed.length > 100) {
    return false
  }

  return (
    trimmed.endsWith(':') ||
    /^\[[^\]]+\]$/u.test(trimmed) ||
    /^Relevant /u.test(trimmed) ||
    /^Upcoming /u.test(trimmed)
  )
}

const hasInjectedContextMarkers = (content: string): boolean =>
  /\[Obsidian context\]|\[Obsidian semantic context\]|\[Schedule context\]|Relevant vault context:|Relevant knowledge from indexed documents:|Upcoming schedule:/iu.test(content)

const resolveMessageBudget = (
  message: ChatMessage,
  isLatestUser: boolean,
  overBudget: boolean,
  maxSystemMessageChars: number,
  maxRecentMessageChars: number
): number => {
  if (message.role === 'system') {
    return hasInjectedContextMarkers(message.content)
      ? Math.min(maxSystemMessageChars, 2_400)
      : maxSystemMessageChars
  }

  if (isLatestUser) {
    if (hasInjectedContextMarkers(message.content)) {
      return overBudget
        ? Math.min(maxRecentMessageChars, 1_000)
        : 1_100
    }

    return overBudget
      ? Math.max(maxRecentMessageChars, 900)
      : Math.max(maxRecentMessageChars, 2_000)
  }

  return maxRecentMessageChars
}

const scoreSegment = (segment: string, queryTerms: string[]): number => {
  const lower = segment.toLowerCase()
  let score = 0

  for (const term of queryTerms) {
    if (lower.includes(term)) {
      score += term.length >= 6 ? 4 : 3
    }
  }

  if (/[/\\~][\w./-]+/u.test(segment)) {
    score += 1.5
  }

  if (/^\s*[-*]/u.test(segment) || /^\[[^\]]+\]/u.test(segment)) {
    score += 1.2
  }

  if (/\d/u.test(segment)) {
    score += 0.5
  }

  if (segment.length >= 28 && segment.length <= 220) {
    score += 0.8
  } else if (segment.length > 360) {
    score -= 0.6
  }

  if (score === 0 && queryTerms.length === 0) {
    score = 1
  }

  return score
}

const splitSegments = (content: string): string[] => {
  const blocks = content
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter(Boolean)

  if (blocks.length > 1) {
    return blocks
  }

  const lines = content
    .split('\n')
    .map((segment) => segment.trim())
    .filter(Boolean)

  if (lines.length > 1) {
    return lines
  }

  return content
    .split(/(?<=[.!?])\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean)
}

const selectSegments = (segments: string[], queryTerms: string[], maxChars: number): string[] => {
  const ranked = segments
    .map((segment, index) => ({
      segment,
      index,
      score: scoreSegment(segment, queryTerms)
    }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score
      }
      return a.index - b.index
    })

  const selected: Array<{ segment: string; index: number }> = []
  const seen = new Set<string>()
  let usedChars = 0

  for (const candidate of ranked) {
    const key = dedupeKey(candidate.segment)
    if (!key || seen.has(key)) {
      continue
    }

    const trimmed = candidate.segment.slice(0, Math.min(candidate.segment.length, 420)).trim()
    const nextSize = usedChars + trimmed.length + (selected.length > 0 ? 2 : 0)
    if (selected.length > 0 && nextSize > maxChars) {
      continue
    }

    selected.push({ segment: trimmed, index: candidate.index })
    usedChars = nextSize
    seen.add(key)

    if (usedChars >= maxChars) {
      break
    }
  }

  if (selected.length === 0 && segments[0]) {
    return [segments[0].slice(0, maxChars).trim()]
  }

  return selected
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.segment)
}

const compactContent = (
  content: string,
  role: ChatMessage['role'],
  queryTerms: string[],
  maxChars: number
): string => {
  const normalized = normalizeWhitespace(content)
  if (normalized.length <= maxChars) {
    return normalized
  }

  const segments = splitSegments(normalized)
  if (segments.length === 0) {
    return normalized.slice(0, maxChars).trimEnd()
  }

  const preserved: string[] = []
  const remaining = [...segments]

  // Preserve the leading instruction/prompt block for user/system messages.
  if ((role === 'user' || role === 'system') && remaining[0]) {
    preserved.push(remaining.shift() as string)
  } else if (remaining[0] && isSectionHeader(remaining[0])) {
    preserved.push(remaining.shift() as string)
  }

  const selected = selectSegments(remaining, queryTerms, Math.max(MIN_MESSAGE_CHARS, maxChars - preserved.join('\n\n').length))
  const preservedChars = preserved.join('\n\n').length
  const remainingChars = Math.max(MIN_MESSAGE_CHARS, maxChars - preservedChars)
  const perSegmentBudget = Math.max(
    MIN_MESSAGE_CHARS,
    Math.floor(remainingChars / Math.max(1, selected.length))
  )
  const compactedSelected = selected.map((segment) =>
    segment.includes('\n')
      ? compactContent(segment, 'tool', queryTerms, perSegmentBudget)
      : segment
  )
  const compacted = [...preserved, ...compactedSelected]
    .filter(Boolean)
    .join('\n\n')
    .trim()

  if (!compacted) {
    return normalized.slice(0, maxChars).trimEnd()
  }

  return compacted.length <= maxChars
    ? compacted
    : compacted.slice(0, maxChars).trimEnd()
}

const cloneMessage = (message: ChatMessage, nextContent: string): ChatMessage => ({
  ...message,
  content: nextContent
})

const buildMemoryMessage = (
  messages: ChatMessage[],
  queryTerms: string[],
  maxChars: number,
  maxItems: number
): { message: ChatMessage | null; usedItems: number } => {
  const lines: string[] = []
  let usedChars = 0

  for (const message of messages.slice().reverse()) {
    if (lines.length >= maxItems) {
      break
    }

    const compacted = compactContent(message.content, message.role, queryTerms, 240)
      .replace(/\n+/g, ' / ')
      .trim()

    if (!compacted) {
      continue
    }

    const line = `- ${message.role}: ${compacted}`
    const nextSize = usedChars + line.length + 1
    if (lines.length > 0 && nextSize > maxChars) {
      continue
    }

    lines.push(line)
    usedChars = nextSize
  }

  if (lines.length === 0) {
    return { message: null, usedItems: 0 }
  }

  const content = `Conversation memory (deterministic local compaction):\n${lines.reverse().join('\n')}`
  return {
    message: { role: 'system', content },
    usedItems: lines.length
  }
}

const enforceBudget = (
  messages: ChatMessage[],
  queryTerms: string[],
  maxInputChars: number
): ChatMessage[] => {
  const nextMessages = [...messages]
  let totalChars = toCharCount(nextMessages)
  const latestUserIndex = nextMessages.reduce((current, message, index) =>
    message.role === 'user' ? index : current, -1)

  for (let i = 0; i < nextMessages.length && totalChars > maxInputChars; i += 1) {
    const message = nextMessages[i]
    if (!message) {
      continue
    }

    const isLatestUser = message.role === 'user' && i === latestUserIndex
    if (message.role === 'system' || isLatestUser) {
      continue
    }

    const tighterBudget = Math.max(MIN_MESSAGE_CHARS, Math.floor(message.content.length * 0.72))
    const compacted = compactContent(message.content, message.role, queryTerms, tighterBudget)
    totalChars -= message.content.length - compacted.length
    nextMessages[i] = cloneMessage(message, compacted)
  }

  if (totalChars > maxInputChars && latestUserIndex >= 0) {
    const latestUser = nextMessages[latestUserIndex]
    if (latestUser) {
      const targetChars = Math.max(
        MIN_MESSAGE_CHARS,
        latestUser.content.length - (totalChars - maxInputChars) - 32
      )
      const compacted = compactContent(latestUser.content, latestUser.role, queryTerms, targetChars)
      totalChars -= latestUser.content.length - compacted.length
      nextMessages[latestUserIndex] = cloneMessage(latestUser, compacted)
    }
  }

  return totalChars <= maxInputChars
    ? nextMessages
    : nextMessages.filter((message, index) => {
      const isLatestUser = message.role === 'user' && index === nextMessages.length - 1
      return message.role === 'system' || isLatestUser || index >= Math.max(0, nextMessages.length - 4)
    })
}

export const derivePromptBudgetChars = (
  contextLength = 0,
  maxOutputTokens = 512
): number => {
  const fallback = DEFAULT_MAX_INPUT_CHARS
  if (!Number.isFinite(contextLength) || contextLength < 1024) {
    return fallback
  }

  const estimatedChars = Math.floor(contextLength * 3.2)
  const reservedOutputChars = Math.max(1, Math.floor(maxOutputTokens)) * 4
  const budget = estimatedChars - reservedOutputChars - 1_600
  return Math.max(6_000, Math.min(24_000, budget))
}

export const compactChatMessages = (
  messages: ChatMessage[],
  options: PromptCompactionOptions = {}
): PromptCompactionResult => {
  const originalChars = toCharCount(messages)
  if (messages.length === 0 || originalChars === 0) {
    return {
      messages: [],
      originalChars,
      compactedChars: 0,
      droppedMessages: 0,
      memoryItems: 0
    }
  }

  const maxInputChars = options.maxInputChars ?? DEFAULT_MAX_INPUT_CHARS
  const maxSystemMessageChars = options.maxSystemMessageChars ?? DEFAULT_MAX_SYSTEM_MESSAGE_CHARS
  const maxRecentMessageChars = options.maxRecentMessageChars ?? DEFAULT_MAX_RECENT_MESSAGE_CHARS
  const maxMemoryMessageChars = options.maxMemoryMessageChars ?? DEFAULT_MAX_MEMORY_MESSAGE_CHARS
  const preserveRecentMessages = options.preserveRecentMessages ?? DEFAULT_PRESERVE_RECENT_MESSAGES
  const maxMemoryItems = options.maxMemoryItems ?? DEFAULT_MAX_MEMORY_ITEMS
  const queryTerms = toQueryTerms(messages, options.latestUserHint)
  const latestUserIndex = messages.reduce((current, message, index) =>
    message.role === 'user' ? index : current, -1)

  if (originalChars <= maxInputChars) {
    const compactedMessages = messages.map((message, index) => {
      const isLatestUser = index === latestUserIndex && message.role === 'user'
      const budget = resolveMessageBudget(
        message,
        isLatestUser,
        false,
        maxSystemMessageChars,
        maxRecentMessageChars
      )

      return cloneMessage(message, compactContent(message.content, message.role, queryTerms, budget))
    })

    return {
      messages: compactedMessages,
      originalChars,
      compactedChars: toCharCount(compactedMessages),
      droppedMessages: 0,
      memoryItems: 0
    }
  }

  const systemMessages = messages.filter((message) => message.role === 'system')
  const nonSystemMessages = messages.filter((message) => message.role !== 'system')
  const latestUserRecentIndex = nonSystemMessages.reduce((current, message, index) =>
    message.role === 'user' ? index : current, -1)
  const recentMessages = nonSystemMessages.slice(-preserveRecentMessages)
  const olderMessages = nonSystemMessages.slice(0, Math.max(0, nonSystemMessages.length - preserveRecentMessages))
  const olderMessagesChars = toCharCount(olderMessages)

  const compactedSystemMessages = systemMessages.map((message) =>
    cloneMessage(message, compactContent(message.content, message.role, queryTerms, maxSystemMessageChars))
  )

  const compactedRecentMessages = recentMessages.map((message, index) => {
    const globalIndex = nonSystemMessages.length - recentMessages.length + index
    const isLatestUser = message.role === 'user' && globalIndex === latestUserRecentIndex
    const budget = resolveMessageBudget(
      message,
      isLatestUser,
      true,
      maxSystemMessageChars,
      maxRecentMessageChars
    )

    return cloneMessage(message, compactContent(message.content, message.role, queryTerms, budget))
  })

  const memory = buildMemoryMessage(olderMessages, queryTerms, maxMemoryMessageChars, maxMemoryItems)
  const includeMemory = memory.message !== null && memory.message.content.length < olderMessagesChars
  const withMemory = includeMemory && memory.message
    ? [...compactedSystemMessages, memory.message, ...compactedRecentMessages]
    : [...compactedSystemMessages, ...compactedRecentMessages]

  const budgetedMessages = enforceBudget(withMemory, queryTerms, maxInputChars)

  return {
    messages: budgetedMessages,
    originalChars,
    compactedChars: toCharCount(budgetedMessages),
    droppedMessages: Math.max(0, messages.length - budgetedMessages.length),
    memoryItems: includeMemory ? memory.usedItems : 0
  }
}
