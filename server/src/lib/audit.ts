import type { NextFunction, Request, Response } from 'express'
import type { PoolClient } from 'pg'
import { pool } from '../db.ts'
import { publish, type ChangeEvent } from './events.ts'

declare module 'express-serve-static-core' {
  interface Request {
    changes?: ChangeEvent[]
  }
}

type Entry = {
  action: string
  entity: 'vehicle' | 'sale' | 'service_job' | 'user'
  entityId?: string | number | null
  summary: string
}

// Records an action. Pass the transaction's client so the entry commits or
// rolls back together with the change it describes. The matching live
// notification is queued and only sent once the request has succeeded.
export async function audit(
  req: Request,
  entry: Entry,
  client: Pick<PoolClient, 'query'> = pool,
): Promise<void> {
  await client.query(
    `INSERT INTO audit_log
       (actor_id, actor_email, actor_kind, action, entity, entity_id, summary)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      req.auth?.kind === 'user' ? Number(req.auth.id) : null,
      req.auth?.email ?? null,
      req.auth?.kind ?? 'system',
      entry.action,
      entry.entity,
      entry.entityId === undefined || entry.entityId === null ? null : Number(entry.entityId),
      entry.summary,
    ],
  )

  req.changes = [
    ...(req.changes ?? []),
    {
      type: entry.entity,
      action: entry.action,
      summary: entry.summary,
      actor: req.auth?.kind === 'machine' ? 'NiFi' : req.auth?.email ?? null,
      at: new Date().toISOString(),
    },
  ]
}

// Publishes queued change notifications after a successful response, i.e.
// after the transaction that produced them has committed.
export function publishChanges(req: Request, res: Response, next: NextFunction): void {
  res.once('finish', () => {
    if (res.statusCode < 400) for (const change of req.changes ?? []) publish(change)
  })
  next()
}
