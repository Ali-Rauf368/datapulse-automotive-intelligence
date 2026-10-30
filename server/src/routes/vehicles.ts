import { Router } from 'express'
import type { NextFunction, Request, Response } from 'express'
import { pool } from '../db.ts'
import { audit } from '../lib/audit.ts'
import { authenticate, requireHuman, requireRole } from '../auth/auth.ts'
import {
  HttpError,
  isUniqueViolation,
  isValidId,
  logError,
  sendError,
  withTransaction,
} from '../lib/http.ts'
import {
  VEHICLE_COLUMNS,
  VIN_PATTERN,
  isVehicleStatus,
  validateNewVehicle,
  statusConflict,
  vehicleHistory,
} from '../lib/vehicles.ts'

export const vehiclesRouter = Router()

// Every vehicle route needs a signed-in user or a machine credential.
vehiclesRouter.use(authenticate)

// Machine-credential requests to vehicle ingestion are recorded without
// logging credentials, request bodies, VINs, or other sensitive payload data.
function logMachineIngestion(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.auth?.kind !== 'machine') {
    next()
    return
  }

  res.once('finish', () => {
    const success = res.statusCode >= 200 && res.statusCode < 400

    void pool.query(
      `INSERT INTO nifi_request_logs
         (flow_name, outcome, http_status, message)
       VALUES ($1, $2, $3, $4)`,
      [
        process.env.NIFI_FLOW_NAME || 'vehicle-ingestion',
        success ? 'success' : 'failure',
        res.statusCode,
        success
          ? 'Vehicle ingestion request accepted'
          : 'Vehicle ingestion request rejected',
      ],
    ).catch((error: unknown) => {
      logError('Failed to record NiFi request outcome:', error)
    })
  })

  next()
}

// Inventory statistics, plus reconciliation counts for records whose status
// disagrees with their sales/service history.
vehiclesRouter.get('/stats', async (_req, res) => {
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
    sendError(res, error, 'Failed to fetch vehicle statistics')
  }
})

// List and search vehicles.
vehiclesRouter.get('/', async (req, res) => {
  const search =
    typeof req.query.search === 'string' ? req.query.search.trim() : ''
  const status =
    typeof req.query.status === 'string' ? req.query.status : undefined

  if (status !== undefined && !isVehicleStatus(status)) {
    res.status(400).json({ error: 'Status must be active, sold or in_service' })
    return
  }

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
      `(vin ILIKE ${parameter} OR make ILIKE ${parameter} OR model ILIKE ${parameter})`,
    )
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  try {
    const result = await pool.query(
      `SELECT ${VEHICLE_COLUMNS} FROM vehicles ${where} ORDER BY id ASC`,
      values,
    )
    res.json(result.rows)
  } catch (error) {
    sendError(res, error, 'Failed to fetch vehicles')
  }
})

vehiclesRouter.get('/:id', async (req, res) => {
  if (!isValidId(req.params.id)) {
    res.status(400).json({ error: 'Invalid vehicle ID' })
    return
  }

  try {
    const result = await pool.query(
      `SELECT ${VEHICLE_COLUMNS} FROM vehicles WHERE id = $1`,
      [Number(req.params.id)],
    )

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Vehicle not found' })
      return
    }

    res.json(result.rows[0])
  } catch (error) {
    sendError(res, error, 'Failed to fetch vehicle')
  }
})

type TimelineEvent = {
  at: string
  kind: 'added' | 'edited' | 'sold' | 'service' | 'deleted'
  title: string
  actor: string | null
}

