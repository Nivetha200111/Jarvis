# Getting Started

## 1. Prerequisites

Use Node.js `22.x`.

Linux (CachyOS/Arch):

```bash
sudo pacman -S --needed git python make gcc cmake pkgconf
```

Windows (PowerShell):

```powershell
winget install Git.Git Python.Python.3.11 Kitware.CMake
```

## 2. Clone and install

```bash
git clone https://github.com/Nivetha200111/Jarvis.git
cd Jarvis/terminal-jarvis
npm ci
npm run check-env
npm run build
```

## 3. Run interfaces

```bash
npm run dev:cli
npm run dev:api
npm run dev:desktop
```

## 4. API endpoint

- Base URL: `http://127.0.0.1:8080/v1`
- Health: `GET /health`
- Models: `GET /v1/models`
- Chat: `POST /v1/chat/completions`

## 5. First local model setup

Jarvis works with any Ollama chat model.

```bash
ollama pull qwen2.5:3b
ollama pull qwen2.5:1.5b
ollama pull nomic-embed-text
```
