import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

export type CalendarEventSource = 'local' | 'google'

export interface CalendarEvent {
  id: string
  title: string
  description: string
  location: string
  startTime: number
  endTime: number
  allDay: boolean
  source: CalendarEventSource
  updatedAt: number
}

export interface CalendarEventInput {
  id?: string
  title: string
  description?: string
  location?: string
  startTime: number
  endTime?: number
  allDay?: boolean
  source?: CalendarEventSource
  updatedAt?: number
}

export interface CalendarListOptions {
  fromTime?: number
  toTime?: number
  source?: CalendarEventSource
  limit?: number
}

export interface CalendarStats {
  totalEvents: number
  upcomingEvents: number
  localEvents: number
  googleEvents: number
}

export interface CreateCalendarServiceOptions {
  storagePath?: string
}

export interface CalendarService {
  listEvents(options?: CalendarListOptions): CalendarEvent[]
  upcomingEvents(limit?: number, horizonDays?: number, fromTime?: number): CalendarEvent[]
  addEvent(input: CalendarEventInput): CalendarEvent
  upsertEvents(inputs: CalendarEventInput[]): number
  removeEvent(id: string): boolean
  clearSource(source: CalendarEventSource): number
  getStats(nowTime?: number): CalendarStats
  getContextSummary(nowTime?: number, horizonDays?: number, limit?: number): string
}

interface StoredCalendarData {
  version: number
  events: CalendarEvent[]
}

const DEFAULT_STORAGE_PATH = join(homedir(), '.jarvis', 'calendar', 'events.json')
const MS_PER_DAY = 86_400_000
const DEFAULT_EVENT_DURATION_MS = 3_600_000
const MAX_LIST_LIMIT = 5_000

const toSafeLimit = (value: number | undefined, fallback: number): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback
  }

  const rounded = Math.floor(value)
  if (rounded < 1) {
    return 1
  }

  return Math.min(rounded, MAX_LIST_LIMIT)
}

const toTimestamp = (value: number): number => {
  if (!Number.isFinite(value)) {
    throw new Error('Calendar event time must be a finite timestamp')
  }

  return Math.floor(value)
}

const sanitizeText = (value: string | undefined): string => (value ?? '').trim()

const normalizeEventInput = (input: CalendarEventInput): CalendarEvent => {
  const title = sanitizeText(input.title)
  if (!title) {
    throw new Error('Calendar event title is required')
  }

  const now = Date.now()
  const startTime = toTimestamp(input.startTime)
  const computedEnd = input.endTime !== undefined
    ? toTimestamp(input.endTime)
    : startTime + DEFAULT_EVENT_DURATION_MS
  const endTime = computedEnd > startTime ? computedEnd : startTime + DEFAULT_EVENT_DURATION_MS
  const source = input.source ?? 'local'

  const generatedId = input.id?.trim()
  const id = generatedId && generatedId.length > 0
    ? generatedId
    : `${source}:${startTime}:${Math.random().toString(36).slice(2, 10)}`

  return {
    id,
    title,
    description: sanitizeText(input.description),
    location: sanitizeText(input.location),
    startTime,
    endTime,
    allDay: Boolean(input.allDay),
    source,
    updatedAt: input.updatedAt ?? now
  }
}

const sortEvents = (events: CalendarEvent[]): void => {
  events.sort((a, b) => {
    if (a.startTime !== b.startTime) {
      return a.startTime - b.startTime
    }

    if (a.endTime !== b.endTime) {
      return a.endTime - b.endTime
    }

    return a.id.localeCompare(b.id)
  })
}

const formatTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })

