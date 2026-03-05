import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const __dirname = dirname(fileURLToPath(import.meta.url))
const desktopMain = resolve(__dirname, '../packages/desktop/dist/main.cjs')
const args = [desktopMain]
const env = {
  ...process.env,
  JARVIS_DESKTOP_SMOKE: '1',
  JARVIS_ENGINE: 'mock'
}

delete env.ELECTRON_RUN_AS_NODE

if (process.platform === 'linux') {
  args.unshift('--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage')
}

const child = spawn(electronPath, args, {
  env,
  stdio: ['ignore', 'pipe', 'pipe']
})

let stderr = ''
let stdout = ''
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString()
})
child.stdout.on('data', (chunk) => {
  stdout += chunk.toString()
})

const timeoutMs = Number.parseInt(process.env.JARVIS_DESKTOP_SMOKE_TIMEOUT_MS ?? '45000', 10)
const timeoutHandle = setTimeout(() => {
  child.kill('SIGKILL')
}, timeoutMs)

const code = await new Promise((resolveCode) => {
  child.on('close', resolveCode)
})
clearTimeout(timeoutHandle)

if (code !== 0) {
  throw new Error(
    `Desktop smoke failed with exit code ${code}. stdout=${stdout} stderr=${stderr}`
  )
}

console.log('Desktop smoke passed')
