import { Router } from 'express'
import { pool } from '../db.ts'
import { logError } from '../lib/http.ts'

export const healthRouter = Router()

// Public liveness check. Does not expose database details.
healthRouter.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'DataPulse API',
    timestamp: new Date().toISOString(),
  })
})

// Public database readiness check without exposing its name or DB user.
healthRouter.get('/db', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok', database: 'connected' })
  } catch (error) {
    logError('Database health check failed:', error)
    res.status(503).json({ status: 'error', error: 'Database unavailable' })
  }
})
