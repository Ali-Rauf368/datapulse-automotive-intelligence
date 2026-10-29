import type { Response } from 'express'

export type ChangeEvent = {
  type: 'vehicle' | 'sale' | 'service_job' | 'user'
  action: string
  summary: string
  actor: string | null
  at: string
}

// In-process fan-out of change notifications to connected dashboards over
// Server-Sent Events. One API instance is assumed; several would need a
// shared channel such as PostgreSQL LISTEN/NOTIFY or Redis.
const clients = new Set<Response>()

export function subscribe(res: Response): () => void {
  clients.add(res)
  return () => clients.delete(res)
}

export function publish(event: ChangeEvent): void {
  const payload = `event: change\ndata: ${JSON.stringify(event)}\n\n`
  for (const client of clients) client.write(payload)
}

export function connectedClients(): number {
  return clients.size
}
