import type { Response } from 'express'
import type { PoolClient } from 'pg'
import { pool } from '../db.ts'

export function isValidId(value: string): boolean {
  return (
    /^\d+$/.test(value) &&
    Number.isSafeInteger(Number(value)) &&
    Number(value) > 0
  )
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  )
}

export function logError(message: string, error: unknown): void {
  console.error(
    message,
    error instanceof Error ? error.message : 'Unknown error',
  )
}

// Thrown inside withTransaction to roll back and answer with a client error.
export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// Answers an HttpError with its own status; anything else is logged and
// reported as a generic 500 so internals never reach the client.
export function sendError(res: Response, error: unknown, failure: string): void {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message })
    return
  }

  const requestId = res.req?.id
  logError(`${failure} [request ${requestId ?? 'unknown'}]:`, error)
  res.status(500).json({ error: failure, requestId })
}

// Runs `work` in a transaction on a dedicated client: commits on success,
// rolls back on any error (including HttpError) and always releases.
export async function withTransaction<T>(
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}
