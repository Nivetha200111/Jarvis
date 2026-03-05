import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import type { ToolDefinition } from '../types/index.js'

export const agentTools: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Execute a shell command and return stdout. Use for system tasks, installing packages, running scripts, git operations, etc.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the full contents of a file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute or relative file path' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file, creating it if needed.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to write to' },
          content: { type: 'string', description: 'Content to write' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List files and subdirectories at a given path.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path to list (defaults to current directory)' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'extract_zip',
      description: 'Extract a .zip or .tar.gz archive to a destination directory.',
      parameters: {
        type: 'object',
        properties: {
          archive_path: { type: 'string', description: 'Path to the archive file (.zip or .tar.gz)' },
          destination: { type: 'string', description: 'Directory to extract into' }
        },
        required: ['archive_path', 'destination']
      }
    }
  }
]

export const executeTool = (name: string, args: Record<string, unknown>): { output: string; success: boolean } => {
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
      default:
        return { output: `Unknown tool: ${name}`, success: false }
    }
  } catch (error) {
    return { output: error instanceof Error ? error.message : String(error), success: false }
  }
}
