import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(__dirname, '..')
const distDir = join(packageRoot, 'dist')

await mkdir(distDir, { recursive: true })

await build({
  entryPoints: [join(packageRoot, 'src/main/main.ts')],
  outfile: join(distDir, 'main.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
  sourcemap: true,
  target: 'node22'
})

await build({
  entryPoints: [join(packageRoot, 'src/preload/index.ts')],
  outfile: join(distDir, 'preload.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
  sourcemap: true,
  target: 'node22'
})

await build({
  entryPoints: [join(packageRoot, 'src/renderer/main.tsx')],
  outfile: join(distDir, 'renderer.js'),
  bundle: true,
  platform: 'browser',
  format: 'iife',
  sourcemap: true,
  jsx: 'automatic',
  target: 'chrome120'
})

const html = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Terminal Jarvis Desktop</title>
  </head>
  <body>
    <div id="root"></div>
    <script src="./renderer.js"></script>
  </body>
</html>
`

await writeFile(join(distDir, 'index.html'), html, 'utf-8')
