import { Router } from 'express'
import { authenticate, requireHuman } from '../auth/auth.ts'
import { subscribe } from '../lib/events.ts'

export const eventsRouter = Router()

// Browsers' EventSource cannot set headers, so the token may also arrive as
// ?token=. Query strings are never logged (see request-log.ts).
eventsRouter.get(
  '/',
  (req, _res, next) => {
    if (!req.header('authorization') && typeof req.query.token === 'string') {
      req.headers.authorization = `Bearer ${req.query.token}`
    }
    next()
  },
  authenticate,
  requireHuman,
  (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    res.write('retry: 5000\n\nevent: ready\ndata: {}\n\n')

    const unsubscribe = subscribe(res)
    // Comments keep proxies from closing an idle stream.
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000)

    req.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
    })
  },
)
