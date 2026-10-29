import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

declare module 'express-serve-static-core' {
  interface Request {
    id?: string
  }
}

// Gives every request an ID (reusing a well-formed X-Request-Id from a
// proxy), returns it in the response header and writes one structured JSON
// line per request. Bodies, tokens and query strings are never logged.
export function requestLog(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id')
  req.id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID()
  res.setHeader('X-Request-Id', req.id)

  const started = process.hrtime.bigint()
  // Captured now: routers rewrite req.path to their own mount point.
  const path = req.path

  res.once('finish', () => {
    if (process.env.NODE_ENV === 'test' || path === '/api/events') return

    console.log(JSON.stringify({
      level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      time: new Date().toISOString(),
      requestId: req.id,
      method: req.method,
      path,
      status: res.statusCode,
      durationMs: Number((Number(process.hrtime.bigint() - started) / 1e6).toFixed(1)),
      user: req.auth?.kind === 'user' ? req.auth.id : req.auth?.kind === 'machine' ? `machine:${req.auth.id}` : null,
    }))
  })

  next()
}
