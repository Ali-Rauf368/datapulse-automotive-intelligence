import { afterAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../index.ts'
import { pool } from '../db.ts'

const stamp = Date.now()
const emailFor = (label: string) => `dp-${label}-${stamp}@example.test`
const registeredEmails = new Set<string>()
const password = 'secret1'

async function signup(body: Record<string, unknown>) {
  const response = await request(app).post('/api/auth/register').send(body)

  if (response.status === 201 && typeof body.email === 'string') {
    registeredEmails.add(body.email.trim().toLowerCase())
  }

  return response
}

function asUser(token: string) {
  return { Authorization: `Bearer ${token}` }
}

afterAll(async () => {
  try {
    await pool.query(
      'DELETE FROM app_users WHERE lower(email) = ANY($1::text[])',
      [[...registeredEmails]],
    )
  } finally {
    await pool.end()
  }
})

describe('Signup', () => {
  it('creates a viewer account and returns a session', async () => {
    const email = emailFor('new')
    const response = await signup({ name: '  Jordan Demo  ', email, password })

    expect(response.status).toBe(201)
    expect(response.body.token).toBeTruthy()
    expect(response.body.user).toMatchObject({
      email,
      name: 'Jordan Demo',
      role: 'viewer',
    })
  })

  it('ignores a role supplied by the client', async () => {
    const email = emailFor('escalate')
    const response = await signup({
      name: 'Escalation Attempt',
      email,
      password,
      role: 'admin',
    })

    expect(response.status).toBe(201)
    expect(response.body.user.role).toBe('viewer')

    const stored = await pool.query(
      'SELECT role FROM app_users WHERE email = $1',
      [email],
    )
    expect(stored.rows[0].role).toBe('viewer')
  })

  it('stores a bcrypt hash, never the password', async () => {
    const email = emailFor('hash')
    await signup({ name: 'Hash Check', email, password })

    const stored = await pool.query(
      'SELECT password_hash FROM app_users WHERE email = $1',
      [email],
    )
    expect(stored.rows[0].password_hash).toMatch(/^\$2[aby]\$\d{2}\$/)
    expect(stored.rows[0].password_hash).not.toContain(password)
  })

  it('rejects a duplicate email regardless of case', async () => {
    const email = emailFor('dupe')
    expect((await signup({ name: 'First', email, password })).status).toBe(201)

    const response = await signup({
      name: 'Second',
      email: email.toUpperCase(),
      password,
    })

    expect(response.status).toBe(409)
    expect(response.body.error).toBe('An account with this email already exists')
  })

  it.each([
    ['a blank name', { name: '   ', email: emailFor('blank'), password }],
    ['an invalid email', { name: 'A', email: 'not-an-email', password }],
    ['a 5-character password', { name: 'A', email: emailFor('short'), password: '12345' }],
    ['a password over 72 bytes', { name: 'A', email: emailFor('long'), password: 'x'.repeat(73) }],
    ['missing fields', {}],
  ])('rejects %s', async (_label, body) => {
    const response = await signup(body)

    expect(response.status).toBe(400)
    expect(response.body.error).toBeTruthy()
  })

  it('lets the new account sign in, ignoring email case and spaces', async () => {
    const email = emailFor('login')
    await signup({ name: 'Login Check', email, password })

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: `  ${email.toUpperCase()} `, password })

    expect(response.status).toBe(200)
    expect(response.body.user).toMatchObject({
      email,
      name: 'Login Check',
      role: 'viewer',
    })
  })
})

describe('Session', () => {
  it('returns the signed-in user from /api/auth/me', async () => {
    const email = emailFor('me')
    const created = await signup({ name: 'Profile Check', email, password })

    const response = await request(app)
      .get('/api/auth/me')
      .set(asUser(created.body.token))

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      email,
      name: 'Profile Check',
      role: 'viewer',
    })
  })

  it('requires a token for /api/auth/me', async () => {
    const response = await request(app).get('/api/auth/me')

    expect(response.status).toBe(401)
  })

  it('rejects a token signed with a different secret', async () => {
    const forged = jwt.sign(
      { email: 'x@example.test', role: 'admin', kind: 'user' },
      'a-different-secret-that-is-at-least-32-chars',
      { subject: '1', issuer: 'datapulse-api', algorithm: 'HS256' },
    )

    const response = await request(app)
      .get('/api/vehicles')
      .set(asUser(forged))

    expect(response.status).toBe(401)
  })
})

describe('New accounts are read-only', () => {
  let viewerToken = ''

  it('can read inventory, analytics, sales and service data', async () => {
    const created = await signup({
      name: 'Read Only',
      email: emailFor('viewer'),
      password,
    })
    viewerToken = created.body.token

    for (const path of [
      '/api/vehicles',
      '/api/vehicles/stats',
      '/api/analytics/sales',
      '/api/analytics/service',
      '/api/sales',
      '/api/service',
    ]) {
      const response = await request(app).get(path).set(asUser(viewerToken))
      expect(response.status, path).toBe(200)
    }
  })

  it.each([
    ['POST', '/api/vehicles', { vin: 'WVWZZZ1KZAW000001', make: 'VW', model: 'Golf', model_year: 2022 }],
    ['PATCH', '/api/vehicles/1', { model: 'Changed' }],
    ['DELETE', '/api/vehicles/1', undefined],
    ['POST', '/api/sales', { vehicle_id: 1, amount: 100 }],
    ['POST', '/api/service', { vehicle_id: 1, description: 'Oil change' }],
    ['PATCH', '/api/service/1', { status: 'completed' }],
    ['GET', '/api/operations/nifi-logs', undefined],
  ])('is forbidden from %s %s', async (method, path, body) => {
    let pending = request(app)[method.toLowerCase() as 'get' | 'post' | 'patch' | 'delete'](path)
      .set(asUser(viewerToken))

    if (body) pending = pending.send(body)

    const response = await pending
    expect(response.status).toBe(403)
  })
})
