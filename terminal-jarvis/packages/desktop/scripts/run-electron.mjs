import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const electronBinary = require('electron')
const __dirname = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(__dirname, '..')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(electronBinary, ['./dist/main.cjs'], {
  cwd: packageRoot,
  env,
  stdio: 'inherit'
})

child.on('error', (error) => {
  console.error('Failed to launch desktop app:', error)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})
