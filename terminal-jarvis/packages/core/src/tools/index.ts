import { execFileSync, execSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { ToolDefinition, ToolPermissionSet } from '../types/index.js'
import type { ObsidianVaultService } from '../services/obsidian-vault.js'
import type { RagService } from '../services/rag-service.js'
import type { CalendarService } from '../services/calendar-service.js'

export interface SystemToolCallbacks {
  captureScreen?: () => Promise<{ path: string; width: number; height: number; timestamp: string; activeWindow: string }>
  getSystemInfo?: () => Promise<Record<string, string>>
  getActiveWindow?: () => Promise<string>
  openUrl?: (url: string) => Promise<void>
  notify?: (title: string, body: string) => Promise<void>
  getClipboard?: () => Promise<string>
  setClipboard?: (text: string) => Promise<void>
}

export interface ToolExecutionContext {
  obsidianVault?: ObsidianVaultService
  ragService?: RagService
  calendarService?: CalendarService
  system?: SystemToolCallbacks
  permissions?: Partial<ToolPermissionSet>
}

const toObjectSchema = (
  properties: Record<string, { type: string; description: string }>,
  required: string[] = []
): ToolDefinition['function']['parameters'] => ({
  type: 'object',
  properties,
  required
})

const systemTools: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'screenshot',
      description: 'Capture the current screen and get information about what the user is doing. Returns file path, dimensions, active window title, and timestamp. Use this when the user asks about what is on their screen or needs help with what they are looking at.',
      parameters: toObjectSchema({})
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_system_info',
      description: 'Get system information including hostname, user, OS, CPU, memory usage, and uptime.',
      parameters: toObjectSchema({})
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_active_window',
      description: 'Get the title of the currently focused window on the user\'s screen.',
      parameters: toObjectSchema({})
    }
  },
  {
    type: 'function',
    function: {
      name: 'open_url',
      description: 'Open a URL in the user\'s default browser.',
      parameters: toObjectSchema(
        {
          url: { type: 'string', description: 'The URL to open' }
        },
        ['url']
      )
    }
  },
  {
    type: 'function',
    function: {
      name: 'notify',
      description: 'Send a desktop notification to the user.',
      parameters: toObjectSchema(
        {
          title: { type: 'string', description: 'Notification title' },
          body: { type: 'string', description: 'Notification body text' }
        },
        ['title', 'body']
      )
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_clipboard',
      description: 'Read the current clipboard text content.',
      parameters: toObjectSchema({})
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_clipboard',
      description: 'Set the clipboard content to the given text.',
      parameters: toObjectSchema(
        {
          text: { type: 'string', description: 'Text to copy to clipboard' }
        },
        ['text']
      )
    }
  }
]

const shellTools: ToolDefinition[] = [
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
  }
]

const fileTools: ToolDefinition[] = [
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

const ragTools: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'rag_search',
      description: 'Search the local knowledge base for semantically relevant information. Use this to find relevant context from previously indexed files and notes.',
      parameters: toObjectSchema(
        {
          query: { type: 'string', description: 'Natural language search query' },
          limit: { type: 'number', description: 'Max results to return (default 5)' }
        },
        ['query']
      )
    }
  },
  {
    type: 'function',
    function: {
      name: 'rag_index',
      description: 'Index text content into the local knowledge base for future retrieval.',
      parameters: toObjectSchema(
        {
          source: { type: 'string', description: 'Source identifier (e.g. file path or label)' },
          text: { type: 'string', description: 'Text content to index' }
        },
        ['source', 'text']
      )
    }
  },
  {
    type: 'function',
    function: {
      name: 'rag_stats',
      description: 'Get statistics about the local knowledge base (number of chunks, sources).',
      parameters: toObjectSchema({})
    }
  }
]

