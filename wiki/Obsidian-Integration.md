# Obsidian Integration

Jarvis has built-in Obsidian vault support.

## Desktop flow

1. Open Jarvis Desktop.
2. Click `connect vault`.
3. Select your vault root folder.
4. Enable vault context.
5. Ask questions about your notes.

## Save replies back to vault

Use `save reply` to append assistant output into:

- `Jarvis/YYYY-MM-DD.md` in your vault

## Tips for better retrieval quality

- Keep notes in `.md` format
- Use descriptive note titles and headings
- Split very large notes into smaller focused notes
- Keep vault path stable and readable by the app

## API + plugin route

You can also run API mode for plugin-based workflows:

```bash
cd /home/nivetha/Jarvis/terminal-jarvis
JARVIS_ENGINE=ollama npm run dev:api
```

Endpoint:

- `http://127.0.0.1:8080/v1`
