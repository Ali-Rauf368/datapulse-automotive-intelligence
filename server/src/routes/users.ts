import { Router } from 'express'
import { pool } from '../db.ts'
import { authenticate, requireHuman, requireRole } from '../auth/auth.ts'
import { audit } from '../lib/audit.ts'
import { HttpError, isValidId, sendError, withTransaction } from '../lib/http.ts'

const ROLES = ['admin', 'operator', 'viewer']

// User management and the audit trail: human administrators only.
export const usersRouter = Router()
export const auditRouter = Router()

usersRouter.use(authenticate, requireHuman, requireRole('admin'))
auditRouter.use(authenticate, requireHuman, requireRole('admin'))

usersRouter.get('/', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, email, name, role, active, created_at
      FROM app_users
      ORDER BY created_at DESC, id DESC
    `)
    res.json(result.rows)
  } catch (error) {
    sendError(res, error, 'Failed to fetch users')
  }
})

// Changes a role and/or activates or deactivates an account. Admins cannot
// change their own account, and the last active admin is always kept, so
// the system can never be locked out.
usersRouter.patch('/:id', async (req, res) => {
  const id = String(req.params.id)
  const { role, active } = req.body ?? {}

  if (
    !isValidId(id) ||
    (role === undefined && active === undefined) ||
    (role !== undefined && !ROLES.includes(role)) ||
    (active !== undefined && typeof active !== 'boolean')
  ) {
    res.status(400).json({ error: 'Provide a valid role (admin, operator, viewer) and/or active flag' })
    return
  }

  if (id === req.auth?.id) {
    res.status(409).json({ error: 'You cannot change your own role or access' })
    return
  }

  try {
    const user = await withTransaction(async (client) => {
      // Serialise changes so two requests cannot both remove the last admin.
      await client.query('LOCK TABLE app_users IN SHARE ROW EXCLUSIVE MODE')

      const found = await client.query(
        'SELECT id, email, role, active FROM app_users WHERE id = $1',
        [Number(id)],
      )
      if (!found.rowCount) throw new HttpError(404, 'User not found')

      const current = found.rows[0]
      const nextRole = role ?? current.role
      const nextActive = active ?? current.active

      if (current.role === 'admin' && current.active && (nextRole !== 'admin' || !nextActive)) {
        const admins = await client.query(
          "SELECT count(*)::int AS count FROM app_users WHERE role = 'admin' AND active = TRUE",
        )
        if (admins.rows[0].count <= 1) {
          throw new HttpError(409, 'At least one active administrator is required')
        }
      }

      const updated = await client.query(
        `UPDATE app_users SET role = $1, active = $2 WHERE id = $3
         RETURNING id, email, name, role, active, created_at`,
        [nextRole, nextActive, Number(id)],
      )

      const changes = [
        nextRole !== current.role && `role ${current.role} -> ${nextRole}`,
        nextActive !== current.active && (nextActive ? 'reactivated' : 'deactivated'),
      ].filter(Boolean)

      if (changes.length) {
        await audit(req, {
          action: 'user.updated',
          entity: 'user',
          entityId: Number(id),
          summary: `${current.email}: ${changes.join(', ')}`,
        }, client)
      }

      return updated.rows[0]
    })

    res.json(user)
  } catch (error) {
    sendError(res, error, 'Failed to update user')
  }
})

// Most recent audit entries, optionally filtered by entity.
auditRouter.get('/', async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200)
  const entity = typeof req.query.entity === 'string' ? req.query.entity : null

  if (entity && !['vehicle', 'sale', 'service_job', 'user'].includes(entity)) {
    res.status(400).json({ error: 'Unknown entity filter' })
    return
  }

  try {
    const result = await pool.query(
      `SELECT id, actor_email, actor_kind, action, entity, entity_id, summary, created_at
       FROM audit_log
       WHERE ($1::text IS NULL OR entity = $1::text)
       ORDER BY created_at DESC, id DESC
       LIMIT $2`,
      [entity, limit],
    )
    res.json(result.rows)
  } catch (error) {
    sendError(res, error, 'Failed to fetch audit log')
  }
})
