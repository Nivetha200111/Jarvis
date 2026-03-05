import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const __dirname = dirname(fileURLToPath(import.meta.url))
const desktopMain = resolve(__dirname, '../packages/desktop/dist/main.cjs')
const env = {
  ...process.env,
  JARVIS_DESKTOP_SMOKE: '1'
}

delete env.ELECTRON_RUN_AS_NODE

const child = spawn(electronPath, [desktopMain], {
  env,
  stdio: ['ignore', 'pipe', 'pipe']
})

let stderr = ''
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString()
})

const code = await new Promise((resolveCode) => {
  child.on('close', resolveCode)
})

if (code !== 0) {
  throw new Error(`Desktop smoke failed with exit code ${code}: ${stderr}`)
}

console.log('Desktop smoke passed')
