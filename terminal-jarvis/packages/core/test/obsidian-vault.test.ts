import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createObsidianVaultService } from '../src/services/obsidian-vault.js'

describe('obsidian-vault-service', () => {
  it('connects, lists, searches, reads, and writes notes', () => {
    const vaultPath = mkdtempSync(join(tmpdir(), 'jarvis-core-vault-'))
    writeFileSync(join(vaultPath, 'Projects.md'), '# Projects\n\nTerminal Jarvis roadmap', 'utf8')
    writeFileSync(join(vaultPath, 'Daily.markdown'), 'Today: build integration', 'utf8')

    const vault = createObsidianVaultService()
    const status = vault.connect(vaultPath)
    expect(status.connected).toBe(true)
    expect(status.noteCount).toBeGreaterThan(1)

    const notes = vault.listNotes(10)
    expect(notes.map((note) => note.path)).toContain('Projects.md')
    expect(notes.map((note) => note.path)).toContain('Daily.markdown')

    const search = vault.searchNotes('roadmap', 5)
    expect(search.length).toBe(1)
    expect(search[0]?.path).toBe('Projects.md')

    const read = vault.readNote('Projects.md')
    expect(read).toContain('Terminal Jarvis roadmap')

    const write = vault.writeNote('Inbox/new-note', 'hello vault')
    expect(write.path).toBe('Inbox/new-note.md')

    const appended = vault.writeNote('Inbox/new-note.md', '\nmore', 'append')
    expect(appended.mode).toBe('append')
    expect(vault.readNote('Inbox/new-note.md')).toContain('hello vault\nmore')
  })

  it('rejects traversal and unsupported file extensions', () => {
    const vaultPath = mkdtempSync(join(tmpdir(), 'jarvis-core-vault-sec-'))
    writeFileSync(join(vaultPath, 'safe.md'), 'safe', 'utf8')

    const vault = createObsidianVaultService({ initialVaultPath: vaultPath })

    expect(() => vault.readNote('../outside.md')).toThrowError(/inside/)
    expect(() => vault.writeNote('scratch.txt', 'not markdown')).toThrowError(/markdown/)
  })

  it('matches natural language queries using ranked keywords', () => {
    const vaultPath = mkdtempSync(join(tmpdir(), 'jarvis-core-vault-search-'))
    writeFileSync(
      join(vaultPath, 'Tier ZERO.md'),
      'The story ends when Arin opens the final gate and chooses exile.',
      'utf8'
    )

    const vault = createObsidianVaultService({ initialVaultPath: vaultPath })
    const search = vault.searchNotes('tell me where the story ends', 5)

    expect(search.length).toBeGreaterThan(0)
    expect(search[0]?.path).toBe('Tier ZERO.md')
  })
})
