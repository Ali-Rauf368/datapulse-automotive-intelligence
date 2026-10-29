import { useCallback, useEffect, useState } from 'react'
import { API_URL, SessionExpiredError, errorMessage, readJson, sendRequest } from '../lib/api.ts'
import { emptySales, emptyService, emptyStats, noErrors } from '../constants.ts'
import type {
  ManagedSale,
  NifiLog,
  PanelErrors,
  SalesAnalytics,
  ServiceAnalytics,
  ServiceJob,
  Vehicle,
  VehicleStats,
} from '../types.ts'

export type ApiFetch = (path: string, options?: RequestInit) => Promise<Response>

type Options = {
  token: string | null
  isAdmin: boolean
  search: string
  statusFilter: string
  onSessionExpired: (message: string) => void
}

// Loads every dashboard area. Each area succeeds or fails independently, so
// one failing request shows an error in its own panel instead of blanking
// the whole dashboard.
export function useDashboardData({ token, isAdmin, search, statusFilter, onSessionExpired }: Options) {
  const [allVehicles, setAllVehicles] = useState<Vehicle[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [stats, setStats] = useState<VehicleStats>(emptyStats)
  const [sales, setSales] = useState<SalesAnalytics>(emptySales)
  const [service, setService] = useState<ServiceAnalytics>(emptyService)
  const [managedSales, setManagedSales] = useState<ManagedSale[]>([])
  const [serviceJobs, setServiceJobs] = useState<ServiceJob[]>([])
  const [nifiLogs, setNifiLogs] = useState<NifiLog[] | null>(null)
  const [errors, setErrors] = useState<PanelErrors>(noErrors)
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const apiFetch: ApiFetch = useCallback(
    async (path, options = {}) => {
      if (!token) throw new Error('Please sign in to continue.')

      const headers = new Headers(options.headers)
      headers.set('Authorization', `Bearer ${token}`)
      if (options.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json')
      }

      const response = await sendRequest(`${API_URL}${path}`, { ...options, headers })

      if (response.status === 401) {
        const message = 'Your session has expired. Please sign in again.'
        onSessionExpired(message)
        throw new SessionExpiredError(message)
      }

      return response
    },
    [token, onSessionExpired],
  )

  const apiGet = useCallback(
    async <T,>(path: string, signal?: AbortSignal): Promise<T> =>
      readJson<T>(await apiFetch(path, { signal })),
    [apiFetch],
  )

  const apiList = useCallback(
    async <T,>(path: string, signal?: AbortSignal): Promise<T[]> => {
      const data = await apiGet<unknown>(path, signal)
      if (!Array.isArray(data)) throw new Error('The API returned an unexpected response.')
      return data as T[]
    },
    [apiGet],
  )

  const loadData = useCallback(
    async (signal?: AbortSignal) => {
      if (!token) return

      setLoading(true)

      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const query = params.toString()

      const [all, filtered, statsResult, salesResult, salesList, serviceResult, jobs, nifi] =
        await Promise.allSettled([
          apiList<Vehicle>('/vehicles', signal),
          query ? apiList<Vehicle>(`/vehicles?${query}`, signal) : Promise.resolve(null),
          apiGet<VehicleStats>('/vehicles/stats', signal),
          apiGet<SalesAnalytics>('/analytics/sales', signal),
          apiList<ManagedSale>('/sales', signal),
          apiGet<ServiceAnalytics>('/analytics/service', signal),
          apiList<ServiceJob>('/service', signal),
          isAdmin ? apiList<NifiLog>('/operations/nifi-logs', signal) : Promise.resolve(null),
        ])

      if (signal?.aborted) return

      const settled: PromiseSettledResult<unknown>[] = [
        all, filtered, statsResult, salesResult, salesList, serviceResult, jobs, nifi,
      ]

      if (settled.some((r) => r.status === 'rejected' && r.reason instanceof SessionExpiredError)) {
        return
      }

      const failure = (...results: PromiseSettledResult<unknown>[]) => {
        const rejected = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
        return rejected ? errorMessage(rejected.reason, 'Request failed.') : null
      }

      if (all.status === 'fulfilled' && filtered.status === 'fulfilled' && statsResult.status === 'fulfilled') {
        setAllVehicles(all.value)
        setVehicles(filtered.value ?? all.value)
        setStats({ ...emptyStats, ...statsResult.value })
      }

      if (salesResult.status === 'fulfilled' && salesList.status === 'fulfilled') {
        setSales({ ...emptySales, ...salesResult.value })
        setManagedSales(salesList.value)
      }

      if (serviceResult.status === 'fulfilled' && jobs.status === 'fulfilled') {
        setService({ ...emptyService, ...serviceResult.value })
        setServiceJobs(jobs.value)
      }

      if (nifi.status === 'fulfilled') setNifiLogs(nifi.value)

      setErrors({
        inventory: failure(all, filtered, statsResult),
        sales: failure(salesResult, salesList),
        service: failure(serviceResult, jobs),
        nifi: failure(nifi),
      })

      if (settled.some((r) => r.status === 'fulfilled')) {
        setLastUpdated(new Date().toLocaleTimeString())
      }

      setLoading(false)
    },
    [apiGet, apiList, isAdmin, search, statusFilter, token],
  )

  // Debounces search typing; other changes load immediately.
  useEffect(() => {
    if (!token) return

    const controller = new AbortController()
    const timer = window.setTimeout(() => void loadData(controller.signal), search ? 250 : 0)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [loadData, search, token])

  return {
    allVehicles,
    vehicles,
    stats,
    sales,
    service,
    managedSales,
    serviceJobs,
    nifiLogs,
    errors,
    loading,
    lastUpdated,
    apiFetch,
    apiGet,
    loadData,
  }
}
