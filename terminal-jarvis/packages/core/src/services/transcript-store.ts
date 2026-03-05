import type { ChatMessage, TranscriptRecord } from '../types/index.js'

export interface TranscriptStore {
  createConversation(model: string, seedMessages?: ChatMessage[]): TranscriptRecord
  appendMessage(conversationId: string, message: ChatMessage): void
  listConversations(): TranscriptRecord[]
  getConversation(conversationId: string): TranscriptRecord | undefined
  searchConversations(query: string): TranscriptRecord[]
  exportConversationJson(conversationId: string): string
  exportConversationMarkdown(conversationId: string): string
}

let conversationCounter = 0

const makeConversationId = (): string => {
  conversationCounter += 1
  return `conv-${Date.now()}-${conversationCounter}`
}

const toTitle = (messages: ChatMessage[]): string => {
  const firstUser = messages.find((message) => message.role === 'user')
  if (!firstUser) {
    return 'Untitled Conversation'
  }

  return firstUser.content.slice(0, 60) || 'Untitled Conversation'
}

export const createTranscriptStore = (): TranscriptStore => {
  const conversations = new Map<string, TranscriptRecord>()

  const createConversation = (model: string, seedMessages: ChatMessage[] = []): TranscriptRecord => {
    const now = Date.now()
    const record: TranscriptRecord = {
      id: makeConversationId(),
      model,
      title: toTitle(seedMessages),
      messages: [...seedMessages],
      createdAt: now,
      updatedAt: now
    }

    conversations.set(record.id, record)
    return { ...record, messages: [...record.messages] }
  }

  const appendMessage = (conversationId: string, message: ChatMessage): void => {
    const record = conversations.get(conversationId)
    if (!record) {
      throw new Error(`Conversation not found: ${conversationId}`)
    }

    record.messages.push(message)
    record.updatedAt = Date.now()
  }

  const listConversations = (): TranscriptRecord[] =>
    Array.from(conversations.values()).map((record) => ({
      ...record,
      messages: [...record.messages]
    }))

  const getConversation = (conversationId: string): TranscriptRecord | undefined => {
    const record = conversations.get(conversationId)
    if (!record) {
      return undefined
    }

    return {
      ...record,
      messages: [...record.messages]
    }
  }

  const searchConversations = (query: string): TranscriptRecord[] => {
    const lowered = query.toLowerCase()

    return listConversations().filter((record) => {
      const haystack = [record.title, ...record.messages.map((message) => message.content)]
        .join('\n')
        .toLowerCase()

      return haystack.includes(lowered)
    })
  }

  const exportConversationJson = (conversationId: string): string => {
    const record = getConversation(conversationId)
    if (!record) {
      throw new Error(`Conversation not found: ${conversationId}`)
    }

    return JSON.stringify(record, null, 2)
  }

  const exportConversationMarkdown = (conversationId: string): string => {
    const record = getConversation(conversationId)
    if (!record) {
      throw new Error(`Conversation not found: ${conversationId}`)
    }

    const lines = [`# ${record.title}`, '', `Model: ${record.model}`, '']

    for (const message of record.messages) {
      lines.push(`## ${message.role}`)
      lines.push('')
      lines.push(message.content)
      lines.push('')
    }

    return lines.join('\n')
  }

  return {
    createConversation,
    appendMessage,
    listConversations,
    getConversation,
    searchConversations,
    exportConversationJson,
    exportConversationMarkdown
  }
}
