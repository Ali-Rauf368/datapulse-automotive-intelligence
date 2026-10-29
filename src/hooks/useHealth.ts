import { useCallback, useEffect, useState } from 'react'
import { API_URL, sendRequest } from '../lib/api.ts'
import { initialHealth } from '../constants.ts'
import type { CheckState, Health } from '../types.ts'

// Polls the public liveness and database readiness checks every 30 seconds
// while signed in, recording the API round-trip time.
export function useHealth(enabled: boolean) {
  const [health, setHealth] = useState<Health>(initialHealth)

  const checkHealth = useCallback(async () => {
    const started = performance.now()
    let api: CheckState = 'down'
    let database: CheckState = 'unknown'
    let latencyMs: number | null = null

    try {
      const response = await sendRequest(`${API_URL}/health`)
      if (response.ok) {
        api = 'ok'
        latencyMs = Math.round(performance.now() - started)
      }
    } catch {
      // The API is unreachable; the database state cannot be known.
    }

    if (api === 'ok') {
      try {
        const response = await sendRequest(`${API_URL}/health/db`)
        database = response.ok ? 'ok' : 'down'
      } catch {
        database = 'down'
      }
    }

    setHealth({ api, database, latencyMs, checkedAt: new Date().toLocaleTimeString() })
  }, [])

  useEffect(() => {
    if (!enabled) return

    const first = window.setTimeout(() => void checkHealth(), 0)
    const interval = window.setInterval(() => void checkHealth(), 30_000)

    return () => {
      window.clearTimeout(first)
      window.clearInterval(interval)
    }
  }, [checkHealth, enabled])

  const resetHealth = useCallback(() => setHealth(initialHealth), [])

  return { health, checkHealth, resetHealth }
}
