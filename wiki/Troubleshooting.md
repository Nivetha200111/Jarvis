# Troubleshooting

## App is slow on second message

- Use smaller/faster models (`qwen2.5:1.5b`, `qwen2.5:3b`)
- Confirm Ollama is running locally
- Avoid very large context injection when not needed

## Desktop app does not start

- Confirm Node `22.x`
- Rebuild:

```bash
cd /home/nivetha/Jarvis/terminal-jarvis
npm ci
npm run build
npm run dev:desktop
```

## Download button opens Releases page with no files

The repo needs a published release with attached artifacts.

Check:

- `.github/workflows/release-artifacts.yml` exists
- Tag format is `v*` (example: `v0.2.3`)
- Workflow completed and assets were uploaded

## Vault context is not picked up

- Verify vault path points to folder containing `.md` files
- Reconnect vault from desktop UI
- Keep retrieval model installed (`nomic-embed-text`)

## API requests blocked

If you set `JARVIS_API_KEY`, clients must send one of:

- `Authorization: Bearer <key>`
- `x-api-key: <key>`
