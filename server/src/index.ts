
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { PoolClient } from 'pg'
import { pool } from './db.ts'
import {
  assertJwtSecret,
  authenticate,
  login,
  register,
  requireHuman,
  requireRole,
} from './auth/auth.ts'

const app = express()
const PORT = Number(process.env.PORT) || 3000

const VALID_STATUSES = ['active', 'sold', 'in_service'] as const
type VehicleStatus = (typeof VALID_STATUSES)[number]

const SERVICE_STATUSES = ['open', 'in_progress', 'completed', 'cancelled'] as const
type ServiceStatus = (typeof SERVICE_STATUSES)[number]
const CLOSED_SERVICE_STATUSES: readonly ServiceStatus[] = ['completed', 'cancelled']

const VEHICLE_COLUMNS =
  'id, vin, make, model, model_year, status, created_at'

function isValidStatus(value: unknown): value is VehicleStatus {
  return (
    typeof value === 'string' &&
    VALID_STATUSES.includes(value as VehicleStatus)
  )
}

function isValidId(value: string): boolean {
  return (
    /^\d+$/.test(value) &&
    Number.isSafeInteger(Number(value)) &&
    Number(value) > 0
  )
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  )
}

function logError(message: string, error: unknown): void {
  console.error(
    message,
    error instanceof Error ? error.message : 'Unknown error',
  )
}

// A vehicle's status must agree with its history: a recorded sale means
// "sold", an open or in-progress service job means "in_service", and anything
// else is "active". Returns why a requested status is not allowed, or null.
async function statusConflict(
  client: PoolClient,
  vehicleId: number,
  requested: VehicleStatus,
): Promise<string | null> {
  const history = await client.query(
    `SELECT
       EXISTS (SELECT 1 FROM sales_events WHERE vehicle_id = $1) AS has_sale,
       EXISTS (
         SELECT 1 FROM service_events
         WHERE vehicle_id = $1 AND status IN ('open', 'in_progress')
       ) AS has_open_job`,
    [vehicleId],
  )
  const { has_sale: hasSale, has_open_job: hasOpenJob } = history.rows[0]
  const expected: VehicleStatus = hasSale
    ? 'sold'
    : hasOpenJob
      ? 'in_service'
      : 'active'

  if (requested === expected) return null

  if (requested === 'sold') {
    return 'Use "Record a sale" to mark a vehicle as sold, so the sale price is captured.'
  }
  if (expected === 'sold') {
    return 'This vehicle has a recorded sale, so its status stays sold.'
  }
  if (requested === 'in_service') {
    return 'Create a service job to put a vehicle in service.'
  }
  return 'Complete or cancel the open service job to return this vehicle to active.'
}

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
app.use(cors({ origin: allowedOrigins }))
app.use(express.json({ limit: '1mb' }))

// Public login endpoint.
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {}

  if (
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    !email.trim() ||
    !password ||
    password.length > 200
  ) {
    res.status(400).json({ error: 'Email and password are required' })
    return
  }

  try {
    const result = await login(email, password)

    if (!result) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }

    res.json(result)
  } catch (error) {
    logError('Login failed:', error)
    res.status(500).json({ error: 'Unable to log in' })
  }
})

// Public signup endpoint. New accounts always receive viewer permissions.
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body ?? {}

  if (
    typeof name !== 'string' ||
    typeof email !== 'string' ||
    typeof password !== 'string'
  ) {
    res.status(400).json({ error: 'Name, email, and password are required' })
    return
  }

  try {
    const result = await register(name, email, password)
    res.status(201).json(result)
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: 'An account with this email already exists' })
      return
    }
    if (error instanceof Error && (
      error.message.startsWith('Enter a name') ||
      error.message.startsWith('Enter a valid email') ||
      error.message.startsWith('Password must')
    )) {
      res.status(400).json({ error: error.message })
      return
    }
    logError('Signup failed:', error)
    res.status(500).json({ error: 'Unable to create account' })
  }
})

