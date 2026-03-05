import { execSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { ToolDefinition } from '../types/index.js'
import type { ObsidianVaultService } from '../services/obsidian-vault.js'

export interface ToolExecutionContext {
  obsidianVault?: ObsidianVaultService
}

const toObjectSchema = (
  properties: Record<string, { type: string; description: string }>,
  required: string[] = []
): ToolDefinition['function']['parameters'] => ({
  type: 'object',
  properties,
  required
})

const baseTools: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Execute a shell command and return stdout. Use for system tasks, installing packages, running scripts, git operations, etc.',
      parameters: toObjectSchema(
        {
          command: { type: 'string', description: 'The shell command to execute' }
        },
        ['command']
      )
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the full contents of a file.',
      parameters: toObjectSchema(
        {
          path: { type: 'string', description: 'Absolute or relative file path' }
        },
        ['path']
      )
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file, creating it if needed.',
      parameters: toObjectSchema(
        {
          path: { type: 'string', description: 'File path to write to' },
          content: { type: 'string', description: 'Content to write' }
        },
        ['path', 'content']
      )
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List files and subdirectories at a given path.',
      parameters: toObjectSchema(
        {
          path: { type: 'string', description: 'Directory path to list (defaults to current directory)' }
        },
        ['path']
      )
    }
  },
  {
    type: 'function',
    function: {
      name: 'extract_zip',
      description: 'Extract a .zip or .tar.gz archive to a destination directory.',
      parameters: toObjectSchema(
        {
          archive_path: { type: 'string', description: 'Path to the archive file (.zip or .tar.gz)' },
          destination: { type: 'string', description: 'Directory to extract into' }
        },
        ['archive_path', 'destination']
      )
    }
  }
]

const obsidianTools: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'obsidian_status',
      description: 'Get current Obsidian vault connection status.',
      parameters: toObjectSchema({})
    }
  },
  {
    type: 'function',
    function: {
      name: 'obsidian_connect',
      description: 'Connect Jarvis to an Obsidian vault path.',
      parameters: toObjectSchema(
        {
          vault_path: { type: 'string', description: 'Absolute path to the Obsidian vault directory' }
        },
        ['vault_path']
      )
    }
  },
  {
    type: 'function',
    function: {
      name: 'obsidian_list_notes',
      description: 'List markdown notes in the connected Obsidian vault.',
      parameters: toObjectSchema(
        {
          limit: { type: 'number', description: 'Max notes to return (default 50)' }
        }
      )
    }
  },
  {
    type: 'function',
    function: {
      name: 'obsidian_search_notes',
      description: 'Search note contents in the connected Obsidian vault.',
      parameters: toObjectSchema(
        {
          query: { type: 'string', description: 'Text to search for inside notes' },
          limit: { type: 'number', description: 'Max matches to return (default 20)' }
        },
        ['query']
      )
    }
  },
  {
    type: 'function',
    function: {
      name: 'obsidian_read_note',
      description: 'Read markdown note content from the connected Obsidian vault.',
      parameters: toObjectSchema(
        {
          path: { type: 'string', description: 'Relative note path, e.g. Projects/plan.md' }
        },
        ['path']
      )
    }
  },
  {
    type: 'function',
    function: {
      name: 'obsidian_write_note',
      description: 'Write or append markdown note content in the connected Obsidian vault.',
      parameters: toObjectSchema(
        {
          path: { type: 'string', description: 'Relative note path, e.g. Inbox/today.md' },
          content: { type: 'string', description: 'Markdown content to write' },
          mode: { type: 'string', description: 'overwrite or append (default overwrite)' }
        },
        ['path', 'content']
      )
    }
  }
]

const parseLimit = (value: unknown, fallback: number, max: number): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback
  }

  const rounded = Math.floor(value)
  if (rounded < 1) {
    return 1
  }

  return Math.min(rounded, max)
}

const formatLargeText = (content: string, maxChars = 8_000): string => {
  if (content.length <= maxChars) {
    return content
  }

  const remaining = content.length - maxChars
  return `${content.slice(0, maxChars)}\n...(truncated ${remaining} chars)`
}

export const createAgentTools = (context: ToolExecutionContext = {}): ToolDefinition[] =>
  context.obsidianVault ? [...baseTools, ...obsidianTools] : baseTools

export const agentTools: ToolDefinition[] = createAgentTools()

