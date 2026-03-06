# Obsidian Integration Guide

This project exposes an OpenAI-compatible local API, so Obsidian plugins that support custom OpenAI endpoints can use Jarvis.

## 1. Built-in Desktop Vault Connection

Desktop has first-class Obsidian vault integration:

```bash
cd /home/nivetha/Jarvis/terminal-jarvis
JARVIS_ENGINE=ollama npm run dev:desktop
```

In the Desktop UI:
- click `connect vault`
- pick your Obsidian vault folder
- keep `Context On` enabled for automatic note injection
- desktop will sync vault notes to local RAG progressively in background (`Syncing vault` badge)
- ask Jarvis to `search notes`, `read note`, or `write note`
- optional: click `save reply` to append the last assistant response into `Jarvis/YYYY-MM-DD.md`

## 2. Start Jarvis API

```bash
cd /home/nivetha/Jarvis/terminal-jarvis
JARVIS_ENGINE=ollama npm run dev:api
```

Notes:
- API URL: `http://127.0.0.1:8080`
- CORS defaults to local browser origins when unset.
- If you want to force CORS policy, set `JARVIS_CORS_ORIGIN`.
  - allow all (not recommended): `JARVIS_CORS_ORIGIN=*`
  - disable CORS headers: `JARVIS_CORS_ORIGIN=false`
  - explicit allow-list: `JARVIS_CORS_ORIGIN=http://localhost:3000,http://127.0.0.1:3000`

## 3. Verify the local API

```bash
curl -s http://127.0.0.1:8080/health
curl -s http://127.0.0.1:8080/v1/models
```

Optional chat test:

```bash
curl -s http://127.0.0.1:8080/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model":"qwen2.5:latest",
    "messages":[{"role":"user","content":"say hello"}],
    "stream":false
  }'
```

## 4. Configure Obsidian plugin

Use any Obsidian plugin that supports:
- OpenAI-compatible API base URL
- custom model name

Set these values in the plugin:
- Base URL: `http://127.0.0.1:8080/v1`
- API key:
  - if `JARVIS_API_KEY` is unset: any non-empty value
  - if `JARVIS_API_KEY` is set: use that exact key
- Model: one of `GET /v1/models` IDs (example: `qwen2.5:latest`)

If the plugin asks for a chat endpoint, use:
- `/chat/completions`

## 5. Typical issues

- `model not found`
  - Pull a model in Ollama first: `ollama pull qwen2.5:latest`
- Plugin cannot connect
  - Confirm Jarvis API is running and port `8080` is free.
- Obsidian browser-style fetch blocked
  - Keep CORS enabled (default) or set `JARVIS_CORS_ORIGIN=*`.
