import { useCallback, useEffect, useState } from 'react'
import { SessionExpiredError, errorMessage } from '../lib/api.ts'

type Getter = <T>(path: string, signal?: AbortSignal) => Promise<T>

// Loads one API resource and reloads it whenever `path` or `refreshKey`
// changes (the dashboard passes its last-refresh time, so panels follow
// every change made elsewhere).
export function useResource<T>(apiGet: Getter, path: string | null, refreshKey: unknown) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!path) return

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      try {
        const result = await apiGet<T>(path, controller.signal)
        if (controller.signal.aborted) return
        setData(result)
        setError(null)
      } catch (caught) {
        if (controller.signal.aborted || caught instanceof SessionExpiredError) return
        setError(errorMessage(caught, 'Request failed.'))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 0)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [apiGet, path, refreshKey, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return { data, error, loading, reload }
}