const calendarTools: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'calendar_upcoming',
      description: 'List upcoming events from the local calendar.',
      parameters: toObjectSchema(
        {
          limit: { type: 'number', description: 'Max events to return (default 8)' },
          horizon_days: { type: 'number', description: 'How many days ahead to check (default 14)' }
        }
      )
    }
  },
  {
    type: 'function',
    function: {
      name: 'calendar_add_event',
      description: 'Create a local calendar event for scheduling tasks and reminders.',
      parameters: toObjectSchema(
        {
          title: { type: 'string', description: 'Event title' },
          start_time: { type: 'string', description: 'Event start time (ISO datetime)' },
          end_time: { type: 'string', description: 'Event end time (ISO datetime)' },
          location: { type: 'string', description: 'Optional location' },
          description: { type: 'string', description: 'Optional notes' }
        },
        ['title', 'start_time']
      )
    }
  },
  {
    type: 'function',
    function: {
      name: 'calendar_stats',
      description: 'Get local calendar statistics and upcoming event counts.',
      parameters: toObjectSchema({})
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

const DEFAULT_TOOL_PERMISSIONS: ToolPermissionSet = {
  shell: true,
  files: true,
  system: true,
  obsidian: true,
  rag: true,
  calendar: true
}

type PermissionKey = keyof ToolPermissionSet

const TOOL_PERMISSION_MAP: Partial<Record<string, PermissionKey>> = {
  run_command: 'shell',
  read_file: 'files',
  write_file: 'files',
  list_directory: 'files',
  extract_zip: 'files',
  screenshot: 'system',
  get_system_info: 'system',
  get_active_window: 'system',
  open_url: 'system',
  notify: 'system',
  get_clipboard: 'system',
  set_clipboard: 'system',
  obsidian_status: 'obsidian',
  obsidian_connect: 'obsidian',
  obsidian_list_notes: 'obsidian',
  obsidian_search_notes: 'obsidian',
  obsidian_read_note: 'obsidian',
  obsidian_write_note: 'obsidian',
  rag_search: 'rag',
  rag_index: 'rag',
  rag_stats: 'rag',
  calendar_upcoming: 'calendar',
  calendar_add_event: 'calendar',
  calendar_stats: 'calendar'
}

export const resolveToolPermissions = (
  permissions: Partial<ToolPermissionSet> = {}
): ToolPermissionSet => ({
  ...DEFAULT_TOOL_PERMISSIONS,
  ...permissions
})

export const toToolPermissionSummary = (permissions: Partial<ToolPermissionSet> = {}): string => {
  const resolved = resolveToolPermissions(permissions)
  const enabled = Object.entries(resolved)
    .filter(([, value]) => value)
    .map(([key]) => key)
  const disabled = Object.entries(resolved)
    .filter(([, value]) => !value)
    .map(([key]) => key)

  if (disabled.length === 0) {
    return `Agent permissions: full local access (${enabled.join(', ')}).`
  }

  return `Agent permissions: enabled ${enabled.join(', ')}; disabled ${disabled.join(', ')}.`
}

export const createAgentTools = (context: ToolExecutionContext = {}): ToolDefinition[] => {
  const permissions = resolveToolPermissions(context.permissions)
  const tools: ToolDefinition[] = []

  if (permissions.shell) tools.push(...shellTools)
  if (permissions.files) tools.push(...fileTools)
  if (permissions.system && context.system) tools.push(...systemTools)
  if (permissions.obsidian && context.obsidianVault) tools.push(...obsidianTools)
  if (permissions.rag && context.ragService) tools.push(...ragTools)
  if (permissions.calendar && context.calendarService) tools.push(...calendarTools)
  return tools
}

export const agentTools: ToolDefinition[] = createAgentTools()

export const executeTool = async (
  name: string,
  args: Record<string, unknown>,
  context: ToolExecutionContext = {}
): Promise<{ output: string; success: boolean }> => {
  try {
    const permissions = resolveToolPermissions(context.permissions)
    const requiredPermission = TOOL_PERMISSION_MAP[name]
    if (requiredPermission && !permissions[requiredPermission]) {
      return {
        output: `${name} is disabled by the current Jarvis agent permission profile (${requiredPermission}).`,
        success: false
      }
    }

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
        const destination = String(args.destination ?? (process.platform === 'win32' ? process.env.TEMP + '\\extracted' : '/tmp/extracted'))
        mkdirSync(destination, { recursive: true })
        if (archivePath.endsWith('.tar.gz') || archivePath.endsWith('.tgz')) {
          execFileSync('tar', ['-xzf', archivePath, '-C', destination], {
            encoding: 'utf8',
            timeout: 30_000,
            shell: process.platform === 'win32'
          })
        } else if (process.platform === 'win32') {
          execSync(`powershell.exe -NoProfile -Command "Expand-Archive -Force -Path '${archivePath.replace(/'/g, "''")}' -DestinationPath '${destination.replace(/'/g, "''")}'\"`, {
            encoding: 'utf8',
            timeout: 30_000
          })
        } else {
          execFileSync('unzip', ['-o', archivePath, '-d', destination], {
            encoding: 'utf8',
            timeout: 30_000
          })
        }
        const extracted = readdirSync(destination, { withFileTypes: true })
        const listing = extracted.map((e) => `${e.isDirectory() ? '[dir] ' : '      '}${e.name}`).join('\n')
        return { output: `Extracted to ${destination}:\n${listing}`, success: true }
      }
      // System tools
      case 'screenshot': {
        if (!context.system?.captureScreen) {
          return { output: 'Screen capture is unavailable in this environment', success: false }
        }
        const capture = await context.system.captureScreen()
        return {
          output: `Screenshot saved: ${capture.path}\nDimensions: ${capture.width}x${capture.height}\nActive window: ${capture.activeWindow}\nTimestamp: ${capture.timestamp}`,
          success: true
        }
      }
      case 'get_system_info': {
        if (!context.system?.getSystemInfo) {
          return { output: 'System info is unavailable in this environment', success: false }
        }
        const info = await context.system.getSystemInfo()
        const output = Object.entries(info).map(([k, v]) => `${k}: ${v}`).join('\n')
        return { output, success: true }
      }
      case 'get_active_window': {
        if (!context.system?.getActiveWindow) {
          return { output: 'Active window detection is unavailable in this environment', success: false }
        }
        const title = await context.system.getActiveWindow()
        return { output: title, success: true }
      }
      case 'open_url': {
        if (!context.system?.openUrl) {
          return { output: 'URL opening is unavailable in this environment', success: false }
        }
        const url = String(args.url ?? '')
        await context.system.openUrl(url)
        return { output: `Opened ${url}`, success: true }
      }
      case 'notify': {
        if (!context.system?.notify) {
          return { output: 'Desktop notifications are unavailable in this environment', success: false }
        }
        const title = String(args.title ?? '')
        const body = String(args.body ?? '')
        await context.system.notify(title, body)
        return { output: `Notification sent: ${title}`, success: true }
      }
      case 'get_clipboard': {
        if (!context.system?.getClipboard) {
          return { output: 'Clipboard access is unavailable in this environment', success: false }
        }
        const text = await context.system.getClipboard()
        return { output: text || '(clipboard is empty)', success: true }
      }
      case 'set_clipboard': {
        if (!context.system?.setClipboard) {
          return { output: 'Clipboard access is unavailable in this environment', success: false }
        }
        const text = String(args.text ?? '')
        await context.system.setClipboard(text)
        return { output: `Copied ${text.length} chars to clipboard`, success: true }
      }
      // Obsidian tools
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
          return { output: `No direct note matches yet for "${query}". Try broader keywords or use obsidian_list_notes.`, success: true }
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
      // RAG tools
      case 'rag_search': {
        if (!context.ragService) {
          return { output: 'RAG knowledge base is unavailable', success: false }
        }

        const query = String(args.query ?? '')
        const limit = parseLimit(args.limit, 5, 20)
        const results = await context.ragService.retrieve(query, limit)

        if (results.length === 0) {
          return { output: `Knowledge base has no strong semantic matches for "${query}" yet. Try broader keywords or index more content.`, success: true }
        }

        const output = results
          .map((r) => `[${r.source} | score: ${r.score.toFixed(2)}]\n${r.text}`)
          .join('\n---\n')
        return { output, success: true }
      }
      case 'rag_index': {
        if (!context.ragService) {
          return { output: 'RAG knowledge base is unavailable', success: false }
        }

        const source = String(args.source ?? '')
        const text = String(args.text ?? '')
        const chunksAdded = await context.ragService.index(source, text)
        return { output: `Indexed ${chunksAdded} chunks from ${source}`, success: true }
      }
      case 'rag_stats': {
        if (!context.ragService) {
          return { output: 'RAG knowledge base is unavailable', success: false }
        }

        const stats = context.ragService.getStats()
        return {
          output: `Knowledge base: ${stats.totalChunks} chunks from ${stats.sources.length} sources\nEmbedding model: ${stats.embeddingModel}\nSources: ${stats.sources.join(', ') || '(none)'}`,
          success: true
        }
      }
      // Calendar tools
      case 'calendar_upcoming': {
        if (!context.calendarService) {
          return { output: 'Calendar integration is unavailable', success: false }
        }

        const limit = parseLimit(args.limit, 8, 100)
        const horizonDays = parseLimit(args.horizon_days, 14, 365)
        const events = context.calendarService.upcomingEvents(limit, horizonDays)
        if (events.length === 0) {
          return { output: `No upcoming events in the next ${horizonDays} day(s).`, success: true }
        }

        const output = events
          .map((event) =>
            `${new Date(event.startTime).toISOString()} - ${event.title}${event.location ? ` @ ${event.location}` : ''} [${event.source}]`
          )
          .join('\n')
        return { output, success: true }
      }
      case 'calendar_add_event': {
        if (!context.calendarService) {
          return { output: 'Calendar integration is unavailable', success: false }
        }

        const title = String(args.title ?? '').trim()
        const startRaw = String(args.start_time ?? '').trim()
        const endRaw = String(args.end_time ?? '').trim()
        const startTime = Date.parse(startRaw)
        if (!title || Number.isNaN(startTime)) {
          return { output: 'Valid title and start_time are required (ISO datetime).', success: false }
        }
        const endTime = endRaw ? Date.parse(endRaw) : startTime + 3_600_000
        const next = context.calendarService.addEvent({
          title,
          startTime,
          endTime: Number.isNaN(endTime) ? undefined : endTime,
          location: String(args.location ?? '').trim(),
          description: String(args.description ?? '').trim(),
          source: 'local'
        })
        return {
          output: `Created event "${next.title}" at ${new Date(next.startTime).toISOString()} (${next.id})`,
          success: true
        }
      }
      case 'calendar_stats': {
        if (!context.calendarService) {
          return { output: 'Calendar integration is unavailable', success: false }
        }

        const stats = context.calendarService.getStats()
        return {
          output: `Calendar events: ${stats.totalEvents} total | ${stats.upcomingEvents} upcoming | ${stats.localEvents} local | ${stats.googleEvents} Google`,
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
