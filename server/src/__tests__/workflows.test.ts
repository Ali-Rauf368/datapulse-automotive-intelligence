import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { app } from '../index.ts'
import { pool } from '../db.ts'
import { createMachineCredential, login } from '../auth/auth.ts'

const stamp = Date.now()
const testPassword = 'DataPulse-Workflow-Password-2026!'
const users = {
  admin: `dp-wf-admin-${stamp}@example.test`,
  operator: `dp-wf-operator-${stamp}@example.test`,
}
const vehicleIds = new Set<number>()
const machineCredentialNames: string[] = []
let testStartedAt: Date | undefined
let adminToken = ''
let operatorToken = ''
let vinCounter = 0

// "WF" + 12 clock digits + 3-digit counter: unique, valid 17-character VINs.
const makeVin = () =>
  `WF${String(Date.now() % 1e12).padStart(12, '0')}${String(vinCounter++ % 1000).padStart(3, '0')}`

function asUser(token: string) {
  return { Authorization: `Bearer ${token}` }
}

async function createVehicle(overrides: Record<string, unknown> = {}) {
  const response = await request(app)
    .post('/api/vehicles')
    .set(asUser(operatorToken))
    .send({
      vin: makeVin(),
      make: 'Volkswagen',
      model: 'Golf',
      model_year: 2023,
      ...overrides,
    })

  expect(response.status).toBe(201)
  vehicleIds.add(Number(response.body.id))
  return Number(response.body.id)
}

// Mirrors records created before the sales/service workflows existed, which
// can carry a status without matching history (and a non-standard VIN).
async function createLegacyVehicle(status: 'sold' | 'in_service', vin: string) {
  const result = await pool.query(
    `INSERT INTO vehicles (vin, make, model, model_year, status)
     VALUES ($1, 'Lexus', 'NX', 2025, $2)
     RETURNING id`,
    [vin, status],
  )
  const id = Number(result.rows[0].id)
  vehicleIds.add(id)
  return id
}

async function getVehicle(id: number) {
  const response = await request(app)
    .get(`/api/vehicles/${id}`)
    .set(asUser(operatorToken))
  return response.body
}

async function getJson(path: string) {
  const response = await request(app).get(path).set(asUser(operatorToken))
  expect(response.status).toBe(200)
  return response.body
}

async function recordSale(vehicleId: number, amount: unknown, token = operatorToken) {
  return request(app)
    .post('/api/sales')
    .set(asUser(token))
    .send({ vehicle_id: vehicleId, amount })
}

async function openServiceJob(vehicleId: number, description = 'Brake inspection') {
  return request(app)
    .post('/api/service')
    .set(asUser(operatorToken))
    .send({ vehicle_id: vehicleId, description })
}

async function setServiceStatus(jobId: number, status: string) {
  return request(app)
    .patch(`/api/service/${jobId}`)
    .set(asUser(operatorToken))
    .send({ status })
}

beforeAll(async () => {
  const clock = await pool.query('SELECT NOW() AS now')
  testStartedAt = clock.rows[0].now

  const hash = await bcrypt.hash(testPassword, 4)

  await pool.query(
    `INSERT INTO app_users (email, password_hash, role)
     VALUES ($1, $3, 'admin'), ($2, $3, 'operator')`,
    [users.admin, users.operator, hash],
  )

  const admin = await login(users.admin, testPassword)
  const operator = await login(users.operator, testPassword)

  if (!admin || !operator) throw new Error('Could not sign in test users')

  adminToken = admin.token
  operatorToken = operator.token
})

