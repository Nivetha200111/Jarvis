# Terminal Jarvis

Local-first AI assistant with a terminal experience, desktop app, and OpenAI-compatible API.

Terminal Jarvis is designed for people who want local control, local data, and practical agent capabilities on their own machine.

## Why Terminal Jarvis

- Fully local execution through Ollama-compatible models
- Desktop + CLI + API surfaces in one codebase
- Built-in Obsidian vault integration
- Local RAG retrieval from indexed files/notes
- Streaming output with queued prompts
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
- `nomic-embed-text` for RAG embeddings

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

## Security Defaults

- API auth is available with `JARVIS_API_KEY`
  - Accepts `Authorization: Bearer <key>` or `x-api-key`
- CORS defaults to local browser origins when `JARVIS_CORS_ORIGIN` is unset
- If you set permissive CORS (`*`/`true`), Jarvis logs a security warning
- Agent mode has intentionally high local privileges (shell/files/system tools)
  - Jarvis logs a warning because this cannot be fully sandboxed without removing core features
- Suppress warnings with `JARVIS_SUPPRESS_SECURITY_WARNINGS=1`

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
