# Terminal Jarvis Monorepo

This is the runnable baseline monorepo for Terminal Jarvis.

## Quick Start

1. Use Node.js 22.x (`cat .nvmrc`)
2. Install dependencies: `npm ci`
3. Verify environment: `npm run check-env`
4. Build everything: `npm run build`

## Run Apps

- CLI: `npm run dev:cli`
- API: `npm run dev:api`
- Desktop: `npm run dev:desktop`
- Marketing site: `npm run dev:site` (http://localhost:4173)

## Obsidian Integration

Use the local OpenAI-compatible API with Obsidian plugins that support custom OpenAI endpoints.

- Start API: `JARVIS_ENGINE=ollama npm run dev:api`
- Base URL in Obsidian plugin: `http://127.0.0.1:8080/v1`
- API key: any non-empty string
- Model: one returned by `GET /v1/models`

Full guide: `docs/obsidian-integration.md`

Built-in desktop vault mode is also available:
- open Desktop: `npm run dev:desktop`
- click `connect vault` in the header and pick your Obsidian vault folder
- ask Jarvis to search/read/write notes, or use `save reply` to append the latest response into `Jarvis/YYYY-MM-DD.md`

## Jarvis vs Ollama

- Ollama:
  - focuses on local model serving and chat primitives
  - model/runtime management + API endpoints
- Jarvis:
  - can use Ollama as its inference backend
  - adds CLI + desktop app + agent tooling (file/command tools)
  - adds transcript/config workflows and a unified product UX

### Use Ollama Models

By default runtime selection is `auto`:
- if local Ollama models are discovered (`ollama list`), Jarvis uses Ollama
- otherwise it falls back to the mock engine

You can force provider selection:

```bash
JARVIS_ENGINE=ollama npm run dev:cli
JARVIS_ENGINE=mock npm run dev:cli
```

If Ollama has no local model yet, pull one first:

```bash
ollama pull llama3.2
JARVIS_ENGINE=ollama npm run dev:cli
```

## Quality Gates

- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Tests: `npm run test`
- E2E placeholder: `npm run test:e2e`
- Smoke checks: `npm run smoke:cli && npm run smoke:api && npm run smoke:desktop`

## Security Notes

- API auth: set `JARVIS_API_KEY` to require `Authorization: Bearer <key>` (or `x-api-key`) for `/v1/*` endpoints.
- CORS defaults to local browser origins only when `JARVIS_CORS_ORIGIN` is unset.
- If you explicitly set `JARVIS_CORS_ORIGIN=*` (or `true`), Jarvis logs a security warning because any website can call the local API from a browser.
- Agent mode intentionally has high local privileges (shell/file/system tools). This cannot be fully sandboxed without removing core features; Jarvis logs a warning at runtime.
- You can suppress warning logs with `JARVIS_SUPPRESS_SECURITY_WARNINGS=1`.

## Local-First Defaults

Configuration defaults target `~/.jarvis` for future persistence:

- data directory: `~/.jarvis`
- models directory: `~/.jarvis/models`
- config file: `~/.jarvis/config.toml`

## Marketing Page (Vercel)

- Static marketing/download page is in `site/`
- Vercel config is in `vercel.json`
- Deploy `terminal-jarvis` as the project root in Vercel
- Download buttons include Linux (`.tar.gz`) and Windows (`.zip`) release targets

## Release Bundles

- Workflow: `.github/workflows/release-artifacts.yml`
- Trigger: tag push like `v0.1.0` (or manual `workflow_dispatch`)
- Publishes:
  - `terminal-jarvis-linux-x64.tar.gz`
  - `terminal-jarvis-windows-x64.zip`
- Bundle includes:
  - `app/` (desktop app build)
  - `electron/` runtime
  - launcher scripts: `run-jarvis.sh` (Linux) or `run-jarvis.bat` (Windows)
