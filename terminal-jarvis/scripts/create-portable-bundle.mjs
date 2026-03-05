import { chmod, cp, mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

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
2. Pull a model (recommended): ollama pull qwen2.5
3. Launch Jarvis: ${launchLine}

Notes:
- No npm install is required for this bundle.
- If Ollama is not available, Jarvis falls back to a local mock model.
- Obsidian support is built in: use "connect vault" in the desktop app.
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
"$SCRIPT_DIR/electron/electron" "$SCRIPT_DIR/app/main.cjs"
`
    const path = join(bundlePath, 'run-jarvis.sh')
    await writeFile(path, script, 'utf8')
    await chmod(path, 0o755)
    return
  }

  const batch = `@echo off
setlocal
set SCRIPT_DIR=%~dp0
if "%JARVIS_ENGINE%"=="" set JARVIS_ENGINE=auto
set ELECTRON_RUN_AS_NODE=
"%SCRIPT_DIR%electron\\electron.exe" "%SCRIPT_DIR%app\\main.cjs"
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