afterAll(async () => {
  try {
    const ids = [...vehicleIds]
    await pool.query('DELETE FROM sales_events WHERE vehicle_id = ANY($1::bigint[])', [ids])
    await pool.query('DELETE FROM service_events WHERE vehicle_id = ANY($1::bigint[])', [ids])
    await pool.query('DELETE FROM vehicles WHERE id = ANY($1::bigint[])', [ids])
    await pool.query('DELETE FROM app_users WHERE email = ANY($1::text[])', [
      [users.admin, users.operator],
    ])
    await pool.query('DELETE FROM api_credentials WHERE name = ANY($1::text[])', [
      machineCredentialNames,
    ])
    // Ingestion log rows written by this suite (tests only run against a
    // dedicated *_test database).
    if (testStartedAt) {
      await pool.query('DELETE FROM nifi_request_logs WHERE created_at >= $1', [
        testStartedAt,
      ])
      await pool.query('DELETE FROM audit_log WHERE created_at >= $1', [testStartedAt])
    }
  } finally {
    await pool.end()
  }
})

describe('Sales workflow', () => {
  it('records a sale, marks the vehicle sold and updates the metrics', async () => {
    const statsBefore = await getJson('/api/vehicles/stats')
    const salesBefore = await getJson('/api/analytics/sales')

    const id = await createVehicle({ make: 'BMW', model: '320d' })
    const response = await recordSale(id, 23990.5)

    expect(response.status).toBe(201)
    expect(Number(response.body.vehicle_id)).toBe(id)
    expect(response.body.amount).toBe('23990.50')
    expect((await getVehicle(id)).status).toBe('sold')

    const statsAfter = await getJson('/api/vehicles/stats')
    expect(statsAfter.total).toBe(statsBefore.total + 1)
    expect(statsAfter.active).toBe(statsBefore.active)
    expect(statsAfter.sold).toBe(statsBefore.sold + 1)

    const salesAfter = await getJson('/api/analytics/sales')
    expect(salesAfter.totalSales).toBe(salesBefore.totalSales + 1)
    expect(salesAfter.totalRevenue).toBeCloseTo(salesBefore.totalRevenue + 23990.5, 2)
    expect(salesAfter.hasData).toBe(true)
    expect(salesAfter.daily.at(-1).sales).toBeGreaterThanOrEqual(1)

    const history = await getJson('/api/sales')
    expect(history.some((sale: { vehicle_id: string; make: string }) =>
      Number(sale.vehicle_id) === id && sale.make === 'BMW')).toBe(true)
  })

  it('rejects a second sale of the same vehicle', async () => {
    const id = await createVehicle()
    expect((await recordSale(id, 18000)).status).toBe(201)

    const response = await recordSale(id, 18000)

    expect(response.status).toBe(409)
    expect(response.body.error).toBe('This vehicle has already been sold')
  })

  it.each([[0], [-1], ['abc'], [null], [true], [1e11]])(
    'rejects an invalid amount (%s)',
    async (amount) => {
      const id = await createVehicle()
      const response = await recordSale(id, amount)

      expect(response.status).toBe(400)
      expect((await getVehicle(id)).status).toBe('active')
    },
  )

  it('returns 404 for an unknown vehicle', async () => {
    const response = await recordSale(999999999, 1000)

    expect(response.status).toBe(404)
  })

  it('will not sell a vehicle that has an open service job', async () => {
    const id = await createVehicle()
    expect((await openServiceJob(id)).status).toBe(201)

    const response = await recordSale(id, 15000)

    expect(response.status).toBe(409)
    expect((await getVehicle(id)).status).toBe('in_service')
  })

  it('records the missing sale for a vehicle marked sold before sales were tracked', async () => {
    const id = await createLegacyVehicle('sold', `LEGACY-S${String(stamp).slice(-9)}`)
    const before = await getJson('/api/vehicles/stats')
    expect(before.sold_without_sale).toBeGreaterThanOrEqual(1)

    expect((await recordSale(id, 41500)).status).toBe(201)

    const after = await getJson('/api/vehicles/stats')
    expect(after.sold_without_sale).toBe(before.sold_without_sale - 1)
    expect((await recordSale(id, 41500)).status).toBe(409)
  })
})

