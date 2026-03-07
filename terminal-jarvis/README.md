# Terminal Jarvis

Local-first AI assistant with a terminal experience, desktop app, and OpenAI-compatible API.

Terminal Jarvis is designed for people who want local control, local data, and practical agent capabilities on their own machine.

## Core Promise

Terminal Jarvis is not trying to be a generic AI wrapper.

The product promise is:

- a private assistant for knowledge workers
- local context from your vault, files, and schedule
- real actions on your machine
- no cloud dependency required for the core experience

## Why Terminal Jarvis

- Fully local execution through Ollama-compatible models
- Desktop + CLI + API surfaces in one codebase
- Built-in Obsidian vault integration
- Local calendar with optional Google one-click import
- Local RAG retrieval from indexed files/notes
- Optional live screen vision mode (vision-capable Ollama models)
- Streaming output with queued prompts
- Multi-turn conversation memory with local prompt compaction
- Automatic fast/agent/vision model routing
- Persistent audit trail for context use and tool actions
- Agent permission profile with controllable tool classes
- Deterministic prompt compaction for faster long sessions
- Agent tools for shell/files/system actions
- Linux + Windows portable release bundles

## Quick Start (Source)

```bash
cd /home/nivetha/Jarvis/terminal-jarvis
npm ci
npm run check-env
npm run build
```

Node policy: `22.x` (see `.nvmrc`).

## Run Interfaces

- CLI: `npm run dev:cli`
- API: `npm run dev:api`
- Desktop: `npm run dev:desktop`
- Site (Vercel preview): `npm run dev:site` (http://localhost:4173)

## Portable Releases

Releases are published with Linux + Windows desktop bundles:

- Linux: `terminal-jarvis-linux-x64.tar.gz`
- Windows: `terminal-jarvis-windows-x64.zip`

Bundle launchers:

- Linux: `./run-jarvis.sh`
- Windows: `run-jarvis.bat`

On first launch, the installer/launcher auto-provisions:

- `qwen2.5:3b` (preferred), fallback to `qwen2.5:1.5b`, then `qwen2.5`
- `qwen2.5vl:3b` (preferred), fallback to `qwen2.5-vl:3b`, then `llava:7b`/`llava` for live screen vision
- `nomic-embed-text` for RAG embeddings

After baseline setup, the desktop welcome screen can pull extra Ollama models from the live catalog before the user enters chat.

## Obsidian + RAG

Two ways to integrate with Obsidian:

1. Desktop built-in vault mode
- Open Desktop and click `connect vault`
- Search/read/write notes from Jarvis
- `save reply` appends to `Jarvis/YYYY-MM-DD.md` in your vault

2. API via Obsidian plugins
- Start API: `JARVIS_ENGINE=ollama npm run dev:api`
- Endpoint: `http://127.0.0.1:8080/v1`
- Model: from `GET /v1/models`

Detailed guide: `docs/obsidian-integration.md`
Release checklist: `docs/ship-readiness.md`

## Calendar Assistant Context

- Desktop includes a local schedule store at `~/.jarvis/calendar/events.json`
- Add events directly from the `+ Event` button
- Use `Google Sync` to import from Google Calendar into local storage
- Jarvis can use schedule context in chat (`Schedule On`)

To enable Google import, set:

```bash
export JARVIS_GOOGLE_CLIENT_ID="your-desktop-oauth-client-id.apps.googleusercontent.com"
```

Then restart desktop and click `Google Sync` once.

## Security Defaults

- API auth is available with `JARVIS_API_KEY`
  - Accepts `Authorization: Bearer <key>` or `x-api-key`
- CORS defaults to local browser origins when `JARVIS_CORS_ORIGIN` is unset
- If you set permissive CORS (`*`/`true`), Jarvis logs a security warning
- Ollama is local-only by default
  - Jarvis refuses non-local `OLLAMA_BASE_URL` values unless `JARVIS_ALLOW_REMOTE_OLLAMA=1`
- Agent permissions are explicit and controllable
  - `JARVIS_ENABLE_SHELL_TOOLS`
  - `JARVIS_ENABLE_FILE_TOOLS`
  - `JARVIS_ENABLE_SYSTEM_TOOLS`
  - `JARVIS_ENABLE_OBSIDIAN_TOOLS`
  - `JARVIS_ENABLE_RAG_TOOLS`
  - `JARVIS_ENABLE_CALENDAR_TOOLS`
- Jarvis writes a local audit trail to `~/.jarvis/audit/events.jsonl`
  - context attached
  - tool actions taken
  - write operations performed
- Agent mode has intentionally high local privileges (shell/files/system tools)
  - Jarvis logs a warning because this cannot be fully sandboxed without removing core features
- Suppress warnings with `JARVIS_SUPPRESS_SECURITY_WARNINGS=1`

## Performance

- Long prompts are compacted locally before inference
- Older turns are folded into a deterministic memory block
- Retrieved vault/RAG/schedule context is deduplicated and trimmed against the latest user request
- Desktop keeps real multi-turn chat history instead of treating each message as an isolated one-off
- Jarvis auto-picks fast local models for chat, stronger defaults for agent mode, and vision models for live screen flows
- This keeps sessions faster without sending data to any external summarizer

## Private Beta Status

Terminal Jarvis is now a serious private-beta candidate:

- local-only defaults are enforced
- long sessions are faster because prompts are compacted before inference
- vault, calendar, agent tools, and desktop flows are integrated into one product

It is not finished.
The remaining work for a strong paid product is onboarding quality, retrieval accuracy, reliability under repeated use, and installer polish.

## Monetization Path

If you want to turn Jarvis into a business, do not sell "a local chatbot".
Sell a private local productivity system with strong workflows and predictable privacy.

Roadmap: `docs/monetization-roadmap.md`

## Local-First Paths

Default local paths target `~/.jarvis`:

- data directory: `~/.jarvis`
- models directory: `~/.jarvis/models`
- config file: `~/.jarvis/config.toml`
- vector store: `~/.jarvis/vectors.json`

## Developer Workflow

Quality gates:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run test:e2e`
- `npm run smoke:cli && npm run smoke:api && npm run smoke:desktop`

Release pipeline:

- CI workflow: `.github/workflows/ci.yml`
- Release workflow: `.github/workflows/release-artifacts.yml`
- Tag-based release trigger: `v*`

## Monorepo Layout

- `packages/core` shared runtime, tools, services
- `packages/cli` terminal interface
- `packages/api` local OpenAI-compatible API
- `packages/desktop` Electron + React app
- `site` Vercel-ready marketing/download page

## Jarvis vs Ollama

- Ollama is the local model runtime
- Jarvis is the product layer on top:
  - UX surfaces (CLI/Desktop/API)
  - Agent tools + workflows
  - Obsidian integration + local RAG
  - Config/transcripts and packaging

## Contributing

Contributions are very welcome. If you want to help make local AI tools better, join in.

### High-impact areas right now

- Performance optimization for desktop + agent loops
- Better model routing/default selection logic
- Security hardening with feature parity preserved
- Windows/Linux packaging polish and installer UX
- RAG quality and retrieval tuning
- Documentation, onboarding, and examples

### How to contribute

1. Fork and clone the repo
2. Create a branch: `git checkout -b feat/your-change`
3. Run checks locally (`lint`, `typecheck`, `test`, smoke)
4. Open a PR with a clear description and screenshots/logs where relevant

If you want to contribute but don’t know where to start, open an issue and say you want a "good first task" and we’ll give you one.

## Community Call

If Terminal Jarvis is useful to you, please star the repo, open issues, and send PRs.
The goal is to build a serious local-first assistant that people can trust and extend.
