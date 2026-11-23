/** Local API server using the same handlers as the Vercel functions, backed by MemoryStore. */
import { createServer } from 'node:http'
import { routeHandler, type VercelLikeRequest } from '../api/_lib/vercel'
import type { Route } from '../api/_lib/handlers'

const port = Number(process.env.PORT ?? 3101)
const routes: Record<string, Route> = {
  '/api/run/start': 'run/start',
  '/api/score': 'score',
  '/api/leaderboard': 'leaderboard',
}
const cache = new Map<Route, ReturnType<typeof routeHandler>>()

createServer((req, res) => {
  const path = (req.url ?? '').split('?')[0]
  if (path === '/api/health') {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: true }))
    return
  }
  const route = routes[path]
  if (!route) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'not_found' }))
    return
  }
  let h = cache.get(route)
  if (!h) cache.set(route, (h = routeHandler(route)))
  void h(req as VercelLikeRequest, res)
}).listen(port, '127.0.0.1', () =>
  console.log(`dev api (memory store) on http://127.0.0.1:${port}`),
)
