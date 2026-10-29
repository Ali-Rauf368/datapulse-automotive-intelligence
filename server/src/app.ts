import express from 'express'
import cors from 'cors'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { logError } from './lib/http.ts'
import { authRouter } from './routes/auth.ts'
import { healthRouter } from './routes/health.ts'
import { vehiclesRouter } from './routes/vehicles.ts'
import { salesRouter } from './routes/sales.ts'
import { serviceRouter } from './routes/service.ts'
import { analyticsRouter, operationsRouter } from './routes/analytics.ts'

export const app = express()

// The configured frontend is always allowed; local Vite dev and preview
// origins are added outside production only.
const allowedOrigins = [
  process.env.FRONTEND_URL,
  ...(process.env.NODE_ENV === 'production'
    ? []
    : [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:4173',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:5174',
        'http://127.0.0.1:4173',
      ]),
].filter((origin): origin is string => Boolean(origin))

app.disable('x-powered-by')

// Hosted behind one proxy (Render), so req.ip is the visitor's address and
// rate limits apply per visitor rather than to the proxy.
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1)

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  next()
})
app.use(cors({ origin: allowedOrigins }))
app.use(express.json({ limit: '1mb' }))

app.use('/api/health', healthRouter)
app.use('/api/auth', authRouter)
app.use('/api/vehicles', vehiclesRouter)
app.use('/api/sales', salesRouter)
app.use('/api/service', serviceRouter)
app.use('/api/analytics', analyticsRouter)
app.use('/api/operations', operationsRouter)

// Single-service deployments (the Render blueprint sets SERVE_FRONTEND=true)
// serve the built dashboard from dist/ on the same origin as the API.
const distDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../dist',
)

if (
  process.env.SERVE_FRONTEND === 'true' &&
  existsSync(path.join(distDir, 'index.html'))
) {
  app.use(express.static(distDir))
  app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

// Unknown API routes get a JSON 404 rather than Express's HTML page.
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found' })
})

// Final error handler: always JSON, never a stack trace.
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    // A response that has already started can only be ended by Express.
    if (res.headersSent) {
      next(error)
      return
    }

    const type =
      typeof error === 'object' && error !== null && 'type' in error
        ? error.type
        : undefined

    if (type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Invalid JSON request body' })
      return
    }

    if (type === 'entity.too.large') {
      res.status(413).json({ error: 'Request body is too large' })
      return
    }

    logError('Unhandled request error:', error)
    res.status(500).json({ error: 'Internal server error' })
  },
)
