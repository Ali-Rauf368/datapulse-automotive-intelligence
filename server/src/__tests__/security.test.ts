import { afterAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { app } from '../index.ts'
import { pool } from '../db.ts'

const stamp = Date.now()

afterAll(async () => {
  await pool.end()
})

describe('Sign-in rate limiting', () => {
  const email = `dp-limit-${stamp}@example.test`
  const attempt = (address = email) =>
    request(app)
      .post('/api/auth/login')
      .send({ email: address, password: 'not-the-password' })

  it('blocks an account after ten failed attempts', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await attempt()).status).toBe(401)
    }

    const blocked = await attempt()

    expect(blocked.status).toBe(429)
    expect(blocked.body.error).toMatch(/Too many failed sign-in attempts/)
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0)
  })

  it('treats the email case-insensitively', async () => {
    expect((await attempt(email.toUpperCase())).status).toBe(429)
  })

  it('does not block other accounts', async () => {
    expect((await attempt(`dp-other-${stamp}@example.test`)).status).toBe(401)
  })
})

describe('Security headers', () => {
  it('sets protective headers on every response', async () => {
    const response = await request(app).get('/api/health')

    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['x-frame-options']).toBe('DENY')
    expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  })
})
