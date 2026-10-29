import { Router } from 'express'
import { pool } from '../db.ts'
import { authenticate, requireHuman, requireRole } from '../auth/auth.ts'
import { HttpError, isValidId, sendError, withTransaction } from '../lib/http.ts'
import { CLOSED_SERVICE_STATUSES, SERVICE_STATUSES } from '../lib/vehicles.ts'

export const serviceRouter = Router()

serviceRouter.use(authenticate)

serviceRouter.get('/', async (_req, res) => {
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
    sendError(res, error, 'Failed to fetch service jobs')
  }
})

serviceRouter.post(
  '/',
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

    try {
      const job = await withTransaction(async (client) => {
        const vehicle = await client.query(
          'SELECT id, status FROM vehicles WHERE id = $1 FOR UPDATE',
          [vehicleId],
        )

        if (!vehicle.rowCount) throw new HttpError(404, 'Vehicle not found')
        if (vehicle.rows[0].status === 'sold') {
          throw new HttpError(409, 'Cannot open service for a sold vehicle')
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
        return result.rows[0]
      })

      res.status(201).json(job)
    } catch (error) {
      sendError(res, error, 'Failed to create service job')
    }
  },
)

// Moves a service job between open and in_progress, or closes it as completed
// or cancelled. Closed jobs are final. When a vehicle has no remaining open
// jobs it returns to active (unless it has been sold).
serviceRouter.patch(
  '/:id',
  requireHuman,
  requireRole('admin', 'operator'),
  async (req, res) => {
    const id = String(req.params.id)
    const status = req.body?.status

    if (!isValidId(id) || !SERVICE_STATUSES.includes(status)) {
      res.status(400).json({ error: 'Valid service ID and status are required' })
      return
    }

    try {
      const job = await withTransaction(async (client) => {
        const found = await client.query(
          `SELECT id, vehicle_id, status, description, opened_at, completed_at
           FROM service_events
           WHERE id = $1
           FOR UPDATE`,
          [Number(id)],
        )

        if (!found.rowCount) throw new HttpError(404, 'Service job not found')

        const current = found.rows[0]

        if (current.status === status) return current

        if (CLOSED_SERVICE_STATUSES.includes(current.status)) {
          throw new HttpError(
            409,
            `This service job is already ${current.status} and cannot be changed`,
          )
        }

        // $1 is compared with text literals as well as assigned to the
        // varchar column; the explicit casts give PostgreSQL one type for it.
        const updated = await client.query(
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

        return updated.rows[0]
      })

      res.json(job)
    } catch (error) {
      sendError(res, error, 'Failed to update service job')
    }
  },
)
