import { chmod, cp, mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const EMBEDDING_MODEL = 'nomic-embed-text'
const CHAT_MODEL_CANDIDATES = ['qwen2.5:3b', 'qwen2.5:1.5b', 'qwen2.5']
const VISION_MODEL_CANDIDATES = ['qwen2.5vl:3b', 'qwen2.5-vl:3b', 'llava:7b', 'llava']

const parseArgs = () => {
  const args = process.argv.slice(2)
  const values = new Map()

  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]
    const value = args[index + 1]
    if (!key?.startsWith('--') || !value) {
      continue
    }
    values.set(key.slice(2), value)
    index += 1
  }

  const platform = values.get('platform')
  const outDir = values.get('out')

  if (platform !== 'linux' && platform !== 'windows') {
    throw new Error('Expected --platform linux|windows')
  }

  if (!outDir) {
    throw new Error('Expected --out <directory>')
  }

  return {
    platform,
    outDir: resolve(repoRoot, outDir)
  }
}

const ensureExists = async (path) => {
  try {
    await stat(path)
  } catch {
    throw new Error(`Required path does not exist: ${path}`)
  }
}

const writeBundleReadme = async (bundlePath, platform) => {
  const launchLine = platform === 'windows'
    ? 'run-jarvis.bat'
    : './run-jarvis.sh'

  const content = `Terminal Jarvis Portable Bundle
================================

Quick start:
1. Install Ollama (https://ollama.com)
2. Launch Jarvis: ${launchLine}
   (The launcher auto-pulls required models on first run)

What gets set up automatically:
- qwen2.5:3b (or qwen2.5:1.5b, then qwen2.5 fallback) — main chat/agent model
- qwen2.5vl:3b (or qwen2.5-vl:3b, then llava fallback) — vision model for live screen mode
- ${EMBEDDING_MODEL} — local embeddings for RAG (knowledge base)

Notes:
- No npm install is required for this bundle.
- If Ollama is not available, Jarvis falls back to a local mock model.
- Obsidian support is built in: use "connect vault" in the desktop app.
- RAG: uploaded files and vault notes are auto-indexed for semantic retrieval.
- Everything runs 100% locally. No cloud, no telemetry.
`

  await writeFile(join(bundlePath, 'README.txt'), content, 'utf8')
}