describe('Service workflow', () => {
  it('opens a job and puts the vehicle in service', async () => {
    const id = await createVehicle()
    const response = await openServiceJob(id, 'Annual inspection (30,000 km)')

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({
      status: 'open',
      description: 'Annual inspection (30,000 km)',
      completed_at: null,
    })
    expect((await getVehicle(id)).status).toBe('in_service')
  })

  it('moves a job to in_progress (regression: PostgreSQL parameter types)', async () => {
    const id = await createVehicle()
    const job = await openServiceJob(id)

    const response = await setServiceStatus(job.body.id, 'in_progress')

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('in_progress')
    expect(response.body.completed_at).toBeNull()
    expect((await getVehicle(id)).status).toBe('in_service')
  })

  it('completes a job, stamps completed_at and returns the vehicle to active', async () => {
    const serviceBefore = await getJson('/api/analytics/service')
    const id = await createVehicle()
    const job = await openServiceJob(id)
    expect((await setServiceStatus(job.body.id, 'in_progress')).status).toBe(200)

    const response = await setServiceStatus(job.body.id, 'completed')

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('completed')
    expect(response.body.completed_at).toBeTruthy()
    expect((await getVehicle(id)).status).toBe('active')

    const serviceAfter = await getJson('/api/analytics/service')
    expect(serviceAfter.completed).toBe(serviceBefore.completed + 1)
    expect(serviceAfter.total).toBe(serviceBefore.total + 1)
  })

  it('keeps the vehicle in service until its last open job is closed', async () => {
    const id = await createVehicle()
    const first = await openServiceJob(id, 'Oil and filter change')
    const second = await openServiceJob(id, 'Replace front brake pads')

    expect((await setServiceStatus(first.body.id, 'completed')).status).toBe(200)
    expect((await getVehicle(id)).status).toBe('in_service')

    expect((await setServiceStatus(second.body.id, 'cancelled')).status).toBe(200)
    expect((await getVehicle(id)).status).toBe('active')
  })

  it('treats completed and cancelled jobs as final', async () => {
    const id = await createVehicle()
    const job = await openServiceJob(id)
    expect((await setServiceStatus(job.body.id, 'completed')).status).toBe(200)

    const response = await setServiceStatus(job.body.id, 'open')

    expect(response.status).toBe(409)
    expect((await getVehicle(id)).status).toBe('active')
  })

  it('rejects an unknown status or job', async () => {
    const id = await createVehicle()
    const job = await openServiceJob(id)

    expect((await setServiceStatus(job.body.id, 'pending')).status).toBe(400)
    expect((await setServiceStatus(999999999, 'completed')).status).toBe(404)
  })

  it('refuses to open service for a sold vehicle', async () => {
    const id = await createVehicle()
    expect((await recordSale(id, 9900)).status).toBe(201)

    const response = await openServiceJob(id)

    expect(response.status).toBe(409)
  })

  it('lists jobs with vehicle details', async () => {
    const id = await createVehicle({ make: 'Škoda', model: 'Octavia' })
    const job = await openServiceJob(id, 'Tyre change: summer to winter')

    const jobs = await getJson('/api/service')
    const listed = jobs.find((item: { id: string }) => Number(item.id) === Number(job.body.id))

    expect(listed).toMatchObject({
      make: 'Škoda',
      model: 'Octavia',
      status: 'open',
      description: 'Tyre change: summer to winter',
    })
  })
})