// Current user's profile. Lets the dashboard confirm a stored session and
// pick up name or role changes made since sign-in.
app.get('/api/auth/me', authenticate, requireHuman, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, name, role
       FROM app_users
       WHERE id = $1 AND active = TRUE`,
      [req.auth?.id],
    )

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Account is inactive or unavailable' })
      return
    }

    const user = result.rows[0]
    res.json({
      id: String(user.id),
      email: String(user.email),
      name: String(user.name),
      role: user.role,
    })
  } catch (error) {
    logError('Failed to load current user:', error)
    res.status(500).json({ error: 'Unable to load your account' })
  }
})

// Public liveness check. Does not expose database details.
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'DataPulse API',
    timestamp: new Date().toISOString(),
  })
})

// Public database readiness check without exposing its name or DB user.
app.get('/api/health/db', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok', database: 'connected' })
  } catch (error) {
    logError('Database health check failed:', error)
    res.status(503).json({ status: 'error', error: 'Database unavailable' })
  }
})

// All routes below this point require a valid user or machine credential.
app.use('/api/vehicles', authenticate)
app.use('/api/analytics', authenticate)

// Vehicle statistics, plus reconciliation counts for records whose status
// disagrees with their sales/service history (e.g. set before those
// workflows existed).
app.get('/api/vehicles/stats', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active,
        COUNT(*) FILTER (WHERE status = 'sold')::int AS sold,
        COUNT(*) FILTER (WHERE status = 'in_service')::int AS in_service,
        COUNT(*) FILTER (
          WHERE status = 'sold'
            AND NOT EXISTS (
              SELECT 1 FROM sales_events s WHERE s.vehicle_id = v.id
            )
        )::int AS sold_without_sale,
        COUNT(*) FILTER (
          WHERE status = 'in_service'
            AND NOT EXISTS (
              SELECT 1 FROM service_events e
              WHERE e.vehicle_id = v.id
                AND e.status IN ('open', 'in_progress')
            )
        )::int AS in_service_without_open_job
      FROM vehicles v
    `)

    res.json(result.rows[0])
  } catch (error) {
    logError('Failed to fetch vehicle statistics:', error)
    res.status(500).json({ error: 'Failed to fetch vehicle statistics' })
  }
})

// Real sales analytics. No synthetic revenue or sales are generated.
app.get('/api/analytics/sales', async (_req, res) => {
  try {
    const totals = await pool.query(`
      SELECT
        COUNT(*)::int AS total_sales,
        COALESCE(SUM(amount), 0)::numeric(12, 2)::text AS total_revenue,
        COALESCE(AVG(amount), 0)::numeric(12, 2)::text AS average_sale
      FROM sales_events
    `)

    const daily = await pool.query(`
      SELECT
        days.day::date::text AS date,
        COUNT(s.id)::int AS sales,
        COALESCE(SUM(s.amount), 0)::numeric(12, 2)::text AS revenue
      FROM generate_series(
        CURRENT_DATE - INTERVAL '6 days',
        CURRENT_DATE,
        INTERVAL '1 day'
      ) AS days(day)
      LEFT JOIN sales_events s
        ON s.sold_at >= days.day
       AND s.sold_at < days.day + INTERVAL '1 day'
      GROUP BY days.day
      ORDER BY days.day
    `)

    res.json({
      totalSales: totals.rows[0].total_sales,
      totalRevenue: Number(totals.rows[0].total_revenue),
      averageSale: Number(totals.rows[0].average_sale),
      daily: daily.rows.map((row) => ({
        date: row.date,
        sales: row.sales,
        revenue: Number(row.revenue),
      })),
      hasData: Number(totals.rows[0].total_sales) > 0,
    })
  } catch (error) {
    logError('Failed to fetch sales analytics:', error)
    res.status(500).json({ error: 'Failed to fetch sales analytics' })
  }
})

// Real service analytics, including an explicit count for each status.
app.get('/api/analytics/service', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'open')::int AS open,
        COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled
      FROM service_events
    `)

    const recent = await pool.query(`
      SELECT
        s.id,
        s.vehicle_id,
        v.vin,
        v.make,
        v.model,
        s.status,
        s.description,
        s.opened_at,
        s.completed_at
      FROM service_events s
      LEFT JOIN vehicles v ON v.id = s.vehicle_id
      ORDER BY s.opened_at DESC, s.id DESC
      LIMIT 10
    `)

    const counts = result.rows[0]

    res.json({
      total: counts.total,
      open: counts.open,
      in_progress: counts.in_progress,
      completed: counts.completed,
      cancelled: counts.cancelled,
      hasData: counts.total > 0,
      recent: recent.rows,
    })
  } catch (error) {
    logError('Failed to fetch service analytics:', error)
    res.status(500).json({ error: 'Failed to fetch service analytics' })
  }
})

// Sales and service management workflows (human users only).
app.get('/api/sales', authenticate, async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.id, s.vehicle_id, s.amount, s.sold_at, s.source,
             v.vin, v.make, v.model, v.model_year
      FROM sales_events s
      LEFT JOIN vehicles v ON v.id = s.vehicle_id
      ORDER BY s.sold_at DESC, s.id DESC
      LIMIT 100
    `)
    res.json(result.rows)
  } catch (error) {
    logError('Failed to fetch sales:', error)
    res.status(500).json({ error: 'Failed to fetch sales' })
  }
})

