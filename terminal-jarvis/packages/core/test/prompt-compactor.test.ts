import { describe, expect, it } from 'vitest'
import { compactChatMessages, derivePromptBudgetChars } from '../src/services/prompt-compactor.js'
import type { ChatMessage } from '../src/types/index.js'

describe('prompt-compactor', () => {
  it('preserves recent turns and folds older history into a memory message', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are Jarvis. Keep responses local.' },
      {
        role: 'user',
        content: [
          'My vault contains sprint planning, release notes, design review prep, launch checklist, and rollback tasks.',
          'Repeated note fragment about release blockers and approval owners.',
          'Repeated note fragment about release blockers and approval owners.',
          'Repeated note fragment about release blockers and approval owners.'
        ].join(' ')
      },
      {
        role: 'assistant',
        content: [
          'I found release notes, sprint checklist, design review prep, launch checklist, and rollback tasks in your vault.',
          'Repeated assistant recap about blockers, approvals, launch checklist, and handoff.',
          'Repeated assistant recap about blockers, approvals, launch checklist, and handoff.'
        ].join(' ')
      },
      { role: 'user', content: 'Reminder: design review starts at 5 PM and sprint planning is at 4:30 PM.' },
      { role: 'assistant', content: 'There is a schedule overlap between those two events.' },
      {
        role: 'user',
        content: [
          'Summarize my schedule conflicts and pull the most relevant vault context.',
          '',
          '[Obsidian context]',
          '[Daily.md] Release prep checklist and decision log.',
          '[Daily.md] Release prep checklist and decision log.',
          '[Projects/Tier-Zero.md] Design review agenda and blockers.',
          '[Projects/Tier-Zero.md] Design review agenda and blockers.'
        ].join('\n')
      }
    ]

    const compacted = compactChatMessages(messages, {
      maxInputChars: 420,
      preserveRecentMessages: 3
    })

    expect(compacted.compactedChars).toBeLessThan(compacted.originalChars)
    expect(compacted.messages.some((message) =>
      message.role === 'system' && message.content.includes('Conversation memory')
    )).toBe(true)
    expect(compacted.messages.at(-1)?.content).toContain('Summarize my schedule conflicts')
    expect(compacted.messages.at(-1)?.content).toContain('[Obsidian context]')
    expect(compacted.messages.at(-1)?.content).not.toMatch(/Daily\.md.*Daily\.md/s)
  })

  it('derives a safe input budget from context length', () => {
    expect(derivePromptBudgetChars(8192, 512)).toBeGreaterThan(10_000)
    expect(derivePromptBudgetChars(0, 512)).toBe(14_000)
  })
})
