import type { Request } from 'express'
import type { PoolClient } from 'pg'
import { pool } from '../db.ts'

type Entry = {
  action: string
  entity: 'vehicle' | 'sale' | 'service_job' | 'user'
  entityId?: string | number | null
  summary: string
}

// Records an action. Pass the transaction's client so the entry commits or
// rolls back together with the change it describes.
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
}