export const createCalendarService = (
  options: CreateCalendarServiceOptions = {}
): CalendarService => {
  const storagePath = options.storagePath ?? DEFAULT_STORAGE_PATH
  const events = new Map<string, CalendarEvent>()

  const persist = (): void => {
    const dir = dirname(storagePath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    const allEvents = [...events.values()]
    sortEvents(allEvents)

    const payload: StoredCalendarData = {
      version: 1,
      events: allEvents
    }
    writeFileSync(storagePath, JSON.stringify(payload), 'utf8')
  }

  const load = (): void => {
    if (!existsSync(storagePath)) {
      return
    }

    try {
      const raw = readFileSync(storagePath, 'utf8')
      const parsed = JSON.parse(raw) as StoredCalendarData
      if (parsed.version !== 1 || !Array.isArray(parsed.events)) {
        return
      }

      for (const candidate of parsed.events) {
        const normalized = normalizeEventInput(candidate)
        events.set(normalized.id, normalized)
      }
    } catch {
      // Corrupted calendar store; ignore and continue with empty state.
    }
  }

  load()

  const listEvents = (options: CalendarListOptions = {}): CalendarEvent[] => {
    const fromTime = options.fromTime ?? Number.NEGATIVE_INFINITY
    const toTime = options.toTime ?? Number.POSITIVE_INFINITY
    const limit = toSafeLimit(options.limit, 200)

    const listed = [...events.values()]
      .filter((event) => {
        if (options.source && event.source !== options.source) {
          return false
        }
        if (event.endTime < fromTime) {
          return false
        }
        if (event.startTime > toTime) {
          return false
        }
        return true
      })

    sortEvents(listed)
    return listed.slice(0, limit)
  }

  const upcomingEvents = (
    limit = 20,
    horizonDays = 30,
    fromTime = Date.now()
  ): CalendarEvent[] => {
    const toTime = fromTime + Math.max(1, Math.floor(horizonDays)) * MS_PER_DAY
    return listEvents({
      fromTime,
      toTime,
      limit
    })
  }

  const addEvent = (input: CalendarEventInput): CalendarEvent => {
    const event = normalizeEventInput(input)
    events.set(event.id, event)
    persist()
    return event
  }

  const upsertEvents = (inputs: CalendarEventInput[]): number => {
    let changed = 0
    for (const input of inputs) {
      const event = normalizeEventInput(input)
      const existing = events.get(event.id)
      if (!existing || JSON.stringify(existing) !== JSON.stringify(event)) {
        events.set(event.id, event)
        changed += 1
      }
    }
    if (changed > 0) {
      persist()
    }
    return changed
  }

  const removeEvent = (id: string): boolean => {
    const removed = events.delete(id)
    if (removed) {
      persist()
    }
    return removed
  }

  const clearSource = (source: CalendarEventSource): number => {
    let removed = 0
    for (const [id, event] of events.entries()) {
      if (event.source !== source) {
        continue
      }
      events.delete(id)
      removed += 1
    }

    if (removed > 0) {
      persist()
    }

    return removed
  }

  const getStats = (nowTime = Date.now()): CalendarStats => {
    const total = events.size
    let localEvents = 0
    let googleEvents = 0
    let upcoming = 0

    for (const event of events.values()) {
      if (event.source === 'google') {
        googleEvents += 1
      } else {
        localEvents += 1
      }
      if (event.endTime >= nowTime) {
        upcoming += 1
      }
    }

    return {
      totalEvents: total,
      upcomingEvents: upcoming,
      localEvents,
      googleEvents
    }
  }

  const getContextSummary = (
    nowTime = Date.now(),
    horizonDays = 14,
    limit = 8
  ): string => {
    const eventsInWindow = upcomingEvents(limit, horizonDays, nowTime)
    if (eventsInWindow.length === 0) {
      return 'No upcoming schedule items in the local calendar.'
    }

    const lines = eventsInWindow.map((event) => {
      const sourceLabel = event.source === 'google' ? 'Google' : 'Local'
      const timeLabel = event.allDay
        ? `${formatTime(event.startTime).split(',')[0]} (all day)`
        : `${formatTime(event.startTime)} - ${formatTime(event.endTime)}`
      const location = event.location ? ` @ ${event.location}` : ''
      return `- ${timeLabel}: ${event.title}${location} [${sourceLabel}]`
    })

    return `Upcoming schedule:\n${lines.join('\n')}`
  }

  return {
    listEvents,
    upcomingEvents,
    addEvent,
    upsertEvents,
    removeEvent,
    clearSource,
    getStats,
    getContextSummary
  }
}
