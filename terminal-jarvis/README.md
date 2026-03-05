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