// The vehicle's full story, newest first: audit entries for the vehicle, its
// sale and its service jobs. History recorded before the audit log existed
// (or by the demo seed) is reconstructed from the sales and service tables.
vehiclesRouter.get('/:id/history', async (req, res) => {
  if (!isValidId(req.params.id)) {
    res.status(400).json({ error: 'Invalid vehicle ID' })
    return
  }

  const id = Number(req.params.id)

  try {
    const vehicle = await pool.query(`SELECT ${VEHICLE_COLUMNS} FROM vehicles WHERE id = $1`, [id])

    if (vehicle.rows.length === 0) {
      res.status(404).json({ error: 'Vehicle not found' })
      return
    }

    const [entries, sales, jobs] = await Promise.all([
      pool.query(
        `SELECT a.action, a.summary, a.created_at, a.actor_email, a.actor_kind, a.entity, a.entity_id
         FROM audit_log a
         WHERE (a.entity = 'vehicle' AND a.entity_id = $1)
            OR (a.entity = 'sale' AND a.entity_id IN (SELECT id FROM sales_events WHERE vehicle_id = $1))
            OR (a.entity = 'service_job' AND a.entity_id IN (SELECT id FROM service_events WHERE vehicle_id = $1))`,
        [id],
      ),
      pool.query('SELECT id, amount, sold_at FROM sales_events WHERE vehicle_id = $1', [id]),
      pool.query(
        'SELECT id, description, status, opened_at, completed_at FROM service_events WHERE vehicle_id = $1',
        [id],
      ),
    ])

    const actorOf = (row: { actor_kind: string; actor_email: string | null }) =>
      row.actor_kind === 'machine' ? 'NiFi' : row.actor_email
    const kindOf = (action: string): TimelineEvent['kind'] =>
      action.startsWith('sale') ? 'sold'
        : action.startsWith('service') ? 'service'
          : action.endsWith('updated') ? 'edited'
            : action.endsWith('deleted') ? 'deleted'
              : 'added'

    const events: TimelineEvent[] = entries.rows.map((row) => ({
      at: row.created_at,
      kind: kindOf(row.action),
      title: row.summary,
      actor: actorOf(row),
    }))

    const audited = (entity: string, entityId: unknown) =>
      entries.rows.some((row) => row.entity === entity && String(row.entity_id) === String(entityId))

    if (!entries.rows.some((row) => row.entity === 'vehicle' && row.action !== 'vehicle.updated')) {
      const v = vehicle.rows[0]
      events.push({ at: v.created_at, kind: 'added', title: `Added ${v.make} ${v.model} (${v.vin})`, actor: null })
    }

    for (const sale of sales.rows) {
      if (!audited('sale', sale.id)) {
        events.push({ at: sale.sold_at, kind: 'sold', title: `Sold for EUR ${Number(sale.amount).toFixed(2)}`, actor: null })
      }
    }

    for (const job of jobs.rows) {
      if (audited('service_job', job.id)) continue
      events.push({ at: job.opened_at, kind: 'service', title: `Service opened: ${job.description}`, actor: null })
      if (job.completed_at) {
        events.push({ at: job.completed_at, kind: 'service', title: `Service completed: ${job.description}`, actor: null })
      } else if (job.status === 'cancelled') {
        events.push({ at: job.opened_at, kind: 'service', title: `Service cancelled: ${job.description}`, actor: null })
      }
    }

    events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

    res.json({ vehicle: vehicle.rows[0], events })
  } catch (error) {
    sendError(res, error, 'Failed to fetch vehicle history')
  }
})

