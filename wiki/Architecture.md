# Architecture

Jarvis is organized as a Node.js monorepo using npm workspaces.

## Package layout

- `terminal-jarvis/packages/core`: shared runtime, engine adapters, services
- `terminal-jarvis/packages/cli`: terminal app and REPL
- `terminal-jarvis/packages/api`: Fastify API server
- `terminal-jarvis/packages/desktop`: Electron + React desktop app
- `terminal-jarvis/site`: Vercel marketing/download page

## Data flow

1. UI layer (CLI/Desktop/API) sends a chat request.
2. `@jarvis/core` routes request to the selected engine (mock or Ollama).
3. Streaming chunks are emitted to caller.
4. Optional vault context and retrieval are injected.
5. Response and transcript are persisted locally.

## Local-first defaults

- Config and state are under `~/.jarvis`
- No cloud dependency is required for baseline usage
- Obsidian integration reads local vault content directly

## Runtime policy

- Node.js `22.x`
- TypeScript strict mode
- Linux + Windows release targets
