import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { app } from '../index.ts'
import { pool } from '../db.ts'
import { login } from '../auth/auth.ts'

const stamp = Date.now()
const password = 'DataPulse-Admin-Password-2026!'
const emails = {
  admin: `dp-adm-admin-${stamp}@example.test`,
  operator: `dp-adm-operator-${stamp}@example.test`,
  viewer: `dp-adm-viewer-${stamp}@example.test`,
}
const ids: Record<string, string> = {}
const tokens: Record<string, string> = {}
const vehicleIds: number[] = []
let startedAt: Date

const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` })

beforeAll(async () => {
  startedAt = (await pool.query('SELECT NOW() AS now')).rows[0].now
  const hash = await bcrypt.hash(password, 4)

  for (const [role, email] of Object.entries(emails)) {
    const row = await pool.query(
      'INSERT INTO app_users (email, password_hash, role, name) VALUES ($1, $2, $3, $4) RETURNING id',
      [email, hash, role, `Test ${role}`],
    )
    ids[role] = String(row.rows[0].id)
    const session = await login(email, password)
    if (!session) throw new Error('login failed')
    tokens[role] = session.token
  }
})

afterAll(async () => {
  try {
    await pool.query('DELETE FROM sales_events WHERE vehicle_id = ANY($1::bigint[])', [vehicleIds])
    await pool.query('DELETE FROM vehicles WHERE id = ANY($1::bigint[])', [vehicleIds])
    await pool.query('DELETE FROM app_users WHERE email = ANY($1::text[])', [Object.values(emails)])
    await pool.query('DELETE FROM audit_log WHERE created_at >= $1', [startedAt])
  } finally {
    await pool.end()
  }
})

describe('User management', () => {
  it('lists users for admins only', async () => {
    const list = await request(app).get('/api/users').set(as('admin'))
    expect(list.status).toBe(200)
    expect(list.body.some((u: { email: string }) => u.email === emails.viewer)).toBe(true)
    expect(list.body[0]).not.toHaveProperty('password_hash')

    expect((await request(app).get('/api/users').set(as('operator'))).status).toBe(403)
    expect((await request(app).get('/api/users')).status).toBe(401)
  })

  it('promotes a viewer, and the new role applies immediately', async () => {
    const before = await request(app).post('/api/vehicles').set(as('viewer'))
      .send({ vin: `AD${String(stamp).slice(-12)}001`, make: 'Kia', model: 'Ceed', model_year: 2023 })
    expect(before.status).toBe(403)

    const promoted = await request(app).patch(`/api/users/${ids.viewer}`).set(as('admin')).send({ role: 'operator' })
    expect(promoted.status).toBe(200)
    expect(promoted.body.role).toBe('operator')

    const after = await request(app).post('/api/vehicles').set(as('viewer'))
      .send({ vin: `AD${String(stamp).slice(-12)}002`, make: 'Kia', model: 'Ceed', model_year: 2023 })
    expect(after.status).toBe(201)
    vehicleIds.push(Number(after.body.id))
  })

  it('deactivating an account ends its session at once', async () => {
    expect((await request(app).patch(`/api/users/${ids.operator}`).set(as('admin')).send({ active: false })).status).toBe(200)
    expect((await request(app).get('/api/vehicles').set(as('operator'))).status).toBe(401)

    expect((await request(app).patch(`/api/users/${ids.operator}`).set(as('admin')).send({ active: true })).status).toBe(200)
    expect((await request(app).get('/api/vehicles').set(as('operator'))).status).toBe(200)
  })

  it('protects the admin’s own account', async () => {
    const response = await request(app).patch(`/api/users/${ids.admin}`).set(as('admin')).send({ role: 'viewer' })
    expect(response.status).toBe(409)
  })

  it('rejects invalid changes', async () => {
    expect((await request(app).patch(`/api/users/${ids.viewer}`).set(as('admin')).send({ role: 'owner' })).status).toBe(400)
    expect((await request(app).patch(`/api/users/${ids.viewer}`).set(as('admin')).send({})).status).toBe(400)
    expect((await request(app).patch('/api/users/999999999').set(as('admin')).send({ role: 'viewer' })).status).toBe(404)
  })
})

describe('Audit log', () => {
  it('records changes with the acting user, newest first', async () => {
    const vehicle = await request(app).post('/api/vehicles').set(as('admin'))
      .send({ vin: `AD${String(stamp).slice(-12)}003`, make: 'Volvo', model: 'EX30', model_year: 2025 })
    vehicleIds.push(Number(vehicle.body.id))
    await request(app).post('/api/sales').set(as('admin')).send({ vehicle_id: vehicle.body.id, amount: 36990 })

    const log = await request(app).get('/api/audit?limit=10').set(as('admin'))

    expect(log.status).toBe(200)
    expect(log.body[0]).toMatchObject({ action: 'sale.recorded', actor_email: emails.admin, entity: 'sale' })
    expect(log.body[0].summary).toContain('Volvo EX30')
    expect(log.body.some((e: { action: string; summary: string }) =>
      e.action === 'vehicle.created' && e.summary.includes('Volvo EX30'))).toBe(true)
    expect(log.body.some((e: { action: string }) => e.action === 'user.updated')).toBe(true)
  })

  it('filters by entity and is admin-only', async () => {
    const sales = await request(app).get('/api/audit?entity=sale').set(as('admin'))
    expect(sales.body.every((e: { entity: string }) => e.entity === 'sale')).toBe(true)
    expect((await request(app).get('/api/audit?entity=nope').set(as('admin'))).status).toBe(400)
    expect((await request(app).get('/api/audit').set(as('operator'))).status).toBe(403)
  })

  it('writes nothing when the change is rejected', async () => {
    const before = await pool.query('SELECT count(*)::int AS n FROM audit_log')
    await request(app).post('/api/sales').set(as('admin')).send({ vehicle_id: vehicleIds[1], amount: 1 })
    const after = await pool.query('SELECT count(*)::int AS n FROM audit_log')
    expect(after.rows[0].n).toBe(before.rows[0].n)
  })
})

describe('Insights', () => {
  it('returns monthly revenue, top makes and timing metrics', async () => {
    const response = await request(app).get('/api/analytics/insights?range=30').set(as('viewer'))

    expect(response.status).toBe(200)
    expect(response.body.range).toBe('30')
    expect(response.body.revenue).toBeGreaterThanOrEqual(36990)
    expect(response.body.monthly.at(-1)).toMatchObject({ month: expect.stringMatching(/^\d{4}-\d{2}$/) })
    expect(response.body.topMakes.some((m: { make: string }) => m.make === 'Volvo')).toBe(true)
    expect(typeof response.body.averageDaysInStock).toBe('number')
  })

  it('validates the range', async () => {
    expect((await request(app).get('/api/analytics/insights?range=7').set(as('viewer'))).status).toBe(400)
  })
})

describe('API documentation', () => {
  it('serves the OpenAPI document and Swagger UI', async () => {
    const spec = await request(app).get('/api/docs/openapi.json')
    expect(spec.status).toBe(200)
    expect(spec.body.openapi).toBe('3.1.0')
    expect(Object.keys(spec.body.paths)).toContain('/api/analytics/insights')

    const ui = await request(app).get('/api/docs')
    expect(ui.status).toBe(200)
    expect(ui.text).toContain('SwaggerUIBundle')
  })
})