// Create vehicles: admin/operator users and operator machine credentials.
// The outcome logger runs after authentication and authorization.
vehiclesRouter.post(
  '/',
  requireRole('admin', 'operator'),
  logMachineIngestion,
  async (req, res) => {
    const validated = validateNewVehicle(req.body ?? {})

    if ('error' in validated) {
      res.status(400).json({ error: validated.error })
      return
    }

    const { vin: cleanVin, make: cleanMake, model: cleanModel, model_year } = validated.vehicle
    const status = req.body.status
    const vehicleStatus = status === undefined ? 'active' : status

    if (!isVehicleStatus(vehicleStatus)) {
      res.status(400).json({ error: 'Status must be active, sold or in_service' })
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
      const created = await withTransaction(async (client) => {
        const result = await client.query(
          `INSERT INTO vehicles (vin, make, model, model_year, status)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING ${VEHICLE_COLUMNS}`,
          [cleanVin, cleanMake, cleanModel, model_year, vehicleStatus],
        )
        const vehicle = result.rows[0]
        await audit(req, {
          action: req.auth?.kind === 'machine' ? 'vehicle.ingested' : 'vehicle.created',
          entity: 'vehicle',
          entityId: vehicle.id,
          summary: `Added ${cleanMake} ${cleanModel} (${cleanVin})${
            req.auth?.kind === 'machine' ? ` via machine credential #${req.auth.id}` : ''
          }`,
        }, client)
        return vehicle
      })
      res.status(201).json(created)
    } catch (error) {
      if (isUniqueViolation(error)) {
        res.status(409).json({ error: 'A vehicle with this VIN already exists' })
        return
      }
      sendError(res, error, 'Failed to create vehicle')
    }
  },
)

const IMPORT_LIMIT = 500

// Bulk import (admin/operator users): validates every row independently and
// reports what happened to each one. Valid rows are inserted in a single
// transaction; existing VINs, and repeats within the file, are skipped.
vehiclesRouter.post(
  '/import',
  requireHuman,
  requireRole('admin', 'operator'),
  async (req, res) => {
    const rows = req.body?.vehicles

    if (!Array.isArray(rows) || rows.length === 0 || rows.length > IMPORT_LIMIT) {
      res.status(400).json({ error: `Send "vehicles" as a list of 1 to ${IMPORT_LIMIT} rows` })
      return
    }

    type Result = { row: number; vin: string | null; status: 'created' | 'duplicate' | 'invalid'; error?: string }
    const results: Result[] = []
    const seen = new Set<string>()

    try {
      await withTransaction(async (client) => {
        for (const [index, raw] of rows.entries()) {
          const row = index + 1
          const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
          const validated = validateNewVehicle({
            ...input,
            // Spreadsheet years often arrive as text.
            model_year: typeof input.model_year === 'string' ? Number(input.model_year) : input.model_year,
          })

          if ('error' in validated) {
            results.push({ row, vin: typeof input.vin === 'string' ? input.vin : null, status: 'invalid', error: validated.error })
            continue
          }

          const { vin, make, model, model_year: year } = validated.vehicle

          if (seen.has(vin)) {
            results.push({ row, vin, status: 'duplicate', error: 'Repeated earlier in this file' })
            continue
          }
          seen.add(vin)

          const inserted = await client.query(
            `INSERT INTO vehicles (vin, make, model, model_year, status)
             VALUES ($1, $2, $3, $4, 'active')
             ON CONFLICT (vin) DO NOTHING
             RETURNING id`,
            [vin, make, model, year],
          )

          results.push(
            inserted.rowCount
              ? { row, vin, status: 'created' }
              : { row, vin, status: 'duplicate', error: 'A vehicle with this VIN already exists' },
          )
        }

        const created = results.filter((r) => r.status === 'created').length
        if (created > 0) {
          await audit(req, {
            action: 'vehicle.imported',
            entity: 'vehicle',
            summary: `Imported ${created} ${created === 1 ? 'vehicle' : 'vehicles'} from a file (${rows.length - created} skipped)`,
          }, client)
        }
      })

      const count = (status: Result['status']) => results.filter((r) => r.status === status).length
      res.status(200).json({
        created: count('created'),
        duplicates: count('duplicate'),
        invalid: count('invalid'),
        results,
      })
    } catch (error) {
      sendError(res, error, 'Failed to import vehicles')
    }
  },
)

// Update vehicles: only human admin/operator accounts. Only the supplied
// fields are validated, so records with a legacy VIN stay editable.
vehiclesRouter.patch(
  '/:id',
  requireHuman,
  requireRole('admin', 'operator'),
  async (req, res) => {
    const id = String(req.params.id)

    if (!isValidId(id)) {
      res.status(400).json({ error: 'Invalid vehicle ID' })
      return
    }

    const body = req.body

    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
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

      if (!VIN_PATTERN.test(vin)) {
        res.status(400).json({ error: 'VIN must contain 17 valid characters' })
        return
      }

      values.push(vin)
      updates.push(`vin = $${values.length}`)
    }

    for (const field of ['make', 'model'] as const) {
      if (!Object.hasOwn(body, field)) continue

      if (typeof body[field] !== 'string') {
        res.status(400).json({ error: `${field} must be a string` })
        return
      }

      const value = body[field].trim()

      if (!value || value.length > 100) {
        res.status(400).json({ error: `${field} must be between 1 and 100 characters` })
        return
      }

      values.push(value)
      updates.push(`${field} = $${values.length}`)
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
      if (!isVehicleStatus(body.status)) {
        res.status(400).json({ error: 'Status must be active, sold or in_service' })
        return
      }

      values.push(body.status)
      updates.push(`status = $${values.length}`)
    }

    const vehicleId = Number(id)
    values.push(vehicleId)

    try {
      const updated = await withTransaction(async (client) => {
        const current = await client.query(
          'SELECT status, make, model FROM vehicles WHERE id = $1 FOR UPDATE',
          [vehicleId],
        )

        if (current.rows.length === 0) {
          throw new HttpError(404, 'Vehicle not found')
        }

        if (
          Object.hasOwn(body, 'status') &&
          body.status !== current.rows[0].status
        ) {
          const conflict = await statusConflict(client, vehicleId, body.status)
          if (conflict) throw new HttpError(409, conflict)
        }

        const result = await client.query(
          `UPDATE vehicles
           SET ${updates.join(', ')}
           WHERE id = $${values.length}
           RETURNING ${VEHICLE_COLUMNS}`,
          values,
        )
        await audit(req, {
          action: 'vehicle.updated',
          entity: 'vehicle',
          entityId: vehicleId,
          summary: `Edited ${current.rows[0].make} ${current.rows[0].model}: ${suppliedFields.join(', ')}`,
        }, client)
        return result.rows[0]
      })

      res.json(updated)
    } catch (error) {
      if (isUniqueViolation(error)) {
        res.status(409).json({ error: 'A vehicle with this VIN already exists' })
        return
      }
      sendError(res, error, 'Failed to update vehicle')
    }
  },
)

// Delete vehicles: admin only, never via a machine credential. Vehicles with
// sales or service history are kept so that history stays attached.
vehiclesRouter.delete(
  '/:id',
  requireHuman,
  requireRole('admin'),
  async (req, res) => {
    const id = String(req.params.id)

    if (!isValidId(id)) {
      res.status(400).json({ error: 'Invalid vehicle ID' })
      return
    }

    try {
      const deleted = await withTransaction(async (client) => {
        const found = await client.query(
          'SELECT id FROM vehicles WHERE id = $1 FOR UPDATE',
          [Number(id)],
        )

        if (found.rows.length === 0) {
          throw new HttpError(404, 'Vehicle not found')
        }

        const { hasSale } = await vehicleHistory(client, Number(id))
        const anyService = await client.query(
          'SELECT 1 FROM service_events WHERE vehicle_id = $1 LIMIT 1',
          [Number(id)],
        )

        if (hasSale || anyService.rowCount) {
          throw new HttpError(
            409,
            'This vehicle has sales or service history and cannot be deleted',
          )
        }

        const result = await client.query(
          `DELETE FROM vehicles WHERE id = $1 RETURNING ${VEHICLE_COLUMNS}`,
          [Number(id)],
        )
        const removed = result.rows[0]
        await audit(req, {
          action: 'vehicle.deleted',
          entity: 'vehicle',
          entityId: removed.id,
          summary: `Deleted ${removed.make} ${removed.model} (${removed.vin})`,
        }, client)
        return removed
      })

      res.json({ message: 'Vehicle deleted successfully', vehicle: deleted })
    } catch (error) {
      sendError(res, error, 'Failed to delete vehicle')
    }
  },
)
