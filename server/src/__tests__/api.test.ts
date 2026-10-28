import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { app } from '../index.ts'
import { pool } from '../db.ts'
import { createMachineCredential, login } from '../auth/auth.ts'
import bcrypt from 'bcryptjs'

// "DP" + 12 clock digits + a 3-digit counter keeps VINs unique even when
// several are generated within the same millisecond.
let vinCounter = 0
const makeTestVin = () =>
  `DP${String(Date.now() % 1e12).padStart(12, '0')}${String(vinCounter++ % 1000).padStart(3, '0')}`

const createdVehicleIds = new Set<number>()
const machineCredentialNames: string[] = []
let testStartedAt: Date

const testPassword = 'DataPulse-Test-Password-2026!'
const testEmails = {
  admin: `dp-admin-${Date.now()}@example.test`,
  operator: `dp-operator-${Date.now()}@example.test`,
  viewer: `dp-viewer-${Date.now()}@example.test`,
}

let adminToken = ''
let operatorToken = ''
let viewerToken = ''
let machineToken = ''

function trackCreatedVehicle(id: unknown): number {
  const parsedId = Number(id)

  if (Number.isSafeInteger(parsedId) && parsedId > 0) {
    createdVehicleIds.add(parsedId)
  }

  return parsedId
}

function vehiclePayload(overrides: Record<string, unknown> = {}) {
  return {
    vin: makeTestVin(),
    make: 'DataPulseTest',
    model: 'Integration',
    model_year: 2024,
    status: 'active',
    ...overrides,
  }
}

function asUser(token: string) {
  return { Authorization: `Bearer ${token}` }
}

async function createTestUser(
  email: string,
  role: 'admin' | 'operator' | 'viewer',
) {
  const passwordHash = await bcrypt.hash(testPassword, 4)

  await pool.query(
    `INSERT INTO app_users (email, password_hash, role, active)
     VALUES ($1, $2, $3, TRUE)`,
    [email, passwordHash, role],
  )
}

async function createVehicle(
  token = adminToken,
  overrides: Record<string, unknown> = {},
) {
  const response = await request(app)
    .post('/api/vehicles')
    .set(asUser(token))
    .send(vehiclePayload(overrides))

  if (response.status === 201) {
    trackCreatedVehicle(response.body.id)
  }

  return response
}

