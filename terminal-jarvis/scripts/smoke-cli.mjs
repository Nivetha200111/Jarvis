import { spawn } from 'node:child_process'

const child = spawn('node', ['packages/cli/bin/jarvis', 'chat', '--prompt', 'smoke test'], {
  cwd: new URL('..', import.meta.url),
  stdio: ['ignore', 'pipe', 'pipe']
})

let output = ''
let error = ''

child.stdout.on('data', (chunk) => {
  output += chunk.toString()
})

child.stderr.on('data', (chunk) => {
  error += chunk.toString()
})

const code = await new Promise((resolve) => {
  child.on('close', resolve)
})

if (code !== 0) {
  throw new Error(`CLI smoke failed with exit code ${code}: ${error}`)
}

if (!output.includes('Mock reply')) {
  throw new Error(`CLI smoke output did not contain expected text. Output: ${output}`)
}

console.log('CLI smoke passed')
