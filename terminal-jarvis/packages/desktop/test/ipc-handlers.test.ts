import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDesktopServices } from '../src/main/create-services.js'
import {
  calendarAddEvent,
  calendarStats,
  calendarUpcomingEvents,
  connectObsidianVault,
  getHealth,
  getObsidianStatus,
  listModels,
  readObsidianNote,
  searchObsidianNotes,
  sendChat,
  streamChat,
  writeObsidianNote
} from '../src/main/ipc-handlers.js'
import type { DesktopServices } from '../src/main/create-services.js'

process.env.JARVIS_ENGINE = 'mock'

describe('desktop IPC handlers', () => {
  it('streams chat tokens through desktop handler', async () => {
    const services = createDesktopServices()
    const tokens: string[] = []

    await streamChat(
      services,
      {
        model: 'llama3',
        messages: [{ role: 'user', content: 'desktop stream check' }],
        stream: true
      },
      (event) => {
        if (event.type === 'token' && event.token) {
          tokens.push(event.token)
        }
      }
    )

    expect(tokens.join('')).toContain('Mock reply')
  })

  it('returns model list and health state', async () => {
    const services = createDesktopServices()

    const models = listModels(services)
    expect(models.length).toBeGreaterThan(0)

    const response = await sendChat(services, {
      model: 'llama3',
      messages: [{ role: 'user', content: 'health check' }]
    })

    expect(response.content).toContain('Mock reply')

    const health = getHealth(services)
    expect(health.status).toBe('ok')
    expect(health.loadedModel).toBeTruthy()
  })

  it('connects to an Obsidian vault and performs note operations', () => {
    const services = createDesktopServices()
    const vaultPath = mkdtempSync(join(tmpdir(), 'jarvis-vault-'))
    writeFileSync(join(vaultPath, 'Daily.md'), '# Daily\n\nKickoff tasks', 'utf8')

    const status = connectObsidianVault(services, vaultPath)
    expect(status.connected).toBe(true)
    expect(status.noteCount).toBeGreaterThan(0)

    const search = searchObsidianNotes(services, 'Kickoff', 5)
    expect(search.length).toBeGreaterThan(0)
    expect(search[0]?.path).toBe('Daily.md')

    const writeResult = writeObsidianNote(
      services,
      'Inbox/meeting.md',
      '## Notes\n\n- confirm integration\n',
      'overwrite'
    )
    expect(writeResult.path).toBe('Inbox/meeting.md')

    const readResult = readObsidianNote(services, 'Inbox/meeting.md')
    expect(readResult).toContain('confirm integration')

    const refreshed = getObsidianStatus(services)
    expect(refreshed.connected).toBe(true)
  })

  it('stores and retrieves local calendar events', () => {
    const services = createDesktopServices()
    const start = Date.now() + 3_600_000

    const created = calendarAddEvent(services, {
      title: 'Project sync',
      startTime: start,
      endTime: start + 3_600_000,
      source: 'local'
    })
    expect(created.title).toBe('Project sync')

    const upcoming = calendarUpcomingEvents(services, 5, 7)
    expect(upcoming.some((event) => event.id === created.id)).toBe(true)

    const stats = calendarStats(services)
    expect(stats.totalEvents).toBeGreaterThan(0)
    expect(stats.localEvents).toBeGreaterThan(0)
  })

  it('emits done when stream ends without done-marked chunks', async () => {
    const fakeServices = {
      chatService: {
        streamCompletion: async function* () {
          yield { token: 'partial', index: 1, done: false }
        },
        generateCompletion: async () => ({
          model: 'mock',
          content: 'partial',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
        })
      },
      agentService: {} as DesktopServices['agentService'],
      modelManager: {} as DesktopServices['modelManager'],
      engine: { getLoadedModel: () => null } as DesktopServices['engine'],
      provider: 'mock' as DesktopServices['provider'],
      configManager: {} as DesktopServices['configManager'],
      obsidianVaultService: {} as DesktopServices['obsidianVaultService']
    } as DesktopServices

    const seen: Array<'token' | 'done' | 'error'> = []

    await streamChat(
      fakeServices,
      {
        model: 'mock',
        messages: [{ role: 'user', content: 'hello' }],
        stream: true
      },
      (event) => {
        seen.push(event.type)
      }
    )

    expect(seen.filter((type) => type === 'done')).toHaveLength(1)
  })
})
