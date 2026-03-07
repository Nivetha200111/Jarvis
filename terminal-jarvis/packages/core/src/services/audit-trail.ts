import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { AuditRecord, AuditRecordCategory } from '../types/index.js'

export interface AuditRecordInput {
  category: AuditRecordCategory
  action: string
  summary: string
  detail?: Record<string, unknown>
  timestamp?: number
}

export interface AuditTrail {
  record(entry: AuditRecordInput): AuditRecord
  listRecent(limit?: number): AuditRecord[]
}

export interface CreateAuditTrailOptions {
  storagePath?: string
}

const DEFAULT_STORAGE_PATH = join(homedir(), '.jarvis', 'audit', 'events.jsonl')

const makeAuditId = (timestamp: number): string =>
  `audit-${timestamp}-${Math.random().toString(36).slice(2, 10)}`

export const createAuditTrail = (
  options: CreateAuditTrailOptions = {}
): AuditTrail => {
  const storagePath = options.storagePath ?? DEFAULT_STORAGE_PATH

  const ensureDir = (): void => {
    const dir = dirname(storagePath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  }

  const record = (entry: AuditRecordInput): AuditRecord => {
    const timestamp = entry.timestamp ?? Date.now()
    const payload: AuditRecord = {
      id: makeAuditId(timestamp),
      timestamp,
      category: entry.category,
      action: entry.action,
      summary: entry.summary,
      detail: entry.detail
    }

    ensureDir()
    appendFileSync(storagePath, `${JSON.stringify(payload)}\n`, 'utf8')
    return payload
  }

  const listRecent = (limit = 20): AuditRecord[] => {
    if (!existsSync(storagePath)) {
      return []
    }

    try {
      const raw = readFileSync(storagePath, 'utf8')
      const lines = raw
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
      const safeLimit = Math.max(1, Math.min(200, Math.floor(limit) || 20))

      return lines
        .slice(-safeLimit)
        .map((line) => JSON.parse(line) as AuditRecord)
        .reverse()
    } catch {
      return []
    }
  }

  return {
    record,
    listRecent
  }
}
