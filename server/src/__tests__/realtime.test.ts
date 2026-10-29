import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { app } from '../index.ts'
import { pool } from '../db.ts'
import { login } from '../auth/auth.ts'
import { connectedClients } from '../lib/events.ts'

const stamp = Date.now()
const email = `dp-rt-${stamp}@example.test`
const vehicleIds: number[] = []
let token = ''
let server: Server
let base = ''
let startedAt: Date

const vin = (n: number) => `RT${String(stamp % 1e12).padStart(12, '0')}${String(n).padStart(3, '0')}`
const auth = () => ({ Authorization: `Bearer ${token}` })

beforeAll(async () => {
  startedAt = (await pool.query('SELECT NOW() AS now')).rows[0].now
  await pool.query(
    "INSERT INTO app_users (email, password_hash, role, name) VALUES ($1, $2, 'admin', 'Realtime Admin')",
    [email, await bcrypt.hash('RealtimePassword-2026!', 4)],
  )
  token = (await login(email, 'RealtimePassword-2026!'))!.token
  server = app.listen(0)
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  try {
    await pool.query('DELETE FROM sales_events WHERE vehicle_id = ANY($1::bigint[])', [vehicleIds])
    await pool.query('DELETE FROM service_events WHERE vehicle_id = ANY($1::bigint[])', [vehicleIds])
    await pool.query('DELETE FROM vehicles WHERE id = ANY($1::bigint[])', [vehicleIds])
    await pool.query('DELETE FROM app_users WHERE email = $1', [email])
    await pool.query('DELETE FROM audit_log WHERE created_at >= $1', [startedAt])
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    await pool.end()
  }
})

// Opens the event stream and collects "change" events until `count` arrive.
async function listen(count: number) {
  const controller = new AbortController()
  const response = await fetch(`${base}/api/events?token=${token}`, { signal: controller.signal })
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  const changes: Array<{ action: string; summary: string; actor: string }> = []
  let buffer = ''

  const done = (async () => {
    while (changes.length < count) {
      const { value, done: ended } = await reader.read()
      if (ended) break
      buffer += decoder.decode(value, { stream: true })
      let split
      while ((split = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, split)
        buffer = buffer.slice(split + 2)
        if (block.startsWith('event: change')) {
          changes.push(JSON.parse(block.split('\ndata: ')[1]))
        }
      }
    }
    controller.abort()
    return changes
  })()

  return { status: response.status, type: response.headers.get('content-type'), done }
}

describe('Live updates (Server-Sent Events)', () => {
  it('rejects a stream without a valid token', async () => {
    const response = await fetch(`${base}/api/events`)
    expect(response.status).toBe(401)
  })

  it('pushes committed changes to connected dashboards', async () => {
    const stream = await listen(2)
    expect(stream.status).toBe(200)
    expect(stream.type).toContain('text/event-stream')
    await expect.poll(() => connectedClients()).toBeGreaterThan(0)

    const created = await request(app).post('/api/vehicles').set(auth())
      .send({ vin: vin(1), make: 'Polestar', model: '2', model_year: 2024 })
    vehicleIds.push(Number(created.body.id))
    await request(app).post('/api/sales').set(auth()).send({ vehicle_id: created.body.id, amount: 42000 })

    const changes = await stream.done
    expect(changes.map((c) => c.action)).toEqual(['vehicle.created', 'sale.recorded'])
    expect(changes[1]).toMatchObject({ actor: email })
    expect(changes[1].summary).toContain('Polestar 2')
  })

  it('does not announce rejected changes', async () => {
    const stream = await listen(1)
    await expect.poll(() => connectedClients()).toBeGreaterThan(0)

    // Selling the already-sold vehicle fails; then a valid change follows.
    await request(app).post('/api/sales').set(auth()).send({ vehicle_id: vehicleIds[0], amount: 1 })
    const other = await request(app).post('/api/vehicles').set(auth())
      .send({ vin: vin(2), make: 'Cupra', model: 'Born', model_year: 2023 })
    vehicleIds.push(Number(other.body.id))

    const [first] = await stream.done
    expect(first.action).toBe('vehicle.created')
  })
})

describe('Vehicle history', () => {
  it('tells the story of a vehicle, newest first, with the people involved', async () => {
    const created = await request(app).post('/api/vehicles').set(auth())
      .send({ vin: vin(3), make: 'Skoda', model: 'Kodiaq', model_year: 2022 })
    const id = Number(created.body.id)
    vehicleIds.push(id)
    const job = await request(app).post('/api/service').set(auth()).send({ vehicle_id: id, description: 'Pre-sale inspection' })
    await request(app).patch(`/api/service/${job.body.id}`).set(auth()).send({ status: 'completed' })
    await request(app).post('/api/sales').set(auth()).send({ vehicle_id: id, amount: 31900 })

    const history = await request(app).get(`/api/vehicles/${id}/history`).set(auth())

    expect(history.status).toBe(200)
    expect(history.body.events.map((e: { kind: string }) => e.kind)).toEqual(['sold', 'service', 'service', 'added'])
    expect(history.body.events.every((e: { actor: string }) => e.actor === email)).toBe(true)
  })

  it('reconstructs history recorded before the audit log', async () => {
    const row = await pool.query(
      "INSERT INTO vehicles (vin, make, model, model_year, status) VALUES ($1, 'Opel', 'Astra', 2021, 'sold') RETURNING id",
      [vin(4)],
    )
    const id = Number(row.rows[0].id)
    vehicleIds.push(id)
    await pool.query("INSERT INTO sales_events (vehicle_id, amount, source) VALUES ($1, 18500, 'demo-seed')", [id])

    const history = await request(app).get(`/api/vehicles/${id}/history`).set(auth())

    expect(history.body.events.map((e: { kind: string }) => e.kind)).toEqual(['sold', 'added'])
    expect(history.body.events[0].title).toBe('Sold for EUR 18500.00')
  })

  it('returns 404 for an unknown vehicle', async () => {
    expect((await request(app).get('/api/vehicles/999999999/history').set(auth())).status).toBe(404)
  })
})

describe('Request IDs', () => {
  it('returns a request ID on every response and reuses a valid incoming one', async () => {
    const generated = await request(app).get('/api/health')
    expect(generated.headers['x-request-id']).toMatch(/^[\w-]{8,64}$/)

    const forwarded = await request(app).get('/api/health').set('X-Request-Id', 'trace-abc-12345')
    expect(forwarded.headers['x-request-id']).toBe('trace-abc-12345')

    const unsafe = await request(app).get('/api/health').set('X-Request-Id', 'bad id; drop')
    expect(unsafe.headers['x-request-id']).not.toBe('bad id; drop')
  })
})