const writeLaunchers = async (bundlePath, platform) => {
  if (platform === 'linux') {
    const script = `#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export JARVIS_ENGINE="\${JARVIS_ENGINE:-auto}"
unset ELECTRON_RUN_AS_NODE

# Auto-setup: ensure Ollama has required models
if command -v ollama >/dev/null 2>&1; then
  echo "[jarvis] Checking Ollama models..."

  if ! ollama show ${EMBEDDING_MODEL} >/dev/null 2>&1; then
    echo "[jarvis] Pulling ${EMBEDDING_MODEL} for local RAG..."
    ollama pull ${EMBEDDING_MODEL} || echo "[jarvis] Warning: could not pull ${EMBEDDING_MODEL}. RAG may be unavailable."
  fi

  CHAT_MODEL=""
  for CANDIDATE in ${CHAT_MODEL_CANDIDATES.join(' ')}; do
    if ollama show "$CANDIDATE" >/dev/null 2>&1; then
      CHAT_MODEL="$CANDIDATE"
      break
    fi
  done

  if [ -z "$CHAT_MODEL" ]; then
    for CANDIDATE in ${CHAT_MODEL_CANDIDATES.join(' ')}; do
      echo "[jarvis] Pulling $CANDIDATE..."
      if ollama pull "$CANDIDATE"; then
        CHAT_MODEL="$CANDIDATE"
        break
      fi
      echo "[jarvis] Warning: failed to pull $CANDIDATE"
    done
  fi

  if [ -n "$CHAT_MODEL" ]; then
    echo "[jarvis] Chat model ready: $CHAT_MODEL"
  else
    echo "[jarvis] Warning: no chat model available from auto-setup list."
  fi

  VISION_MODEL=""
  for CANDIDATE in ${VISION_MODEL_CANDIDATES.join(' ')}; do
    if ollama show "$CANDIDATE" >/dev/null 2>&1; then
      VISION_MODEL="$CANDIDATE"
      break
    fi
  done

  if [ -z "$VISION_MODEL" ]; then
    for CANDIDATE in ${VISION_MODEL_CANDIDATES.join(' ')}; do
      echo "[jarvis] Pulling vision model $CANDIDATE..."
      if ollama pull "$CANDIDATE"; then
        VISION_MODEL="$CANDIDATE"
        break
      fi
      echo "[jarvis] Warning: failed to pull vision model $CANDIDATE"
    done
  fi

  if [ -n "$VISION_MODEL" ]; then
    echo "[jarvis] Vision model ready: $VISION_MODEL"
  else
    echo "[jarvis] Warning: no vision model available from auto-setup list. Live screen mode may be unavailable."
  fi
else
  echo "[jarvis] Ollama not found. Jarvis will run with mock fallback until Ollama is installed."
fi

"$SCRIPT_DIR/electron/electron" "$SCRIPT_DIR/app/main.cjs"
`
    const path = join(bundlePath, 'run-jarvis.sh')
    await writeFile(path, script, 'utf8')
    await chmod(path, 0o755)
    return
  }

  const batch = `@echo off
setlocal EnableDelayedExpansion
set "SCRIPT_DIR=%~dp0"
if "%JARVIS_ENGINE%"=="" set "JARVIS_ENGINE=auto"
set "ELECTRON_RUN_AS_NODE="
set "CHAT_MODEL="
set "VISION_MODEL="

REM Auto-setup: ensure Ollama has required models
where ollama >nul 2>&1
if !errorlevel! neq 0 (
  echo [jarvis] Ollama not found. Jarvis will run with mock fallback until Ollama is installed.
  goto launch
)

echo [jarvis] Checking Ollama models...
ollama show ${EMBEDDING_MODEL} >nul 2>&1
if !errorlevel! neq 0 (
  echo [jarvis] Pulling ${EMBEDDING_MODEL} for local RAG...
  ollama pull ${EMBEDDING_MODEL} >nul 2>&1
  if !errorlevel! neq 0 echo [jarvis] Warning: could not pull ${EMBEDDING_MODEL}. RAG may be unavailable.
)

for %%M in (${CHAT_MODEL_CANDIDATES.join(' ')}) do (
  if not defined CHAT_MODEL (
    ollama show %%M >nul 2>&1
    if !errorlevel! equ 0 set "CHAT_MODEL=%%M"
  )
)

if not defined CHAT_MODEL (
  for %%M in (${CHAT_MODEL_CANDIDATES.join(' ')}) do (
    if not defined CHAT_MODEL (
      echo [jarvis] Pulling %%M...
      ollama pull %%M >nul 2>&1
      if !errorlevel! equ 0 set "CHAT_MODEL=%%M"
    )
  )
)

if defined CHAT_MODEL (
  echo [jarvis] Chat model ready: !CHAT_MODEL!
) else (
  echo [jarvis] Warning: no chat model available from auto-setup list.
)

for %%M in (${VISION_MODEL_CANDIDATES.join(' ')}) do (
  if not defined VISION_MODEL (
    ollama show %%M >nul 2>&1
    if !errorlevel! equ 0 set "VISION_MODEL=%%M"
  )
)

if not defined VISION_MODEL (
  for %%M in (${VISION_MODEL_CANDIDATES.join(' ')}) do (
    if not defined VISION_MODEL (
      echo [jarvis] Pulling vision model %%M...
      ollama pull %%M >nul 2>&1
      if !errorlevel! equ 0 set "VISION_MODEL=%%M"
    )
  )
)

if defined VISION_MODEL (
  echo [jarvis] Vision model ready: !VISION_MODEL!
) else (
  echo [jarvis] Warning: no vision model available from auto-setup list. Live screen mode may be unavailable.
)

:launch
endlocal & set "JARVIS_ENGINE=auto" & set "ELECTRON_RUN_AS_NODE="
"%~dp0electron\\electron.exe" "%~dp0app\\main.cjs"
`
  await writeFile(join(bundlePath, 'run-jarvis.bat'), batch, 'utf8')
}

const main = async () => {
  const { platform, outDir } = parseArgs()

  const desktopDist = join(repoRoot, 'packages', 'desktop', 'dist')
  const electronDist = join(repoRoot, 'node_modules', 'electron', 'dist')

  await ensureExists(desktopDist)
  await ensureExists(electronDist)

  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })

  await cp(desktopDist, join(outDir, 'app'), { recursive: true })
  await cp(electronDist, join(outDir, 'electron'), { recursive: true })

  await writeBundleReadme(outDir, platform)
  await writeLaunchers(outDir, platform)

  console.log(`Portable bundle prepared at ${outDir}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
