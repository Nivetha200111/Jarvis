import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createCalendarService } from '../src/services/calendar-service.js'

describe('calendar-service', () => {
  it('adds, lists, and summarizes upcoming events', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jarvis-calendar-'))
    const service = createCalendarService({
      storagePath: join(dir, 'events.json')
    })

    const now = Date.now()
    const first = service.addEvent({
      title: 'Design review',
      startTime: now + 3_600_000,
      endTime: now + 7_200_000,
      source: 'local'
    })
    expect(first.id).toContain('local:')

    const upcoming = service.upcomingEvents(5, 7, now)
    expect(upcoming).toHaveLength(1)
    expect(upcoming[0]?.title).toBe('Design review')

    const summary = service.getContextSummary(now, 7, 5)
    expect(summary).toContain('Upcoming schedule')
    expect(summary).toContain('Design review')
  })

  it('upserts and clears source-specific events', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jarvis-calendar-'))
    const service = createCalendarService({
      storagePath: join(dir, 'events.json')
    })

    const start = Date.now() + 86_400_000
    const changed = service.upsertEvents([
      {
        id: 'google:event-1',
        title: 'Standup',
        startTime: start,
        endTime: start + 1_800_000,
        source: 'google'
      },
      {
        id: 'local:event-1',
        title: 'Write report',
        startTime: start + 3_600_000,
        endTime: start + 5_400_000,
        source: 'local'
      }
    ])
    expect(changed).toBe(2)

    const stats = service.getStats(Date.now())
    expect(stats.googleEvents).toBe(1)
    expect(stats.localEvents).toBe(1)

    const removed = service.clearSource('google')
    expect(removed).toBe(1)
    expect(service.getStats().googleEvents).toBe(0)
  })
})
