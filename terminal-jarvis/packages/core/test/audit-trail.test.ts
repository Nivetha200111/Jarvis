import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createAuditTrail } from '../src/services/audit-trail.js'

describe('audit-trail', () => {
  it('records entries and returns them in reverse chronological order', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jarvis-audit-'))
    const trail = createAuditTrail({
      storagePath: join(dir, 'events.jsonl')
    })

    trail.record({
      category: 'context',
      action: 'vault_context',
      summary: 'Attached vault context.',
      timestamp: 1
    })
    trail.record({
      category: 'tool',
      action: 'run_command',
      summary: 'run_command succeeded.',
      timestamp: 2
    })

    const recent = trail.listRecent(10)
    expect(recent).toHaveLength(2)
    expect(recent[0]?.action).toBe('run_command')
    expect(recent[1]?.action).toBe('vault_context')
  })
})
