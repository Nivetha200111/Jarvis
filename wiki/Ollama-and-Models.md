# Ollama and Models

Jarvis uses Ollama as the local model runtime.

## Recommended models

Fast default options:

```bash
ollama pull qwen2.5:3b
ollama pull qwen2.5:1.5b
```

Optional retrieval embeddings:

```bash
ollama pull nomic-embed-text
```

Alternative chat models:

```bash
ollama pull qwen2.5
ollama pull llama3.2
ollama pull mistral
ollama pull gemma2
```

## Engine selection

Use environment variables:

- `JARVIS_ENGINE=auto` (default)
- `JARVIS_ENGINE=ollama`
- `OLLAMA_BASE_URL=http://127.0.0.1:11434`

## Why Jarvis if Ollama exists

Ollama is the model runtime.
Jarvis is the product layer with:

- Desktop + CLI + API
- Vault context and local RAG
- Agent workflows and tools
- Packaging and release bundles