// Records a sale and marks the vehicle sold in one transaction. The vehicle
// row is locked first, so concurrent requests cannot sell it twice.
app.post(
  '/api/sales',
  authenticate,
  requireHuman,
  requireRole('admin', 'operator'),
  async (req, res) => {
    const vehicleId = Number(req.body?.vehicle_id)
    const amount = Number(req.body?.amount)
    const soldAt = req.body?.sold_at

    if (
      !isValidId(String(req.body?.vehicle_id ?? '')) ||
      typeof req.body?.amount === 'boolean' ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > 9999999999.99 ||
      (soldAt !== undefined &&
        (typeof soldAt !== 'string' || Number.isNaN(Date.parse(soldAt))))
    ) {
      res.status(400).json({
        error:
          'A valid vehicle_id, positive amount and optional valid sold_at date are required',
      })
      return
    }

    let client: PoolClient | undefined

    try {
      client = await pool.connect()
      await client.query('BEGIN')

      const vehicle = await client.query(
        'SELECT id, status FROM vehicles WHERE id = $1 FOR UPDATE',
        [vehicleId],
      )

      if (!vehicle.rowCount) {
        await client.query('ROLLBACK')
        res.status(404).json({ error: 'Vehicle not found' })
        return
      }

      const history = await client.query(
        `SELECT
           EXISTS (SELECT 1 FROM sales_events WHERE vehicle_id = $1) AS has_sale,
           EXISTS (
             SELECT 1 FROM service_events
             WHERE vehicle_id = $1 AND status IN ('open', 'in_progress')
           ) AS has_open_job`,
        [vehicleId],
      )

      if (history.rows[0].has_sale) {
        await client.query('ROLLBACK')
        res.status(409).json({ error: 'This vehicle has already been sold' })
        return
      }

      if (history.rows[0].has_open_job) {
        await client.query('ROLLBACK')
        res.status(409).json({
          error:
            'Complete or cancel the open service job before selling this vehicle',
        })
        return
      }

      // A vehicle marked sold before sales were tracked has no sale record;
      // recording it here completes its history.
      const inserted = await client.query(
        `INSERT INTO sales_events (vehicle_id, amount, sold_at, source)
         VALUES ($1, $2, COALESCE($3::timestamptz, NOW()), 'manual')
         RETURNING id, vehicle_id, amount, sold_at, source`,
        [vehicleId, amount, soldAt ?? null],
      )
      await client.query("UPDATE vehicles SET status = 'sold' WHERE id = $1", [
        vehicleId,
      ])
      await client.query('COMMIT')
      res.status(201).json(inserted.rows[0])
    } catch (error) {
      await client?.query('ROLLBACK').catch(() => {})
      logError('Failed to record sale:', error)
      res.status(500).json({ error: 'Failed to record sale' })
    } finally {
      client?.release()
    }
  },
)