describe('Inventory status integrity', () => {
  it('rejects marking a vehicle sold without recording a sale', async () => {
    const id = await createVehicle()
    const response = await request(app)
      .patch(`/api/vehicles/${id}`)
      .set(asUser(operatorToken))
      .send({ status: 'sold' })

    expect(response.status).toBe(409)
    expect((await getVehicle(id)).status).toBe('active')
  })

  it('rejects putting a vehicle in service without a job', async () => {
    const id = await createVehicle()
    const response = await request(app)
      .patch(`/api/vehicles/${id}`)
      .set(asUser(operatorToken))
      .send({ status: 'in_service' })

    expect(response.status).toBe(409)
  })

  it('rejects reactivating a vehicle with an open job or a recorded sale', async () => {
    const inService = await createVehicle()
    await openServiceJob(inService)
    const sold = await createVehicle()
    await recordSale(sold, 12000)

    for (const id of [inService, sold]) {
      const response = await request(app)
        .patch(`/api/vehicles/${id}`)
        .set(asUser(operatorToken))
        .send({ status: 'active' })

      expect(response.status).toBe(409)
    }
  })

  it('lets a legacy in-service vehicle without a job return to active', async () => {
    const id = await createLegacyVehicle('in_service', `LEGACY-I${String(stamp).slice(-9)}`)
    const before = await getJson('/api/vehicles/stats')
    expect(before.in_service_without_open_job).toBeGreaterThanOrEqual(1)

    const response = await request(app)
      .patch(`/api/vehicles/${id}`)
      .set(asUser(operatorToken))
      .send({ status: 'active' })

    expect(response.status).toBe(200)
    const after = await getJson('/api/vehicles/stats')
    expect(after.in_service_without_open_job).toBe(before.in_service_without_open_job - 1)
  })

  it('edits other fields of a vehicle whose stored VIN predates validation', async () => {
    const legacyVin = `DEMO-L${String(stamp).slice(-11)}`
    const id = await createLegacyVehicle('sold', legacyVin)

    const response = await request(app)
      .patch(`/api/vehicles/${id}`)
      .set(asUser(operatorToken))
      .send({ model: 'NX 350h' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ vin: legacyVin, model: 'NX 350h', status: 'sold' })
  })

  it('starts vehicles added by people as active', async () => {
    const response = await request(app)
      .post('/api/vehicles')
      .set(asUser(operatorToken))
      .send({ vin: makeVin(), make: 'Kia', model: 'EV6', model_year: 2024, status: 'sold' })

    expect(response.status).toBe(400)
  })

  it('lets machine ingestion import an existing status', async () => {
    const name = `test-machine-wf-${stamp}`
    const token = await createMachineCredential(name, 'operator')
    machineCredentialNames.push(name)

    const response = await request(app)
      .post('/api/vehicles')
      .set(asUser(token))
      .send({ vin: makeVin(), make: 'Tesla', model: 'Model 3', model_year: 2022, status: 'in_service' })

    expect(response.status).toBe(201)
    vehicleIds.add(Number(response.body.id))
  })

  it('keeps vehicles that have sales or service history', async () => {
    const sold = await createVehicle()
    await recordSale(sold, 7500)
    const serviced = await createVehicle()
    const job = await openServiceJob(serviced)
    await setServiceStatus(job.body.id, 'completed')

    for (const id of [sold, serviced]) {
      const response = await request(app)
        .delete(`/api/vehicles/${id}`)
        .set(asUser(adminToken))

      expect(response.status).toBe(409)
      expect((await getVehicle(id)).id).toBeDefined()
    }
  })
})

describe('API errors', () => {
  it('answers unknown API routes with JSON 404', async () => {
    const response = await request(app).get('/api/does-not-exist')

    expect(response.status).toBe(404)
    expect(response.headers['content-type']).toMatch(/application\/json/)
  })

  it('answers malformed JSON with 400', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":')

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Invalid JSON request body')
  })

  it('answers an oversized body with JSON 413 and no stack trace', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ pad: 'x'.repeat(1_100_000) }))

    expect(response.status).toBe(413)
    expect(response.body).toEqual({ error: 'Request body is too large' })
    expect(response.text).not.toMatch(/node_modules|at \w+ \(/)
  })

  it('does not advertise Express', async () => {
    const response = await request(app).get('/api/health')

    expect(response.headers['x-powered-by']).toBeUndefined()
  })
})
