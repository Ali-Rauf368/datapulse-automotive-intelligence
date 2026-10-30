import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { app } from '../index.ts'
import { pool } from '../db.ts'
import { login } from '../auth/auth.ts'

const stamp = Date.now()
const password = 'Import-Insights-2026!'
const emails = { operator: `dp-imp-op-${stamp}@example.test`, viewer: `dp-imp-view-${stamp}@example.test` }
const tokens: Record<string, string> = {}
const vins: string[] = []
let startedAt: Date

const vin = (n: number) => {
  const value = `MX${String(stamp % 1e12).padStart(12, '0')}${String(n).padStart(3, '0')}`
  vins.push(value)
  return value
}
const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` })

beforeAll(async () => {
  startedAt = (await pool.query('SELECT NOW() AS now')).rows[0].now
  const hash = await bcrypt.hash(password, 4)
  for (const [role, email] of Object.entries(emails)) {
    await pool.query('INSERT INTO app_users (email, password_hash, role) VALUES ($1, $2, $3)', [email, hash, role])
    tokens[role] = (await login(email, password))!.token
  }
})

afterAll(async () => {
  try {
    await pool.query(
      'DELETE FROM sales_events WHERE vehicle_id IN (SELECT id FROM vehicles WHERE vin = ANY($1::text[]))',
      [vins],
    )
    await pool.query('DELETE FROM vehicles WHERE vin = ANY($1::text[])', [vins])
    await pool.query('DELETE FROM app_users WHERE email = ANY($1::text[])', [Object.values(emails)])
    await pool.query('DELETE FROM audit_log WHERE created_at >= $1', [startedAt])
  } finally {
    await pool.end()
  }
})

describe('Vehicle import', () => {
  it('imports valid rows and reports every skipped row with a reason', async () => {
    const existing = vin(1)
    await request(app).post('/api/vehicles').set(as('operator'))
      .send({ vin: existing, make: 'Seat', model: 'Leon', model_year: 2022 })
    const fresh = vin(2)

    const response = await request(app).post('/api/vehicles/import').set(as('operator')).send({
      vehicles: [
        { vin: fresh.toLowerCase(), make: ' Mazda ', model: 'CX-5', model_year: '2023' },
        { vin: existing, make: 'Seat', model: 'Leon', model_year: 2022 },
        { vin: fresh, make: 'Mazda', model: 'CX-5', model_year: 2023 },
        { vin: 'TOO-SHORT', make: 'Fiat', model: '500', model_year: 2021 },
        { vin: vin(3), make: 'Fiat', model: '500', model_year: 1700 },
        'not an object',
      ],
    })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ created: 1, duplicates: 2, invalid: 3 })
    expect(response.body.results.map((r: { status: string }) => r.status))
      .toEqual(['created', 'duplicate', 'duplicate', 'invalid', 'invalid', 'invalid'])
    expect(response.body.results[1].error).toBe('A vehicle with this VIN already exists')
    expect(response.body.results[2].error).toBe('Repeated earlier in this file')
    expect(response.body.results[3].error).toBe('VIN must contain 17 valid characters')

    const stored = await pool.query('SELECT make, model, model_year, status FROM vehicles WHERE vin = $1', [fresh])
    expect(stored.rows[0]).toMatchObject({ make: 'Mazda', model: 'CX-5', model_year: 2023, status: 'active' })

    const log = await pool.query("SELECT summary FROM audit_log WHERE action = 'vehicle.imported' ORDER BY id DESC LIMIT 1")
    expect(log.rows[0].summary).toBe('Imported 1 vehicle from a file (5 skipped)')
  })

  it('is limited to admins and operators, and to 500 rows', async () => {
    const row = { vin: vin(4), make: 'Opel', model: 'Mokka', model_year: 2024 }
    expect((await request(app).post('/api/vehicles/import').set(as('viewer')).send({ vehicles: [row] })).status).toBe(403)
    expect((await request(app).post('/api/vehicles/import').set(as('operator')).send({ vehicles: [] })).status).toBe(400)
    expect((await request(app).post('/api/vehicles/import').set(as('operator'))
      .send({ vehicles: Array.from({ length: 501 }, () => row) })).status).toBe(400)
  })
})

describe('Insights comparison and highlights', () => {
  it('compares with the previous period and explains the numbers in words', async () => {
    const id = (await request(app).post('/api/vehicles').set(as('operator'))
      .send({ vin: vin(5), make: 'Genesis', model: 'GV60', model_year: 2024 })).body.id
    await request(app).post('/api/sales').set(as('operator')).send({ vehicle_id: id, amount: 50000 })
    // One older sale in the previous 30-day window.
    const older = (await request(app).post('/api/vehicles').set(as('operator'))
      .send({ vin: vin(6), make: 'Genesis', model: 'GV70', model_year: 2023 })).body.id
    await request(app).post('/api/sales').set(as('operator'))
      .send({ vehicle_id: older, amount: 40000, sold_at: new Date(Date.now() - 45 * 86_400_000).toISOString() })

    const response = await request(app).get('/api/analytics/insights?range=30').set(as('viewer'))

    expect(response.status).toBe(200)
    expect(response.body.previous.revenue).toBeGreaterThanOrEqual(40000)
    expect(typeof response.body.change.revenue).toBe('number')
    expect(response.body.highlights[0]).toMatch(/^Revenue is (up|down) [\d.]+% on the previous period/)
    expect(response.body.highlights.at(-1)).toMatch(/ready to sell and \d+ service jobs? (is|are) open right now\.$/)
  })

  it('has no comparison for all time', async () => {
    const response = await request(app).get('/api/analytics/insights?range=all').set(as('viewer'))
    expect(response.body.previous).toBeNull()
    expect(response.body.change).toEqual({ revenue: null, sales: null })
  })
})