app.get('/api/service', authenticate, async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.id, s.vehicle_id, s.status, s.description, s.opened_at,
             s.completed_at, v.vin, v.make, v.model, v.model_year
      FROM service_events s
      LEFT JOIN vehicles v ON v.id = s.vehicle_id
      ORDER BY s.opened_at DESC, s.id DESC
      LIMIT 100
    `)
    res.json(result.rows)
  } catch (error) {
    logError('Failed to fetch service jobs:', error)
    res.status(500).json({ error: 'Failed to fetch service jobs' })
  }
})

app.post(
  '/api/service',
  authenticate,
  requireHuman,
  requireRole('admin', 'operator'),
  async (req, res) => {
    const vehicleId = Number(req.body?.vehicle_id)
    const description =
      typeof req.body?.description === 'string'
        ? req.body.description.trim()
        : ''

    if (
      !isValidId(String(req.body?.vehicle_id ?? '')) ||
      !description ||
      description.length > 2000
    ) {
      res.status(400).json({
        error:
          'A valid vehicle_id and description (1–2000 characters) are required',
      })
      return
    }

    let client: PoolClient | undefined

    try {
      client = await pool.connect()
      await client.query('BEGIN')

      const vehicle = await client.query(
        'SELECT id, status FROM vehicles WHERE id = $1 FOR UPDATE',
        [vehicleId],
      )

      if (!vehicle.rowCount) {
        await client.query('ROLLBACK')
        res.status(404).json({ error: 'Vehicle not found' })
        return
      }

      if (vehicle.rows[0].status === 'sold') {
        await client.query('ROLLBACK')
        res.status(409).json({ error: 'Cannot open service for a sold vehicle' })
        return
      }

      const result = await client.query(
        `INSERT INTO service_events (vehicle_id, description, status)
         VALUES ($1, $2, 'open')
         RETURNING id, vehicle_id, status, description, opened_at, completed_at`,
        [vehicleId, description],
      )
      await client.query(
        "UPDATE vehicles SET status = 'in_service' WHERE id = $1",
        [vehicleId],
      )
      await client.query('COMMIT')
      res.status(201).json(result.rows[0])
    } catch (error) {
      await client?.query('ROLLBACK').catch(() => {})
      logError('Failed to create service job:', error)
      res.status(500).json({ error: 'Failed to create service job' })
    } finally {
      client?.release()
    }
  },
)

// Moves a service job between open and in_progress, or closes it as completed
// or cancelled. Closed jobs are final. When a vehicle has no remaining open
// jobs it returns to active (unless it has been sold).
app.patch(
  '/api/service/:id',
  authenticate,
  requireHuman,
  requireRole('admin', 'operator'),
  async (req, res) => {
    const id = String(req.params.id)
    const status = req.body?.status

    if (!isValidId(id) || !SERVICE_STATUSES.includes(status)) {
      res.status(400).json({ error: 'Valid service ID and status are required' })
      return
    }

    let client: PoolClient | undefined

    try {
      client = await pool.connect()
      await client.query('BEGIN')

      const found = await client.query(
        `SELECT id, vehicle_id, status, description, opened_at, completed_at
         FROM service_events
         WHERE id = $1
         FOR UPDATE`,
        [Number(id)],
      )

      if (!found.rowCount) {
        await client.query('ROLLBACK')
        res.status(404).json({ error: 'Service job not found' })
        return
      }

      const current = found.rows[0]

      if (current.status === status) {
        await client.query('COMMIT')
        res.json(current)
        return
      }

      if (CLOSED_SERVICE_STATUSES.includes(current.status)) {
        await client.query('ROLLBACK')
        res.status(409).json({
          error: `This service job is already ${current.status} and cannot be changed`,
        })
        return
      }

      // $1 is compared with text literals as well as assigned to the
      // varchar column; the explicit casts give PostgreSQL one type for it.
      const job = await client.query(
        `UPDATE service_events
         SET status = $1::text,
             completed_at = CASE
               WHEN $1::text = 'completed' THEN NOW()
               WHEN $1::text IN ('open', 'in_progress') THEN NULL
               ELSE completed_at
             END
         WHERE id = $2
         RETURNING id, vehicle_id, status, description, opened_at, completed_at`,
        [status, Number(id)],
      )

      if (current.vehicle_id !== null) {
        if (status === 'open' || status === 'in_progress') {
          await client.query(
            "UPDATE vehicles SET status = 'in_service' WHERE id = $1 AND status <> 'sold'",
            [current.vehicle_id],
          )
        } else {
          const stillOpen = await client.query(
            `SELECT 1 FROM service_events
             WHERE vehicle_id = $1 AND id <> $2
               AND status IN ('open', 'in_progress')
             LIMIT 1`,
            [current.vehicle_id, Number(id)],
          )

          if (!stillOpen.rowCount) {
            await client.query(
              "UPDATE vehicles SET status = 'active' WHERE id = $1 AND status = 'in_service'",
              [current.vehicle_id],
            )
          }
        }
      }

      await client.query('COMMIT')
      res.json(job.rows[0])
    } catch (error) {
      await client?.query('ROLLBACK').catch(() => {})
      logError('Failed to update service job:', error)
      res.status(500).json({ error: 'Failed to update service job' })
    } finally {
      client?.release()
    }
  },
)

// Machine-credential requests to vehicle ingestion are recorded without
// logging credentials, request bodies, VINs, or other sensitive payload data.
function logMachineIngestion(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  if (req.auth?.kind !== 'machine') {
    next()
    return
  }

  res.once('finish', () => {
    const success = res.statusCode >= 200 && res.statusCode < 400
    const outcome = success ? 'success' : 'failure'
    const message = success
      ? 'Vehicle ingestion request accepted'
      : 'Vehicle ingestion request rejected'

    void pool.query(
      `INSERT INTO nifi_request_logs
         (flow_name, outcome, http_status, message)
       VALUES ($1, $2, $3, $4)`,
      [
        process.env.NIFI_FLOW_NAME || 'vehicle-ingestion',
        outcome,
        res.statusCode,
        message,
      ],
    ).catch((error: unknown) => {
      logError('Failed to record NiFi request outcome:', error)
    })
  })

  next()
}

// List and search vehicles.
app.get('/api/vehicles', async (req, res) => {
  const search =
    typeof req.query.search === 'string'
      ? req.query.search.trim()
      : ''

  const status =
    typeof req.query.status === 'string'
      ? req.query.status
      : undefined

  if (status !== undefined && !isValidStatus(status)) {
    res.status(400).json({
      error: 'Status must be active, sold or in_service',
    })
    return
  }

  try {
    const conditions: string[] = []
    const values: unknown[] = []

    if (status) {
      values.push(status)
      conditions.push(`status = $${values.length}`)
    }

    if (search) {
      values.push(`%${search}%`)
      const parameter = `$${values.length}`

      conditions.push(
        `(vin ILIKE ${parameter}
          OR make ILIKE ${parameter}
          OR model ILIKE ${parameter})`,
      )
    }

    const whereClause =
      conditions.length > 0
        ? `WHERE ${conditions.join(' AND ')}`
        : ''

    const result = await pool.query(
      `SELECT ${VEHICLE_COLUMNS}
       FROM vehicles
       ${whereClause}
       ORDER BY id ASC`,
      values,
    )

    res.json(result.rows)
  } catch (error) {
    logError('Failed to fetch vehicles:', error)
    res.status(500).json({ error: 'Failed to fetch vehicles' })
  }
})

// Get one vehicle.
app.get('/api/vehicles/:id', async (req, res) => {
  if (!isValidId(req.params.id)) {
    res.status(400).json({ error: 'Invalid vehicle ID' })
    return
  }

  try {
    const result = await pool.query(
      `SELECT ${VEHICLE_COLUMNS}
       FROM vehicles
       WHERE id = $1`,
      [Number(req.params.id)],
    )

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Vehicle not found' })
      return
    }

    res.json(result.rows[0])
  } catch (error) {
    logError('Failed to fetch vehicle:', error)
    res.status(500).json({ error: 'Failed to fetch vehicle' })
  }
})

// Create vehicles: admin/operator users and operator machine credentials.
// The outcome logger runs after authentication and authorization.
app.post(
  '/api/vehicles',
  requireRole('admin', 'operator'),
  logMachineIngestion,
  async (req, res) => {
    const { vin, make, model, model_year, status } = req.body ?? {}

    if (
      typeof vin !== 'string' ||
      typeof make !== 'string' ||
      typeof model !== 'string' ||
      !Number.isInteger(model_year)
    ) {
      res.status(400).json({
        error: 'VIN, make, model and a valid model_year are required',
      })
      return
    }

    const cleanVin = vin.trim().toUpperCase()
    const cleanMake = make.trim()
    const cleanModel = model.trim()
    const vehicleStatus = status === undefined ? 'active' : status

    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(cleanVin)) {
      res.status(400).json({
        error: 'VIN must contain 17 valid characters',
      })
      return
    }

    if (!cleanMake || cleanMake.length > 100) {
      res.status(400).json({
        error: 'Make must be between 1 and 100 characters',
      })
      return
    }

    if (!cleanModel || cleanModel.length > 100) {
      res.status(400).json({
        error: 'Model must be between 1 and 100 characters',
      })
      return
    }

    if (model_year < 1886 || model_year > 2100) {
      res.status(400).json({
        error: 'Model year must be between 1886 and 2100',
      })
      return
    }

    if (!isValidStatus(vehicleStatus)) {
      res.status(400).json({
        error: 'Status must be active, sold or in_service',
      })
      return
    }

    // People add vehicles as active; sold and in-service come from the sales
    // and service workflows. Machine ingestion may import an existing status.
    if (req.auth?.kind === 'user' && vehicleStatus !== 'active') {
      res.status(400).json({
        error:
          'New vehicles start as active. Use the sales or service workflow to change their status.',
      })
      return
    }

    try {
      const result = await pool.query(
        `INSERT INTO vehicles (vin, make, model, model_year, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING ${VEHICLE_COLUMNS}`,
        [cleanVin, cleanMake, cleanModel, model_year, vehicleStatus],
      )

      res.status(201).json(result.rows[0])
    } catch (error) {
      if (isUniqueViolation(error)) {
        res.status(409).json({
          error: 'A vehicle with this VIN already exists',
        })
        return
      }

      logError('Failed to create vehicle:', error)
      res.status(500).json({ error: 'Failed to create vehicle' })
    }
  },
)

// Update vehicles: only human admin/operator accounts.
app.patch(
  '/api/vehicles/:id',
  requireHuman,
  requireRole('admin', 'operator'),
  async (req, res) => {
    const id = String(req.params.id)

    if (!isValidId(id)) {
      res.status(400).json({ error: 'Invalid vehicle ID' })
      return
    }

    const body = req.body

    if (
      body === null ||
      typeof body !== 'object' ||
      Array.isArray(body)
    ) {
      res.status(400).json({ error: 'Request body must be a JSON object' })
      return
    }

    const allowedFields = ['vin', 'make', 'model', 'model_year', 'status']
    const suppliedFields = Object.keys(body)

    if (
      suppliedFields.length === 0 ||
      suppliedFields.some((field) => !allowedFields.includes(field))
    ) {
      res.status(400).json({
        error:
          'Provide at least one supported field: vin, make, model, model_year, status',
      })
      return
    }

    const updates: string[] = []
    const values: unknown[] = []

    if (Object.hasOwn(body, 'vin')) {
      if (typeof body.vin !== 'string') {
        res.status(400).json({ error: 'VIN must be a string' })
        return
      }

      const vin = body.vin.trim().toUpperCase()

      if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
        res.status(400).json({
          error: 'VIN must contain 17 valid characters',
        })
        return
      }

      values.push(vin)
      updates.push(`vin = $${values.length}`)
    }

    for (const field of ['make', 'model'] as const) {
      if (Object.hasOwn(body, field)) {
        if (typeof body[field] !== 'string') {
          res.status(400).json({ error: `${field} must be a string` })
          return
        }

        const value = body[field].trim()

        if (!value || value.length > 100) {
          res.status(400).json({
            error: `${field} must be between 1 and 100 characters`,
          })
          return
        }

        values.push(value)
        updates.push(`${field} = $${values.length}`)
      }
    }

    if (Object.hasOwn(body, 'model_year')) {
      if (
        !Number.isInteger(body.model_year) ||
        body.model_year < 1886 ||
        body.model_year > 2100
      ) {
        res.status(400).json({
          error: 'Model year must be an integer between 1886 and 2100',
        })
        return
      }

      values.push(body.model_year)
      updates.push(`model_year = $${values.length}`)
    }

    if (Object.hasOwn(body, 'status')) {
      if (!isValidStatus(body.status)) {
        res.status(400).json({
          error: 'Status must be active, sold or in_service',
        })
        return
      }

      values.push(body.status)
      updates.push(`status = $${values.length}`)
    }

    const vehicleId = Number(id)
    values.push(vehicleId)

    let client: PoolClient | undefined

    try {
      client = await pool.connect()
      await client.query('BEGIN')

      const current = await client.query(
        'SELECT status FROM vehicles WHERE id = $1 FOR UPDATE',
        [vehicleId],
      )

      if (current.rows.length === 0) {
        await client.query('ROLLBACK')
        res.status(404).json({ error: 'Vehicle not found' })
        return
      }

      if (
        Object.hasOwn(body, 'status') &&
        body.status !== current.rows[0].status
      ) {
        const conflict = await statusConflict(client, vehicleId, body.status)

        if (conflict) {
          await client.query('ROLLBACK')
          res.status(409).json({ error: conflict })
          return
        }
      }

      const result = await client.query(
        `UPDATE vehicles
         SET ${updates.join(', ')}
         WHERE id = $${values.length}
         RETURNING ${VEHICLE_COLUMNS}`,
        values,
      )

      await client.query('COMMIT')
      res.json(result.rows[0])
    } catch (error) {
      await client?.query('ROLLBACK').catch(() => {})

      if (isUniqueViolation(error)) {
        res.status(409).json({
          error: 'A vehicle with this VIN already exists',
        })
        return
      }

      logError('Failed to update vehicle:', error)
      res.status(500).json({ error: 'Failed to update vehicle' })
    } finally {
      client?.release()
    }
  },
)

// Delete vehicles: admin only, never via a machine credential. Vehicles with
// sales or service history are kept so that history stays attached.
app.delete(
  '/api/vehicles/:id',
  requireHuman,
  requireRole('admin'),
  async (req, res) => {
    const id = String(req.params.id)

    if (!isValidId(id)) {
      res.status(400).json({ error: 'Invalid vehicle ID' })
      return
    }

    let client: PoolClient | undefined

    try {
      client = await pool.connect()
      await client.query('BEGIN')

      const found = await client.query(
        `SELECT
           EXISTS (SELECT 1 FROM sales_events WHERE vehicle_id = v.id)
             OR EXISTS (SELECT 1 FROM service_events WHERE vehicle_id = v.id)
             AS has_history
         FROM vehicles v
         WHERE v.id = $1
         FOR UPDATE`,
        [Number(id)],
      )

      if (found.rows.length === 0) {
        await client.query('ROLLBACK')
        res.status(404).json({ error: 'Vehicle not found' })
        return
      }

      if (found.rows[0].has_history) {
        await client.query('ROLLBACK')
        res.status(409).json({
          error:
            'This vehicle has sales or service history and cannot be deleted',
        })
        return
      }

      const result = await client.query(
        `DELETE FROM vehicles
         WHERE id = $1
         RETURNING ${VEHICLE_COLUMNS}`,
        [Number(id)],
      )
      await client.query('COMMIT')

      res.json({
        message: 'Vehicle deleted successfully',
        vehicle: result.rows[0],
      })
    } catch (error) {
      await client?.query('ROLLBACK').catch(() => {})
      logError('Failed to delete vehicle:', error)
      res.status(500).json({ error: 'Failed to delete vehicle' })
    } finally {
      client?.release()
    }
  },
)

// Authenticated view of recent machine-ingestion outcomes.
// Only admins can access operational request logs.
app.get(
  '/api/operations/nifi-logs',
  authenticate,
  requireHuman,
  requireRole('admin'),
  async (_req, res) => {
    try {
      const result = await pool.query(`
        SELECT id, flow_name, outcome, http_status, message, created_at
        FROM nifi_request_logs
        ORDER BY created_at DESC, id DESC
        LIMIT 100
      `)

      res.json(result.rows)
    } catch (error) {
      logError('Failed to fetch NiFi request logs:', error)
      res.status(500).json({ error: 'Failed to fetch NiFi request logs' })
    }
  },
)

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

export { app }

// Each entry is [table, column, migration that creates it].
const REQUIRED_SCHEMA: Array<[string, string, string]> = [
  ['vehicles', 'status', '000_base_schema.sql'],
  ['sales_events', 'amount', '001_analytics_auth.sql'],
  ['service_events', 'status', '001_analytics_auth.sql'],
  ['app_users', 'password_hash', '001_analytics_auth.sql'],
  ['api_credentials', 'token_hash', '001_analytics_auth.sql'],
  ['nifi_request_logs', 'outcome', '001_analytics_auth.sql'],
  ['app_users', 'name', '002_user_signup.sql'],
]

// Startup diagnostics: reports database reachability and missing migrations
// without exposing connection details.
async function checkDatabase(): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = current_schema()`,
    )
    const present = new Set(
      result.rows.map((row) => `${row.table_name}.${row.column_name}`),
    )
    const missing = REQUIRED_SCHEMA.filter(
      ([table, column]) => !present.has(`${table}.${column}`),
    )

    if (missing.length === 0) {
      console.log('Database connected; schema is up to date')
      return
    }

    for (const [table, column, migration] of missing) {
      console.warn(
        `Database schema is missing ${table}.${column}: apply server/src/migrations/${migration}`,
      )
    }
  } catch (error) {
    logError(
      'Database unavailable at startup (GET /api/health/db reports its status):',
      error,
    )
  }
}

const isMainModule = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false

if (isMainModule) {
  try {
    assertJwtSecret()
  } catch (error) {
    logError('DataPulse API cannot start:', error)
    process.exit(1)
  }

  app.listen(PORT, () => {
    console.log(`DataPulse API running at http://localhost:${PORT}`)
    void checkDatabase()
  })
}
