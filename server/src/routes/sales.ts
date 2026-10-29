import { Router } from 'express'
import { pool } from '../db.ts'
import { authenticate, requireHuman, requireRole } from '../auth/auth.ts'
import { HttpError, isValidId, sendError, withTransaction } from '../lib/http.ts'
import { vehicleHistory } from '../lib/vehicles.ts'

export const salesRouter = Router()

salesRouter.use(authenticate)

salesRouter.get('/', async (_req, res) => {
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
    sendError(res, error, 'Failed to fetch sales')
  }
})

// Records a sale and marks the vehicle sold in one transaction. The vehicle
// row is locked first, so concurrent requests cannot sell it twice.
salesRouter.post(
  '/',
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

    try {
      const sale = await withTransaction(async (client) => {
        const vehicle = await client.query(
          'SELECT id FROM vehicles WHERE id = $1 FOR UPDATE',
          [vehicleId],
        )

        if (!vehicle.rowCount) throw new HttpError(404, 'Vehicle not found')

        const { hasSale, hasOpenJob } = await vehicleHistory(client, vehicleId)

        if (hasSale) {
          throw new HttpError(409, 'This vehicle has already been sold')
        }
        if (hasOpenJob) {
          throw new HttpError(
            409,
            'Complete or cancel the open service job before selling this vehicle',
          )
        }

        // A vehicle marked sold before sales were tracked has no sale
        // record; recording it here completes its history.
        const inserted = await client.query(
          `INSERT INTO sales_events (vehicle_id, amount, sold_at, source)
           VALUES ($1, $2, COALESCE($3::timestamptz, NOW()), 'manual')
           RETURNING id, vehicle_id, amount, sold_at, source`,
          [vehicleId, amount, soldAt ?? null],
        )
        await client.query("UPDATE vehicles SET status = 'sold' WHERE id = $1", [
          vehicleId,
        ])
        return inserted.rows[0]
      })

      res.status(201).json(sale)
    } catch (error) {
      sendError(res, error, 'Failed to record sale')
    }
  },
)
