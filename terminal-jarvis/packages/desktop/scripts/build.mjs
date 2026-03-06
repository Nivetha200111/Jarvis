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
    <title>Jarvis</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@300;400;500&display=swap" rel="stylesheet" />
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      html, body { height: 100%; overflow: hidden; background: transparent; }
      body {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: #e4e4e7;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }
      #root { height: 100%; }
      ::-webkit-scrollbar { width: 6px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
      ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.14); }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script src="./renderer.js"></script>
  </body>
</html>
`

await writeFile(join(distDir, 'index.html'), html, 'utf-8')
