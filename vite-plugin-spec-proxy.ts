import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, PreviewServer, ViteDevServer } from 'vite'

const FORWARD_HEADERS = ['accept', 'content-type', 'authorization', 'x-api-key']

function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve(undefined)
        return
      }
      resolve(Buffer.concat(chunks))
    })
    req.on('error', reject)
  })
}

async function handleProxy(req: IncomingMessage, res: ServerResponse) {
  if (!req.url) {
    res.statusCode = 400
    res.end('Missing request URL')
    return
  }

  const requestUrl = new URL(req.url, 'http://localhost')
  const target = requestUrl.searchParams.get('url')

  if (!target) {
    res.statusCode = 400
    res.end('Missing url query parameter')
    return
  }

  const headers = new Headers()
  for (const name of FORWARD_HEADERS) {
    const value = req.headers[name]
    if (typeof value === 'string') {
      headers.set(name, value)
    }
  }

  const method = req.method ?? 'GET'
  const body =
    method === 'GET' || method === 'HEAD' ? undefined : await readBody(req)

  try {
    const response = await fetch(target, {
      method,
      headers,
      body: body ?? undefined,
    })

    const contentType = response.headers.get('content-type')
    if (contentType) {
      res.setHeader('Content-Type', contentType)
    }

    res.statusCode = response.status
    res.end(Buffer.from(await response.arrayBuffer()))
  } catch (error) {
    res.statusCode = 502
    res.end(error instanceof Error ? error.message : 'Proxy fetch failed')
  }
}

function createProxyHandler(): Connect.NextHandleFunction {
  return (req, res, next) => {
    void handleProxy(req, res).catch(next)
  }
}

function attachProxy(server: ViteDevServer | PreviewServer) {
  server.middlewares.use('/api/proxy', createProxyHandler())
}

export function specProxyPlugin() {
  return {
    name: 'spec-proxy',
    configureServer(server: ViteDevServer) {
      attachProxy(server)
    },
    configurePreviewServer(server: PreviewServer) {
      attachProxy(server)
    },
  }
}
