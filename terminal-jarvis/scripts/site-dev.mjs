import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const port = Number.parseInt(process.env.PORT ?? '4173', 10)
const siteRoot = fileURLToPath(new URL('../site/', import.meta.url))

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
}

const server = createServer(async (req, res) => {
  try {
    const requestPath = req.url && req.url !== '/' ? req.url.split('?')[0] ?? '/' : '/index.html'
    const cleanPath = requestPath === '/' ? '/index.html' : requestPath
    const localPath = cleanPath.startsWith('/') ? cleanPath.slice(1) : cleanPath
    const filePath = resolve(siteRoot, localPath)
    if (!filePath.startsWith(siteRoot)) {
      throw new Error('Invalid path')
    }
    const content = await readFile(filePath)
    const extension = extname(filePath)

    res.writeHead(200, {
      'Content-Type': mimeTypes[extension] ?? 'application/octet-stream'
    })
    res.end(content)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not found')
  }
})

server.listen(port, () => {
  console.log(`Marketing site running on http://localhost:${port}`)
})
