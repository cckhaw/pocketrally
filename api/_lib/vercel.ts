import type { IncomingMessage, ServerResponse } from 'node:http'
import { handle, type ApiRequest, type Route } from './handlers'

/** Minimal shape of the request object the Vercel Node runtime hands us. */
export type VercelLikeRequest = IncomingMessage & {
  body?: unknown
  query?: Record<string, string | string[] | undefined>
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

export function toApiRequest(req: VercelLikeRequest, body: unknown): ApiRequest {
  const headers: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = first(v)
  const url = new URL(req.url ?? '/', 'http://local')
  const query: Record<string, string | undefined> = {}
  url.searchParams.forEach((v, k) => (query[k] = v))
  const fwd = headers['x-forwarded-for']?.split(',')[0]?.trim()
  return {
    method: (req.method ?? 'GET').toUpperCase(),
    query,
    body,
    headers,
    ip: fwd || headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown',
  }
}

export async function readJsonBody(req: VercelLikeRequest): Promise<unknown> {
  if (req.body !== undefined) {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body)
      } catch {
        return undefined
      }
    }
    return req.body
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of req) {
    const b = c as Buffer
    size += b.length
    if (size > 16 * 1024) return undefined
    chunks.push(b)
  }
  if (!chunks.length) return undefined
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return undefined
  }
}

export function routeHandler(route: Route) {
  return async (req: VercelLikeRequest, res: ServerResponse): Promise<void> => {
    const body = req.method === 'POST' ? await readJsonBody(req) : undefined
    const r = await handle(route, toApiRequest(req, body), { env: process.env })
    res.statusCode = r.status
    for (const [k, v] of Object.entries(r.headers)) res.setHeader(k, v)
    res.end(r.body === null ? undefined : JSON.stringify(r.body))
  }
}