export const executeTool = (
  name: string,
  args: Record<string, unknown>,
  context: ToolExecutionContext = {}
): { output: string; success: boolean } => {
  try {
    switch (name) {
      case 'run_command': {
        const command = String(args.command ?? '')
        const output = execSync(command, { encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024 })
        return { output: output.trim() || '(no output)', success: true }
      }
      case 'read_file': {
        const filePath = String(args.path ?? '')
        const content = readFileSync(filePath, 'utf8')
        return { output: content, success: true }
      }
      case 'write_file': {
        const filePath = String(args.path ?? '')
        const content = String(args.content ?? '')
        writeFileSync(filePath, content, 'utf8')
        return { output: `Written ${content.length} bytes to ${filePath}`, success: true }
      }
      case 'list_directory': {
        const dirPath = String(args.path ?? '.')
        const entries = readdirSync(dirPath, { withFileTypes: true })
        const output = entries.map((e) => `${e.isDirectory() ? '[dir] ' : '      '}${e.name}`).join('\n')
        return { output: output || '(empty directory)', success: true }
      }
      case 'extract_zip': {
        const archivePath = String(args.archive_path ?? '')
        const destination = String(args.destination ?? '/tmp/extracted')
        mkdirSync(destination, { recursive: true })
        if (archivePath.endsWith('.tar.gz') || archivePath.endsWith('.tgz')) {
          execSync(`tar -xzf "${archivePath}" -C "${destination}"`, { encoding: 'utf8', timeout: 30_000 })
        } else {
          execSync(`unzip -o "${archivePath}" -d "${destination}"`, { encoding: 'utf8', timeout: 30_000 })
        }
        const extracted = readdirSync(destination, { withFileTypes: true })
        const listing = extracted.map((e) => `${e.isDirectory() ? '[dir] ' : '      '}${e.name}`).join('\n')
        return { output: `Extracted to ${destination}:\n${listing}`, success: true }
      }
      case 'obsidian_status': {
        if (!context.obsidianVault) {
          return { output: 'Obsidian integration is unavailable', success: false }
        }

        const current = context.obsidianVault.status()
        if (!current.connected || !current.vaultPath) {
          return { output: 'Obsidian vault is not connected', success: true }
        }

        return {
          output: `Connected to ${current.vaultPath} (${current.noteCount} markdown notes)`,
          success: true
        }
      }
      case 'obsidian_connect': {
        if (!context.obsidianVault) {
          return { output: 'Obsidian integration is unavailable', success: false }
        }

        const vaultPath = String(args.vault_path ?? '').trim()
        const current = context.obsidianVault.connect(vaultPath)
        return {
          output: `Connected to Obsidian vault: ${current.vaultPath ?? vaultPath}`,
          success: true
        }
      }
      case 'obsidian_list_notes': {
        if (!context.obsidianVault) {
          return { output: 'Obsidian integration is unavailable', success: false }
        }

        const limit = parseLimit(args.limit, 50, 500)
        const notes = context.obsidianVault.listNotes(limit)
        if (notes.length === 0) {
          return { output: 'No markdown notes found in the connected vault', success: true }
        }

        const output = notes
          .map((note) => `${note.path} (${note.sizeBytes} bytes)`)
          .join('\n')
        return { output, success: true }
      }
      case 'obsidian_search_notes': {
        if (!context.obsidianVault) {
          return { output: 'Obsidian integration is unavailable', success: false }
        }

        const query = String(args.query ?? '')
        const limit = parseLimit(args.limit, 20, 200)
        const results = context.obsidianVault.searchNotes(query, limit)

        if (results.length === 0) {
          return { output: `No notes matched "${query}"`, success: true }
        }

        const output = results
          .map((result) => `${result.path}:${result.line} ${result.snippet}`)
          .join('\n')
        return { output, success: true }
      }
      case 'obsidian_read_note': {
        if (!context.obsidianVault) {
          return { output: 'Obsidian integration is unavailable', success: false }
        }

        const notePath = String(args.path ?? '')
        const content = context.obsidianVault.readNote(notePath)
        return { output: formatLargeText(content), success: true }
      }
      case 'obsidian_write_note': {
        if (!context.obsidianVault) {
          return { output: 'Obsidian integration is unavailable', success: false }
        }

        const notePath = String(args.path ?? '')
        const content = String(args.content ?? '')
        const mode = args.mode === 'append' ? 'append' : 'overwrite'
        const result = context.obsidianVault.writeNote(notePath, content, mode)
        return {
          output: `Wrote ${result.bytesWritten} bytes to ${result.path} (${result.mode})`,
          success: true
        }
      }
      default:
        return { output: `Unknown tool: ${name}`, success: false }
    }
  } catch (error) {
    return { output: error instanceof Error ? error.message : String(error), success: false }
  }
}