describe('DataPulse API', () => {
  beforeAll(async () => {
    const clock = await pool.query('SELECT NOW() AS now')
    testStartedAt = clock.rows[0].now

    await createTestUser(testEmails.admin, 'admin')
    await createTestUser(testEmails.operator, 'operator')
    await createTestUser(testEmails.viewer, 'viewer')

    const admin = await login(testEmails.admin, testPassword)
    const operator = await login(testEmails.operator, testPassword)
    const viewer = await login(testEmails.viewer, testPassword)

    if (!admin || !operator || !viewer) {
      throw new Error('Could not authenticate test users')
    }

    adminToken = admin.token
    operatorToken = operator.token
    viewerToken = viewer.token

    const machineName = `test-machine-${Date.now()}`
    machineToken = await createMachineCredential(machineName, 'operator')
    machineCredentialNames.push(machineName)
  })

  afterAll(async () => {
    try {
      if (createdVehicleIds.size > 0) {
        await pool.query(
          'DELETE FROM vehicles WHERE id = ANY($1::bigint[])',
          [[...createdVehicleIds]],
        )
      }

      await pool.query(
        'DELETE FROM app_users WHERE email = ANY($1::text[])',
        [[testEmails.admin, testEmails.operator, testEmails.viewer]],
      )

      await pool.query(
        'DELETE FROM api_credentials WHERE name = ANY($1::text[])',
        [machineCredentialNames],
      )

      // Ingestion log rows written by this suite (tests only run against a
      // dedicated *_test database).
      if (testStartedAt) {
        await pool.query(
          'DELETE FROM nifi_request_logs WHERE created_at >= $1',
          [testStartedAt],
        )
      }
    } finally {
      await pool.end()
    }
  })

  describe('Health and database', () => {
    it('returns a healthy API status without authentication', async () => {
      const response = await request(app).get('/api/health')

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({
        status: 'ok',
        service: 'DataPulse API',
      })
      expect(response.body.timestamp).toBeDefined()
    })

    it('confirms the database connection', async () => {
      const response = await request(app).get('/api/health/db')

      expect(response.status).toBe(200)
      expect(response.body.status).toBe('ok')
    })

    it('requires authentication for vehicle statistics', async () => {
      const response = await request(app).get('/api/vehicles/stats')

      expect(response.status).toBe(401)
    })

    it('returns vehicle statistics to an authenticated user', async () => {
      const response = await request(app)
        .get('/api/vehicles/stats')
        .set(asUser(adminToken))

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('total')
      expect(response.body).toHaveProperty('active')
      expect(response.body).toHaveProperty('sold')
      expect(response.body).toHaveProperty('in_service')
    })
  })

  describe('Authentication', () => {
    it('logs in with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmails.admin,
          password: testPassword,
        })

      expect(response.status).toBe(200)
      expect(response.body.token).toBeTruthy()
      expect(response.body.user).toMatchObject({
        email: testEmails.admin,
        role: 'admin',
      })
    })

    it('rejects an incorrect password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmails.admin,
          password: 'incorrect-password',
        })

      expect(response.status).toBe(401)
    })

    it('rejects requests without a bearer token', async () => {
      const response = await request(app).get('/api/vehicles')

      expect(response.status).toBe(401)
    })

    it('rejects an invalid bearer token', async () => {
      const response = await request(app)
        .get('/api/vehicles')
        .set('Authorization', 'Bearer invalid-token')

      expect(response.status).toBe(401)
    })
  })

  describe('GET /api/vehicles', () => {
    it('returns a vehicle array', async () => {
      const response = await request(app)
        .get('/api/vehicles')
        .set(asUser(adminToken))

      expect(response.status).toBe(200)
      expect(Array.isArray(response.body)).toBe(true)
    })

    it('filters vehicles by status', async () => {
      const response = await request(app)
        .get('/api/vehicles')
        .set(asUser(adminToken))
        .query({ status: 'active' })

      expect(response.status).toBe(200)
      expect(Array.isArray(response.body)).toBe(true)
      expect(
        response.body.every(
          (vehicle: { status: string }) => vehicle.status === 'active',
        ),
      ).toBe(true)
    })

    it('rejects an invalid status filter', async () => {
      const response = await request(app)
        .get('/api/vehicles')
        .set(asUser(adminToken))
        .query({ status: 'invalid_status' })

      expect(response.status).toBe(400)
    })

    it('searches for a matching vehicle', async () => {
      const payload = vehiclePayload({
        make: 'DataPulseSearchTest',
      })

      const created = await createVehicle(adminToken, payload)
      expect(created.status).toBe(201)

      const response = await request(app)
        .get('/api/vehicles')
        .set(asUser(adminToken))
        .query({ search: 'DataPulseSearchTest' })

      expect(response.status).toBe(200)
      expect(
        response.body.some(
          (vehicle: { vin: string }) => vehicle.vin === payload.vin,
        ),
      ).toBe(true)
    })

    it('allows a viewer to read vehicles', async () => {
      const response = await request(app)
        .get('/api/vehicles')
        .set(asUser(viewerToken))

      expect(response.status).toBe(200)
    })
  })

  describe('POST /api/vehicles', () => {
    it('creates a vehicle with valid admin credentials', async () => {
      const payload = vehiclePayload()
      const response = await createVehicle(adminToken, payload)

      expect(response.status).toBe(201)
      expect(response.body).toMatchObject({
        vin: payload.vin,
        make: payload.make,
        model: payload.model,
        model_year: payload.model_year,
        status: payload.status,
      })
    })

    it('allows an operator to create a vehicle', async () => {
      const response = await createVehicle(operatorToken)

      expect(response.status).toBe(201)
    })

    it('allows a machine credential to create a vehicle', async () => {
      const response = await createVehicle(machineToken)

      expect(response.status).toBe(201)
    })

    it('rejects vehicle creation by a viewer', async () => {
      const response = await request(app)
        .post('/api/vehicles')
        .set(asUser(viewerToken))
        .send(vehiclePayload())

      expect(response.status).toBe(403)
    })

    it('rejects an invalid VIN', async () => {
      const response = await request(app)
        .post('/api/vehicles')
        .set(asUser(adminToken))
        .send(vehiclePayload({ vin: 'INVALID' }))

      expect(response.status).toBe(400)
      expect(response.body.error).toBe(
        'VIN must contain 17 valid characters',
      )
    })

    it('rejects missing required fields', async () => {
      const response = await request(app)
        .post('/api/vehicles')
        .set(asUser(adminToken))
        .send({
          vin: makeTestVin(),
          make: 'Honda',
        })

      expect(response.status).toBe(400)
      expect(response.body.error).toBe(
        'VIN, make, model and a valid model_year are required',
      )
    })

    it('rejects a model year below the supported range', async () => {
      const response = await request(app)
        .post('/api/vehicles')
        .set(asUser(adminToken))
        .send(vehiclePayload({ model_year: 1800 }))

      expect(response.status).toBe(400)
    })

    it('rejects a model year above the supported range', async () => {
      const response = await request(app)
        .post('/api/vehicles')
        .set(asUser(adminToken))
        .send(vehiclePayload({ model_year: 2200 }))

      expect(response.status).toBe(400)
    })

    it('rejects an invalid status', async () => {
      const response = await request(app)
        .post('/api/vehicles')
        .set(asUser(adminToken))
        .send(vehiclePayload({ status: 'unknown' }))

      expect(response.status).toBe(400)
    })

    it('rejects a duplicate VIN', async () => {
      const payload = vehiclePayload()
      const firstResponse = await createVehicle(adminToken, payload)

      expect(firstResponse.status).toBe(201)

      const duplicateResponse = await request(app)
        .post('/api/vehicles')
        .set(asUser(adminToken))
        .send(payload)

      expect(duplicateResponse.status).toBe(409)
    })
  })

  describe('GET /api/vehicles/:id', () => {
    it('retrieves a vehicle by ID', async () => {
      const payload = vehiclePayload()
      const created = await createVehicle(adminToken, payload)

      expect(created.status).toBe(201)
      const id = Number(created.body.id)

      const response = await request(app)
        .get(`/api/vehicles/${id}`)
        .set(asUser(adminToken))

      expect(response.status).toBe(200)
      expect({
        ...response.body,
        id: Number(response.body.id),
      }).toMatchObject({
        id,
        vin: payload.vin,
        make: payload.make,
        model: payload.model,
      })
    })

    it('rejects a non-numeric ID', async () => {
      const response = await request(app)
        .get('/api/vehicles/abc')
        .set(asUser(adminToken))

      expect(response.status).toBe(400)
    })

    it('returns 404 for a missing vehicle', async () => {
      const response = await request(app)
        .get('/api/vehicles/999999999')
        .set(asUser(adminToken))

      expect(response.status).toBe(404)
    })
  })

  describe('PATCH /api/vehicles/:id', () => {
    // Status changes go through the sales and service workflows (see
    // workflows.test.ts), so this edits descriptive fields.
    it('allows an operator to update a vehicle', async () => {
      const created = await createVehicle(adminToken)
      expect(created.status).toBe(201)
      const id = Number(created.body.id)

      const response = await request(app)
        .patch(`/api/vehicles/${id}`)
        .set(asUser(operatorToken))
        .send({
          model: 'IntegrationUpdated',
          model_year: 2025,
        })

      expect(response.status).toBe(200)
      expect({
        ...response.body,
        id: Number(response.body.id),
      }).toMatchObject({
        id,
        status: 'active',
        model: 'IntegrationUpdated',
        model_year: 2025,
      })
    })

    it('rejects vehicle updates by a viewer', async () => {
      const created = await createVehicle(adminToken)
      const id = Number(created.body.id)

      const response = await request(app)
        .patch(`/api/vehicles/${id}`)
        .set(asUser(viewerToken))
        .send({ status: 'sold' })

      expect(response.status).toBe(403)
    })

    it('rejects an unsupported update field', async () => {
      const created = await createVehicle(adminToken)
      const id = Number(created.body.id)

      const response = await request(app)
        .patch(`/api/vehicles/${id}`)
        .set(asUser(operatorToken))
        .send({ unsupported_field: 'value' })

      expect(response.status).toBe(400)
    })

    it('returns 404 when updating a missing vehicle', async () => {
      const response = await request(app)
        .patch('/api/vehicles/999999999')
        .set(asUser(operatorToken))
        .send({ status: 'sold' })

      expect(response.status).toBe(404)
    })

    it('rejects machine credentials for interactive updates', async () => {
      const created = await createVehicle(adminToken)
      const id = Number(created.body.id)

      const response = await request(app)
        .patch(`/api/vehicles/${id}`)
        .set(asUser(machineToken))
        .send({ status: 'sold' })

      expect(response.status).toBe(403)
    })
  })

  describe('DELETE /api/vehicles/:id', () => {
    it('allows an admin to delete a vehicle', async () => {
      const created = await createVehicle(adminToken)
      expect(created.status).toBe(201)
      const id = Number(created.body.id)

      const response = await request(app)
        .delete(`/api/vehicles/${id}`)
        .set(asUser(adminToken))

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('message')

      const missingResponse = await request(app)
        .get(`/api/vehicles/${id}`)
        .set(asUser(adminToken))

      expect(missingResponse.status).toBe(404)
      createdVehicleIds.delete(id)
    })

    it('rejects vehicle deletion by an operator', async () => {
      const created = await createVehicle(adminToken)
      const id = Number(created.body.id)

      const response = await request(app)
        .delete(`/api/vehicles/${id}`)
        .set(asUser(operatorToken))

      expect(response.status).toBe(403)
    })

    it('rejects vehicle deletion by a viewer', async () => {
      const created = await createVehicle(adminToken)
      const id = Number(created.body.id)

      const response = await request(app)
        .delete(`/api/vehicles/${id}`)
        .set(asUser(viewerToken))

      expect(response.status).toBe(403)
    })

    it('returns 404 when deleting a missing vehicle as admin', async () => {
      const response = await request(app)
        .delete('/api/vehicles/999999999')
        .set(asUser(adminToken))

      expect(response.status).toBe(404)
    })
  })

  describe('Analytics', () => {
    it('requires authentication for sales analytics', async () => {
      const response = await request(app).get('/api/analytics/sales')

      expect(response.status).toBe(401)
    })

    it('returns a database-backed sales analytics structure', async () => {
      const response = await request(app)
        .get('/api/analytics/sales')
        .set(asUser(adminToken))

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('totalSales')
      expect(response.body).toHaveProperty('totalRevenue')
      expect(response.body).toHaveProperty('daily')
      expect(Array.isArray(response.body.daily)).toBe(true)
      expect(response.body).toHaveProperty('hasData')
    })

    it('returns a database-backed service analytics structure', async () => {
      const response = await request(app)
        .get('/api/analytics/service')
        .set(asUser(adminToken))

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('total')
      expect(response.body).toHaveProperty('open')
      expect(response.body).toHaveProperty('in_progress')
      expect(response.body).toHaveProperty('completed')
      expect(response.body).toHaveProperty('cancelled')
      expect(response.body).toHaveProperty('hasData')
      expect(Array.isArray(response.body.recent)).toBe(true)
    })
  })

  describe('NiFi ingestion logging', () => {
    it('records successful machine ingestion without logging the token', async () => {
      const credentialName = `test-machine-${Date.now()}`
      const token = await createMachineCredential(credentialName, 'operator')
      machineCredentialNames.push(credentialName)

      const response = await request(app)
        .post('/api/vehicles')
        .set(asUser(token))
        .send(vehiclePayload())

      expect(response.status).toBe(201)
      trackCreatedVehicle(response.body.id)

      const logs = await pool.query(
        `SELECT outcome, http_status, message
         FROM nifi_request_logs
         WHERE flow_name = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [process.env.NIFI_FLOW_NAME || 'vehicle-ingestion'],
      )

      expect(logs.rows[0]).toMatchObject({
        outcome: 'success',
        http_status: 201,
      })
      expect(String(logs.rows[0].message || '')).not.toContain(token)
    })

    it('allows an admin to read NiFi request logs', async () => {
      const response = await request(app)
        .get('/api/operations/nifi-logs')
        .set(asUser(adminToken))

      expect(response.status).toBe(200)
      expect(Array.isArray(response.body)).toBe(true)
    })

    it('does not allow an operator to read admin-only NiFi logs', async () => {
      const response = await request(app)
        .get('/api/operations/nifi-logs')
        .set(asUser(operatorToken))

      expect(response.status).toBe(403)
    })
  })
})
