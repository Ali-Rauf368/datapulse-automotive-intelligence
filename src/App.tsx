import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  Activity,
  CarFront,
  ChartNoAxesCombined,
  CircleCheck,
  Clock,
  Database,
  Euro,
  Eye,
  EyeOff,
  Info,
  LayoutDashboard,
  LogOut,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Users,
  Workflow,
  Wrench,
  X,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

// Production builds without VITE_API_URL call the API on the same origin
// (the single-service Render deployment).
const API_URL = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? 'http://localhost:3000/api' : '/api')
).replace(/\/$/, '')
const TOKEN_KEY = 'datapulse_token'
const USER_KEY = 'datapulse_user'
// Name given to accounts created before signup collected one (migration 002).
const DEFAULT_ACCOUNT_NAME = 'DataPulse User'

type Role = 'admin' | 'operator' | 'viewer'
type VehicleStatus = 'active' | 'sold' | 'in_service'
type ServiceStatus = 'open' | 'in_progress' | 'completed' | 'cancelled'

// PostgreSQL BIGINT ids arrive as strings; compare them with sameId().
type Id = string | number

type User = {
  id: string
  email: string
  name?: string
  role: Role
}

type Vehicle = {
  id: Id
  vin: string
  make: string
  model: string
  model_year: number
  status: VehicleStatus
  created_at: string
}

type VehicleStats = {
  total: number
  active: number
  sold: number
  in_service: number
  sold_without_sale: number
  in_service_without_open_job: number
}

type VehicleForm = {
  vin: string
  make: string
  model: string
  model_year: string
}

type LoginResponse = {
  token: string
  user: User
}

type SalesAnalytics = {
  totalSales: number
  totalRevenue: number
  averageSale: number
  hasData: boolean
  daily: Array<{
    date: string
    sales: number
    revenue: number
  }>
}

type ServiceAnalytics = {
  total: number
  open: number
  in_progress: number
  completed: number
  cancelled: number
  hasData: boolean
}

type VehicleRef = {
  vehicle_id: Id | null
  vin?: string | null
  make?: string | null
  model?: string | null
}

type ManagedSale = VehicleRef & {
  id: Id
  amount: string | number
  sold_at: string
}

type ServiceJob = VehicleRef & {
  id: Id
  status: ServiceStatus
  description: string
  opened_at: string
  completed_at: string | null
}

type NifiLog = {
  id: Id
  flow_name: string
  outcome: 'success' | 'failure'
  http_status: number | null
  message: string | null
  created_at: string
}

type CheckState = 'checking' | 'ok' | 'down' | 'unknown'

type Health = {
  api: CheckState
  database: CheckState
  latencyMs: number | null
  checkedAt: string | null
}

type PanelErrors = {
  inventory: string | null
  sales: string | null
  service: string | null
  nifi: string | null
}

type Notice = {
  kind: 'success' | 'error'
  text: string
}

class SessionExpiredError extends Error {}

const emptyStats: VehicleStats = {
  total: 0,
  active: 0,
  sold: 0,
  in_service: 0,
  sold_without_sale: 0,
  in_service_without_open_job: 0,
}

const emptySales: SalesAnalytics = {
  totalSales: 0,
  totalRevenue: 0,
  averageSale: 0,
  hasData: false,
  daily: [],
}

const emptyService: ServiceAnalytics = {
  total: 0,
  open: 0,
  in_progress: 0,
  completed: 0,
  cancelled: 0,
  hasData: false,
}

const noErrors: PanelErrors = {
  inventory: null,
  sales: null,
  service: null,
  nifi: null,
}

const initialHealth: Health = {
  api: 'checking',
  database: 'checking',
  latencyMs: null,
  checkedAt: null,
}

const initialVehicleForm: VehicleForm = {
  vin: '',
  make: '',
  model: '',
  model_year: String(new Date().getFullYear()),
}

const navigation = [
  { label: 'Overview', icon: LayoutDashboard, href: '#overview' },
  { label: 'Inventory', icon: CarFront, href: '#inventory' },
  { label: 'Sales & service', icon: Wrench, href: '#sales-service' },
  { label: 'Analytics', icon: ChartNoAxesCombined, href: '#analytics' },
  { label: 'System status', icon: Activity, href: '#system-status' },
  { label: 'Users & roles', icon: Users, href: '#users-roles' },
  { label: 'Settings', icon: Settings, href: '#settings' },
]

const statusStyles: Record<VehicleStatus, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  sold: 'bg-slate-100 text-slate-700',
  in_service: 'bg-amber-50 text-amber-700',
}

const statusLabels: Record<VehicleStatus, string> = {
  active: 'Active',
  sold: 'Sold',
  in_service: 'In service',
}

const serviceStatusLabels: Record<ServiceStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const serviceStatusStyles: Record<ServiceStatus, string> = {
  open: 'bg-amber-50 text-amber-700',
  in_progress: 'bg-cyan-50 text-cyan-700',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-slate-100 text-slate-600',
}

// Moves allowed from a job that is still open; completed and cancelled jobs
// are final (the API enforces the same rule).
const nextServiceStatuses: Record<'open' | 'in_progress', ServiceStatus[]> = {
  open: ['open', 'in_progress', 'completed', 'cancelled'],
  in_progress: ['in_progress', 'open', 'completed', 'cancelled'],
}

const serviceSuggestions = [
  'Annual inspection',
  'Oil and filter change',
  'Brake inspection',
  'Tyre change: summer to winter',
]

const labelClass = 'mb-1.5 block text-sm font-medium text-slate-700'
const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50'
const cardClass = 'rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'
const primaryButtonClass =
  'inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60'

function sameId(a: Id | null | undefined, b: Id | null | undefined): boolean {
  return a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b)
}

function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return null

    const user = JSON.parse(raw) as User

    if (
      typeof user.id !== 'string' ||
      typeof user.email !== 'string' ||
      !['admin', 'operator', 'viewer'].includes(user.role)
    ) {
      return null
    }

    return user
  } catch {
    return null
  }
}

const networkErrorMessage = `Cannot reach the DataPulse API at ${API_URL}. Check that the backend is running.`

// fetch() rejects with a browser-specific TypeError when the API is
// unreachable; turn that into a message people can act on.
async function sendRequest(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new Error(networkErrorMessage, { cause: error })
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text()
  let data: unknown = null

  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : null
    throw new Error(message || `The API responded with HTTP ${response.status}.`)
  }

  if (data === null) {
    throw new Error('The API returned an unexpected response.')
  }

  return data as T
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatCompactMoney(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'EUR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount)
}

function formatDate(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleDateString()
}

function formatDateTime(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function describeVehicle(item: VehicleRef): string {
  if (item.make || item.model) return `${item.make ?? ''} ${item.model ?? ''}`.trim()
  return item.vehicle_id === null ? 'Deleted vehicle' : `Vehicle #${item.vehicle_id}`
}

function saleOptionLabel(vehicle: Vehicle): string {
  const base = `${vehicle.make} ${vehicle.model} · ${vehicle.vin}`

  if (vehicle.status === 'sold') return `${base} (marked sold, no sale on record)`
  if (vehicle.status === 'in_service') return `${base} (in service, no open job)`
  return base
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function NoticeMessage({ notice }: { notice: Notice | null }) {
  if (!notice) return null

  return notice.kind === 'success' ? (
    <p
      role="status"
      className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"
    >
      {notice.text}
    </p>
  ) : (
    <p
      role="alert"
      className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
    >
      {notice.text}
    </p>
  )
}

function PanelError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
    >
      <span className="flex items-start gap-2">
        <TriangleAlert size={16} className="mt-0.5 shrink-0" />
        {message}
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md border border-rose-200 bg-white px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
      >
        Retry
      </button>
    </div>
  )
}

function EmptyState({
  icon,
  title,
  children,
}: {
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
      <div className="mb-3 text-slate-400">{icon}</div>
      <p className="font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">{children}</p>
    </div>
  )
}

function CheckIndicator({ state }: { state: CheckState }) {
  if (state === 'ok') {
    return <CircleCheck size={18} className="shrink-0 text-emerald-600" />
  }
  if (state === 'down') {
    return <TriangleAlert size={18} className="shrink-0 text-rose-600" />
  }
  if (state === 'checking') {
    return <RefreshCw size={18} className="shrink-0 animate-spin text-slate-400" />
  }
  return <Info size={18} className="shrink-0 text-slate-400" />
}

function App() {
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem(TOKEN_KEY),
  )
  const [user, setUser] = useState<User | null>(getStoredUser)
  const [loginMode, setLoginMode] = useState<'login' | 'signup'>('login')
  const [signupName, setSignupName] = useState('')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginLoading, setLoginLoading] = useState(false)
  const [authNotice, setAuthNotice] = useState<string | null>(null)

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
  const [health, setHealth] = useState<Health>(initialHealth)
  const [activeSection, setActiveSection] = useState('#overview')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const [showVehicleForm, setShowVehicleForm] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null)
  const [vehicleForm, setVehicleForm] =
    useState<VehicleForm>(initialVehicleForm)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<Id | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [saleVehicleId, setSaleVehicleId] = useState('')
  const [saleAmount, setSaleAmount] = useState('')
  const [saleSubmitting, setSaleSubmitting] = useState(false)
  const [saleNotice, setSaleNotice] = useState<Notice | null>(null)
  const [serviceVehicleId, setServiceVehicleId] = useState('')
  const [serviceDescription, setServiceDescription] = useState('')
  const [serviceSubmitting, setServiceSubmitting] = useState(false)
  const [serviceNotice, setServiceNotice] = useState<Notice | null>(null)
  const [updatingJobId, setUpdatingJobId] = useState<Id | null>(null)
  const [jobsNotice, setJobsNotice] = useState<Notice | null>(null)

  const isAdmin = user?.role === 'admin'
  const canEdit = user?.role === 'admin' || user?.role === 'operator'
  const signedIn = Boolean(token && user)

  const signOut = useCallback((notice: string | null = null) => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setToken(null)
    setUser(null)
    setLoginMode('login')
    setLoginPassword('')
    setShowPassword(false)
    setLoginError(null)
    setAuthNotice(notice)
    setAllVehicles([])
    setVehicles([])
    setStats(emptyStats)
    setSales(emptySales)
    setService(emptyService)
    setManagedSales([])
    setServiceJobs([])
    setNifiLogs(null)
    setErrors(noErrors)
    setLoading(false)
    setLastUpdated(null)
    setHealth(initialHealth)
    setShowVehicleForm(false)
    setEditingVehicle(null)
    setFormSuccess(null)
    setActionError(null)
    setSaleNotice(null)
    setServiceNotice(null)
    setJobsNotice(null)
  }, [])

  const apiFetch = useCallback(
    async (path: string, options: RequestInit = {}): Promise<Response> => {
      if (!token) throw new Error('Please sign in to continue.')

      const headers = new Headers(options.headers)
      headers.set('Authorization', `Bearer ${token}`)

      if (options.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json')
      }

      const response = await sendRequest(`${API_URL}${path}`, {
        ...options,
        headers,
      })

      if (response.status === 401) {
        const message = 'Your session has expired. Please sign in again.'
        signOut(message)
        throw new SessionExpiredError(message)
      }

      return response
    },
    [token, signOut],
  )

  const apiGet = useCallback(
    async <T,>(path: string, signal?: AbortSignal): Promise<T> =>
      readJson<T>(await apiFetch(path, { signal })),
    [apiFetch],
  )

  const apiList = useCallback(
    async <T,>(path: string, signal?: AbortSignal): Promise<T[]> => {
      const data = await apiGet<unknown>(path, signal)

      if (!Array.isArray(data)) {
        throw new Error('The API returned an unexpected response.')
      }

      return data as T[]
    },
    [apiGet],
  )

  // Each dashboard area loads independently, so one failing request shows an
  // error in its own panel instead of blanking the whole dashboard.
  const loadData = useCallback(
    async (signal?: AbortSignal) => {
      if (!token) return

      setLoading(true)

      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const query = params.toString()

      const [
        allResult,
        filteredResult,
        statsResult,
        salesResult,
        salesListResult,
        serviceResult,
        jobsResult,
        nifiResult,
      ] = await Promise.allSettled([
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
        allResult,
        filteredResult,
        statsResult,
        salesResult,
        salesListResult,
        serviceResult,
        jobsResult,
        nifiResult,
      ]

      if (
        settled.some(
          (result) => result.status === 'rejected' && result.reason instanceof SessionExpiredError,
        )
      ) {
        return
      }

      const failure = (...results: PromiseSettledResult<unknown>[]) => {
        const rejected = results.find(
          (result): result is PromiseRejectedResult => result.status === 'rejected',
        )
        return rejected ? errorMessage(rejected.reason, 'Request failed.') : null
      }

      if (
        allResult.status === 'fulfilled' &&
        filteredResult.status === 'fulfilled' &&
        statsResult.status === 'fulfilled'
      ) {
        setAllVehicles(allResult.value)
        setVehicles(filteredResult.value ?? allResult.value)
        setStats({ ...emptyStats, ...statsResult.value })
      }

      if (salesResult.status === 'fulfilled' && salesListResult.status === 'fulfilled') {
        setSales({ ...emptySales, ...salesResult.value })
        setManagedSales(salesListResult.value)
      }

      if (serviceResult.status === 'fulfilled' && jobsResult.status === 'fulfilled') {
        setService({ ...emptyService, ...serviceResult.value })
        setServiceJobs(jobsResult.value)
      }

      if (nifiResult.status === 'fulfilled') setNifiLogs(nifiResult.value)

      setErrors({
        inventory: failure(allResult, filteredResult, statsResult),
        sales: failure(salesResult, salesListResult),
        service: failure(serviceResult, jobsResult),
        nifi: failure(nifiResult),
      })

      if (settled.some((result) => result.status === 'fulfilled')) {
        setLastUpdated(new Date().toLocaleTimeString())
      }

      setLoading(false)
    },
    [apiGet, apiList, isAdmin, search, statusFilter, token],
  )

  // Public liveness and database readiness checks, with API round-trip time.
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

    setHealth({
      api,
      database,
      latencyMs,
      checkedAt: new Date().toLocaleTimeString(),
    })
  }, [])

  function refreshAll() {
    void loadData()
    void checkHealth()
  }

  useEffect(() => {
    if (!token) return

    const controller = new AbortController()
    const timer = window.setTimeout(
      () => void loadData(controller.signal),
      search ? 250 : 0,
    )

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [loadData, search, token])

  // Confirms a stored session and picks up name or role changes.
  useEffect(() => {
    if (!token) return

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const profile = await apiGet<User>('/auth/me', controller.signal)

        if (controller.signal.aborted) return

        setUser(profile)
        localStorage.setItem(USER_KEY, JSON.stringify(profile))
      } catch {
        // An expired session signs out inside apiFetch; other failures are
        // reported by the dashboard panels.
      }
    }, 0)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [apiGet, token])

  useEffect(() => {
    if (!token) return

    const first = window.setTimeout(() => void checkHealth(), 0)
    const interval = window.setInterval(() => void checkHealth(), 30_000)

    return () => {
      window.clearTimeout(first)
      window.clearInterval(interval)
    }
  }, [checkHealth, token])

  // Highlights the navigation entry for the section in view.
  useEffect(() => {
    if (!signedIn) return

    const sections = navigation
      .map(({ href }) => document.querySelector(href))
      .filter((section): section is Element => section !== null)

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]

        if (visible) setActiveSection(`#${visible.target.id}`)
      },
      { rootMargin: '-15% 0px -70% 0px' },
    )

    sections.forEach((section) => observer.observe(section))

    return () => observer.disconnect()
  }, [signedIn])

  const soldVehicleIds = useMemo(
    () => new Set(managedSales.map((sale) => String(sale.vehicle_id))),
    [managedSales],
  )

  const openJobVehicleIds = useMemo(
    () =>
      new Set(
        serviceJobs
          .filter((job) => job.status === 'open' || job.status === 'in_progress')
          .map((job) => String(job.vehicle_id)),
      ),
    [serviceJobs],
  )

  // A vehicle can be sold once: no recorded sale and no open service job.
  const saleCandidates = useMemo(
    () =>
      allVehicles.filter(
        (vehicle) =>
          !soldVehicleIds.has(String(vehicle.id)) &&
          !openJobVehicleIds.has(String(vehicle.id)),
      ),
    [allVehicles, openJobVehicleIds, soldVehicleIds],
  )

  const serviceCandidates = useMemo(
    () => allVehicles.filter((vehicle) => vehicle.status !== 'sold'),
    [allVehicles],
  )

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoginError(null)
    setAuthNotice(null)
    setLoginLoading(true)

    try {
      const response = await sendRequest(
        `${API_URL}/auth/${loginMode === 'signup' ? 'register' : 'login'}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(loginMode === 'signup' ? { name: signupName.trim() } : {}),
            email: loginEmail.trim(),
            password: loginPassword,
          }),
        },
      )

      const result = await readJson<LoginResponse>(response)

      if (
        !result.token ||
        !result.user ||
        typeof result.user.id !== 'string' ||
        typeof result.user.email !== 'string' ||
        !['admin', 'operator', 'viewer'].includes(result.user.role)
      ) {
        throw new Error('The login API returned an invalid response.')
      }

      localStorage.setItem(TOKEN_KEY, result.token)
      localStorage.setItem(USER_KEY, JSON.stringify(result.user))
      setToken(result.token)
      setUser(result.user)
      setLoginPassword('')
      setSignupName('')
      setShowPassword(false)
      setLoginMode('login')
    } catch (error) {
      setLoginError(errorMessage(error, 'Could not sign in.'))
    } finally {
      setLoginLoading(false)
    }
  }

  function switchLoginMode() {
    setLoginMode(loginMode === 'signup' ? 'login' : 'signup')
    setLoginError(null)
    setAuthNotice(null)
  }

  function updateVehicleForm<K extends keyof VehicleForm>(
    field: K,
    value: VehicleForm[K],
  ) {
    setVehicleForm((current) => ({ ...current, [field]: value }))
    setFormError(null)
    setFormSuccess(null)
  }

  function openCreateForm() {
    setEditingVehicle(null)
    setVehicleForm(initialVehicleForm)
    setFormError(null)
    setFormSuccess(null)
    setActionError(null)
    setShowVehicleForm(true)
  }

  function openEditForm(vehicle: Vehicle) {
    if (!canEdit) return

    setEditingVehicle(vehicle)
    setVehicleForm({
      vin: vehicle.vin,
      make: vehicle.make,
      model: vehicle.model,
      model_year: String(vehicle.model_year),
    })
    setFormError(null)
    setFormSuccess(null)
    setActionError(null)
    setShowVehicleForm(true)
  }

  function closeForm() {
    setShowVehicleForm(false)
    setEditingVehicle(null)
    setVehicleForm(initialVehicleForm)
    setFormError(null)
  }

  async function handleSaveVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setFormSuccess(null)

    if (!canEdit) {
      setFormError('Your role does not permit vehicle changes.')
      return
    }

    const original = editingVehicle
    const vin = vehicleForm.vin.trim().toUpperCase()
    const make = vehicleForm.make.trim()
    const model = vehicleForm.model.trim()
    const modelYear = Number(vehicleForm.model_year)
    // Only changed fields are sent, so records whose stored VIN predates
    // validation can still be edited.
    const changes: Record<string, string | number> = {}

    if (!original || vin !== original.vin) {
      if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
        setFormError(
          'Enter a valid 17-character VIN. Letters I, O and Q are not allowed.',
        )
        return
      }
      changes.vin = vin
    }

    if (!make || make.length > 100 || !model || model.length > 100) {
      setFormError(
        'Make and model must each contain between 1 and 100 characters.',
      )
      return
    }

    if (!original || make !== original.make) changes.make = make
    if (!original || model !== original.model) changes.model = model

    if (
      !Number.isInteger(modelYear) ||
      modelYear < 1886 ||
      modelYear > 2100
    ) {
      setFormError('Enter a model year between 1886 and 2100.')
      return
    }

    if (!original || modelYear !== Number(original.model_year)) {
      changes.model_year = modelYear
    }

    if (original && Object.keys(changes).length === 0) {
      setFormError('No changes to save.')
      return
    }

    setSubmitting(true)

    try {
      const response = await apiFetch(
        original ? `/vehicles/${original.id}` : '/vehicles',
        {
          method: original ? 'PATCH' : 'POST',
          body: JSON.stringify(changes),
        },
      )

      const savedVehicle = await readJson<Vehicle>(response)

      closeForm()
      setFormSuccess(
        original
          ? `${savedVehicle.make} ${savedVehicle.model} updated successfully.`
          : `${savedVehicle.make} ${savedVehicle.model} added to inventory as Active.`,
      )

      await loadData()
    } catch (error) {
      if (error instanceof SessionExpiredError) return
      setFormError(errorMessage(error, 'Could not save the vehicle.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeleteVehicle(vehicle: Vehicle) {
    if (!isAdmin) {
      setActionError('Only an administrator can delete vehicle records.')
      return
    }

    const confirmed = window.confirm(
      `Permanently delete ${vehicle.make} ${vehicle.model} (VIN ${vehicle.vin})? This cannot be undone.`,
    )

    if (!confirmed) return

    setDeletingId(vehicle.id)
    setActionError(null)
    setFormSuccess(null)

    try {
      const response = await apiFetch(`/vehicles/${vehicle.id}`, {
        method: 'DELETE',
      })

      await readJson<{ message: string; vehicle: Vehicle }>(response)

      setFormSuccess(`${vehicle.make} ${vehicle.model} was deleted.`)
      await loadData()
    } catch (error) {
      if (error instanceof SessionExpiredError) return
      setActionError(errorMessage(error, 'Could not delete the vehicle.'))
    } finally {
      setDeletingId(null)
    }
  }

  async function handleRecordSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaleNotice(null)

    const amount = Number(saleAmount)
    const vehicle = allVehicles.find((item) => sameId(item.id, saleVehicleId))

    if (!vehicle) {
      setSaleNotice({ kind: 'error', text: 'Choose a vehicle to sell.' })
      return
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setSaleNotice({ kind: 'error', text: 'Enter a sale price greater than €0.' })
      return
    }

    setSaleSubmitting(true)

    try {
      const response = await apiFetch('/sales', {
        method: 'POST',
        body: JSON.stringify({ vehicle_id: Number(vehicle.id), amount }),
      })

      await readJson<ManagedSale>(response)
      setSaleAmount('')
      setSaleVehicleId('')
      setSaleNotice({
        kind: 'success',
        text: `Sale recorded: ${vehicle.make} ${vehicle.model} for ${formatMoney(amount)}. The vehicle is now marked Sold.`,
      })
      await loadData()
    } catch (error) {
      if (error instanceof SessionExpiredError) return
      setSaleNotice({ kind: 'error', text: errorMessage(error, 'Could not record the sale.') })
    } finally {
      setSaleSubmitting(false)
    }
  }

  async function handleCreateService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setServiceNotice(null)

    const description = serviceDescription.trim()
    const vehicle = allVehicles.find((item) => sameId(item.id, serviceVehicleId))

    if (!vehicle) {
      setServiceNotice({ kind: 'error', text: 'Choose a vehicle for the service job.' })
      return
    }

    if (!description) {
      setServiceNotice({ kind: 'error', text: 'Describe the work to be done.' })
      return
    }

    setServiceSubmitting(true)

    try {
      const response = await apiFetch('/service', {
        method: 'POST',
        body: JSON.stringify({ vehicle_id: Number(vehicle.id), description }),
      })

      await readJson<ServiceJob>(response)
      setServiceDescription('')
      setServiceVehicleId('')
      setServiceNotice({
        kind: 'success',
        text: `Service job opened for ${vehicle.make} ${vehicle.model}. The vehicle is now In service.`,
      })
      await loadData()
    } catch (error) {
      if (error instanceof SessionExpiredError) return
      setServiceNotice({
        kind: 'error',
        text: errorMessage(error, 'Could not create the service job.'),
      })
    } finally {
      setServiceSubmitting(false)
    }
  }

  async function handleServiceStatus(job: ServiceJob, status: ServiceStatus) {
    if (status === job.status) return

    setJobsNotice(null)
    setUpdatingJobId(job.id)

    try {
      const response = await apiFetch(`/service/${job.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })

      await readJson<ServiceJob>(response)
      setJobsNotice({
        kind: 'success',
        text: `${describeVehicle(job)}: service job marked ${serviceStatusLabels[status].toLowerCase()}.`,
      })
      await loadData()
    } catch (error) {
      if (error instanceof SessionExpiredError) return
      setJobsNotice({
        kind: 'error',
        text: errorMessage(error, 'Could not update the service job.'),
      })
    } finally {
      setUpdatingJobId(null)
    }
  }

  if (!token || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
        <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-2xl">
          <div className="mb-7 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-400 text-slate-950">
              <Activity size={26} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">DataPulse</h1>
              <p className="text-sm text-slate-500">
                Automotive Intelligence Platform
              </p>
            </div>
          </div>

          <h2 className="text-xl font-semibold">
            {loginMode === 'signup' ? 'Create your account' : 'Sign in'}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {loginMode === 'signup'
              ? 'Create a DataPulse account to view inventory, sales and service analytics.'
              : 'Sign in with your DataPulse account to access inventory and analytics.'}
          </p>

          {authNotice && (
            <p
              role="status"
              className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
            >
              {authNotice}
            </p>
          )}

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            {loginMode === 'signup' && (
              <div>
                <label htmlFor="signup-name" className={labelClass}>
                  Name
                </label>
                <input
                  id="signup-name"
                  type="text"
                  autoComplete="name"
                  required
                  maxLength={100}
                  value={signupName}
                  onChange={(event) => setSignupName(event.target.value)}
                  className={inputClass}
                />
              </div>
            )}

            <div>
              <label htmlFor="login-email" className={labelClass}>
                Email
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="username"
                required
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="login-password" className={labelClass}>
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={loginMode === 'signup' ? 'new-password' : 'current-password'}
                  required
                  minLength={loginMode === 'signup' ? 6 : undefined}
                  maxLength={72}
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  className={`${inputClass} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {loginMode === 'signup' && (
                <p className="mt-1.5 text-xs text-slate-500">At least 6 characters.</p>
              )}
            </div>

            {loginError && (
              <p
                role="alert"
                className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
              >
                {loginError}
              </p>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loginLoading && (
                <RefreshCw size={16} className="animate-spin" />
              )}
              {loginLoading
                ? loginMode === 'signup'
                  ? 'Creating account...'
                  : 'Signing in...'
                : loginMode === 'signup'
                  ? 'Create account'
                  : 'Sign in'}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-600">
            {loginMode === 'signup' ? 'Already have an account?' : 'New to DataPulse?'}{' '}
            <button
              type="button"
              onClick={switchLoginMode}
              className="font-semibold text-cyan-700 hover:text-cyan-900"
            >
              {loginMode === 'signup' ? 'Sign in' : 'Create an account'}
            </button>
          </p>
          <p className="mt-3 text-center text-xs leading-5 text-slate-400">
            New accounts have standard viewer access.
          </p>
        </section>
      </main>
    )
  }

  const displayName =
    user.name && user.name !== DEFAULT_ACCOUNT_NAME ? user.name : null

  const metrics = [
    {
      label: 'Vehicles in inventory',
      value: String(stats.total),
      detail: 'Total records in PostgreSQL',
      icon: CarFront,
    },
    {
      label: 'Active vehicles',
      value: String(stats.active),
      detail: 'Available for sale or service',
      icon: CircleCheck,
    },
    {
      label: 'Sold vehicles',
      value: String(stats.sold),
      detail: 'Currently marked sold',
      icon: Euro,
    },
    {
      label: 'In service',
      value: String(stats.in_service),
      detail: 'Currently in the workshop',
      icon: Wrench,
    },
  ]

  const reconciliation = [
    stats.sold_without_sale > 0 &&
      `${plural(stats.sold_without_sale, 'vehicle')} marked Sold without a recorded sale`,
    stats.in_service_without_open_job > 0 &&
      `${plural(stats.in_service_without_open_job, 'vehicle')} marked In service without an open service job`,
  ].filter((item): item is string => Boolean(item))

  const salesChartData = sales.daily.map((item) => ({
    ...item,
    label: formatDate(item.date),
  }))
  const hasRecentSales = sales.daily.some((day) => day.sales > 0)

  const ingestion = nifiLogs ?? []
  const ingestionFailures = ingestion.filter((log) => log.outcome === 'failure').length
  const latestIngestion = ingestion[0]

  const apiSummary =
    health.api === 'ok'
      ? `Healthy · ${health.latencyMs ?? '–'} ms`
      : health.api === 'down'
        ? 'Unreachable'
        : 'Checking…'
  const databaseSummary =
    health.database === 'ok'
      ? 'Connected'
      : health.database === 'down'
        ? 'Unavailable'
        : health.database === 'checking'
          ? 'Checking…'
          : 'Unknown while the API is unreachable'
  const anyPanelError = Object.values(errors).some(Boolean)

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 md:flex">
      <aside className="bg-slate-950 p-6 text-white md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:overflow-y-auto">
        <div className="mb-10 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-400 text-slate-950">
            <Activity size={23} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">DataPulse</h1>
            <p className="text-xs text-slate-400">
              Automotive Intelligence Platform
            </p>
          </div>
        </div>

        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
          Workspace
        </p>

        <nav aria-label="Main navigation" className="space-y-1">
          {navigation.map(({ label, icon: Icon, href }) => (
            <a
              key={label}
              href={href}
              onClick={() => setActiveSection(href)}
              aria-current={activeSection === href ? 'location' : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                activeSection === href
                  ? 'bg-cyan-400/15 font-semibold text-cyan-300'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon size={19} />
              {label}
            </a>
          ))}
        </nav>

        <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <span
              className={`h-2 w-2 rounded-full ${
                health.api === 'down'
                  ? 'bg-rose-400'
                  : anyPanelError
                    ? 'bg-amber-400'
                    : loading
                      ? 'bg-cyan-400'
                      : 'bg-emerald-400'
              }`}
            />
            {health.api === 'down'
              ? 'API unavailable'
              : anyPanelError
                ? 'Some data unavailable'
                : loading
                  ? 'Loading data'
                  : 'Connected'}
          </div>
          <p className="text-xs leading-5 text-slate-400">
            Signed-in API session.
          </p>
        </div>

        <div className="mt-4 rounded-xl border border-slate-800 p-4">
          {displayName && (
            <p className="text-sm font-semibold">{displayName}</p>
          )}
          <p className={`break-all text-sm ${displayName ? 'mt-0.5 text-slate-400' : 'font-medium'}`}>
            {user.email}
          </p>
          <p className="mt-1 text-xs text-cyan-300">
            {user.role.charAt(0).toUpperCase() + user.role.slice(1)} role
          </p>
          <button
            type="button"
            onClick={() => signOut()}
            className="mt-4 inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white"
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>

      <main id="overview" className="min-w-0 flex-1 scroll-mt-6 p-5 md:p-8">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="mb-1 text-sm text-slate-500">
              Workspace / Overview
            </p>
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
              Business overview
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Monitor vehicle inventory, sales, service and data operations.
            </p>
          </div>
          <button
            type="button"
            onClick={refreshAll}
            aria-label="Refresh dashboard data"
            title="Refresh dashboard data"
            className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-colors hover:bg-slate-100"
          >
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
        </header>

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Key performance indicators</h3>
            <p className="mt-1 text-xs text-slate-500">
              Live inventory statistics from PostgreSQL.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-medium text-cyan-800">
            <ShieldCheck size={14} />
            Authenticated workspace
          </span>
        </div>

        <section
          aria-label="Key performance indicators"
          className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-4 ${reconciliation.length ? 'mb-4' : 'mb-8'}`}
        >
          {metrics.map(({ label, value, detail, icon: Icon }) => (
            <article
              key={label}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="mb-5 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-500">{label}</p>
                <div className="rounded-xl bg-cyan-50 p-2 text-cyan-700">
                  <Icon size={20} aria-hidden="true" />
                </div>
              </div>
              <p className="text-2xl font-bold tracking-tight">
                {errors.inventory ? '—' : loading && !lastUpdated ? '…' : value}
              </p>
              <div className="mt-2 flex items-start gap-1.5">
                {errors.inventory ? (
                  <TriangleAlert
                    size={15}
                    className="mt-0.5 shrink-0 text-amber-600"
                  />
                ) : (
                  <CircleCheck
                    size={15}
                    className="mt-0.5 shrink-0 text-emerald-600"
                  />
                )}
                <p className="text-xs leading-5 text-slate-500">
                  {errors.inventory ? 'Data unavailable' : detail}
                </p>
              </div>
            </article>
          ))}
        </section>

        {reconciliation.length > 0 && !errors.inventory && (
          <div
            role="note"
            className="mb-8 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          >
            <Info size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Inventory data check</p>
              <p className="mt-1 leading-6">
                {reconciliation.join(' and ')}. Their history is incomplete, so
                the sales and service totals below do not include them.
                {canEdit &&
                  ' Record the sale, or open and close a service job, to reconcile them.'}
              </p>
            </div>
          </div>
        )}

        <section
          id="inventory"
          className={`${cardClass} mb-8 scroll-mt-6`}
        >
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">Vehicle inventory</h3>
              <p className="mt-1 text-sm text-slate-500">
                Search, filter and manage PostgreSQL vehicle records.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canEdit && (
                <button
                  type="button"
                  onClick={openCreateForm}
                  className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-700"
                >
                  <Plus size={16} /> Add vehicle
                </button>
              )}
              <button
                type="button"
                onClick={() => void loadData()}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw
                  size={15}
                  className={loading ? 'animate-spin' : ''}
                />
                Refresh
              </button>
            </div>
          </div>

          <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_200px]">
            <div className="relative">
              <Search
                size={17}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                aria-label="Search vehicles"
                placeholder="Search VIN, make or model..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />
            </div>
            <select
              aria-label="Filter vehicles by status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="sold">Sold</option>
              <option value="in_service">In service</option>
            </select>
          </div>

          {showVehicleForm && canEdit && (
            <form
              onSubmit={handleSaveVehicle}
              className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4 md:p-5"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h4 className="font-semibold">
                    {editingVehicle === null
                      ? 'Add a vehicle'
                      : `Edit ${editingVehicle.make} ${editingVehicle.model}`}
                  </h4>
                  <p className="mt-1 text-sm text-slate-500">
                    {editingVehicle === null
                      ? 'New vehicles start as Active. Recording a sale or opening a service job updates their status.'
                      : 'Changes are saved to PostgreSQL. Status changes through the sales and service workflows.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeForm}
                  aria-label="Close vehicle form"
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label htmlFor="vehicle-vin" className={labelClass}>
                    VIN
                  </label>
                  <input
                    id="vehicle-vin"
                    value={vehicleForm.vin}
                    onChange={(event) =>
                      updateVehicleForm('vin', event.target.value)
                    }
                    placeholder="17-character VIN"
                    maxLength={17}
                    required
                    autoComplete="off"
                    className={`${inputClass} font-mono uppercase`}
                  />
                </div>
                <div>
                  <label htmlFor="vehicle-make" className={labelClass}>
                    Make
                  </label>
                  <input
                    id="vehicle-make"
                    value={vehicleForm.make}
                    onChange={(event) =>
                      updateVehicleForm('make', event.target.value)
                    }
                    placeholder="e.g. Toyota"
                    maxLength={100}
                    required
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="vehicle-model" className={labelClass}>
                    Model
                  </label>
                  <input
                    id="vehicle-model"
                    value={vehicleForm.model}
                    onChange={(event) =>
                      updateVehicleForm('model', event.target.value)
                    }
                    placeholder="e.g. Corolla"
                    maxLength={100}
                    required
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="vehicle-year" className={labelClass}>
                    Model year
                  </label>
                  <input
                    id="vehicle-year"
                    type="number"
                    min={1886}
                    max={2100}
                    step={1}
                    value={vehicleForm.model_year}
                    onChange={(event) =>
                      updateVehicleForm('model_year', event.target.value)
                    }
                    required
                    className={inputClass}
                  />
                </div>
              </div>

              {editingVehicle !== null && (
                <p className="mt-4 text-sm text-slate-600">
                  Current status:{' '}
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[editingVehicle.status]}`}
                  >
                    {statusLabels[editingVehicle.status]}
                  </span>
                </p>
              )}

              {formError && (
                <p
                  role="alert"
                  className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
                >
                  {formError}
                </p>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting && (
                    <RefreshCw size={15} className="animate-spin" />
                  )}
                  {submitting
                    ? 'Saving...'
                    : editingVehicle === null
                      ? 'Save vehicle'
                      : 'Save changes'}
                </button>
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-slate-100"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {formSuccess && (
            <p
              role="status"
              className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"
            >
              {formSuccess}
            </p>
          )}
          {actionError && (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
            >
              {actionError}
            </p>
          )}
          {errors.inventory && (
            <div className="mb-4">
              <PanelError
                message={`Could not load vehicles: ${errors.inventory}`}
                onRetry={refreshAll}
              />
            </div>
          )}

          {loading && !lastUpdated && !errors.inventory ? (
            <div
              role="status"
              className="flex items-center gap-3 py-12 text-sm text-slate-500"
            >
              <RefreshCw size={18} className="animate-spin" />
              Loading vehicle records...
            </div>
          ) : !errors.inventory && vehicles.length === 0 ? (
            <div className="py-10 text-center">
              <CarFront size={30} className="mx-auto mb-3 text-slate-400" />
              <p className="font-medium">No vehicles found</p>
              <p className="mt-1 text-sm text-slate-500">
                {search || statusFilter !== 'all'
                  ? 'Try changing your search or filter.'
                  : 'Add a vehicle or ingest one through NiFi.'}
              </p>
            </div>
          ) : vehicles.length > 0 ? (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                <span>
                  {vehicles.length} result{vehicles.length === 1 ? '' : 's'}
                </span>
                <span className="text-slate-300">•</span>
                <span>{stats.total} total database records</span>
                {lastUpdated && (
                  <>
                    <span className="text-slate-300">•</span>
                    <span>Updated at {lastUpdated}</span>
                  </>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-left text-sm">
                  <thead>
                    <tr className="border-y border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                      <th scope="col" className="py-3 pr-4 font-medium">
                        Vehicle
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        Model year
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        Status
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        Record ID
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-right font-medium"
                      >
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {vehicles.map((vehicle) => (
                      <tr
                        key={vehicle.id}
                        className="transition-colors hover:bg-slate-50"
                      >
                        <td className="py-4 pr-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
                              <CarFront size={20} />
                            </div>
                            <div>
                              <p className="font-medium text-slate-900">
                                {vehicle.make} {vehicle.model}
                              </p>
                              <p className="mt-1 font-mono text-xs text-slate-500">
                                {vehicle.vin}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-slate-600">
                          {vehicle.model_year}
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[vehicle.status]}`}
                          >
                            {statusLabels[vehicle.status]}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-slate-500">
                          #{vehicle.id}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex justify-end gap-2">
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => openEditForm(vehicle)}
                                aria-label={`Edit ${vehicle.make} ${vehicle.model}`}
                                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-100"
                              >
                                Edit
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => void handleDeleteVehicle(vehicle)}
                                disabled={sameId(deletingId, vehicle.id)}
                                aria-label={`Delete ${vehicle.make} ${vehicle.model}`}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                              >
                                {sameId(deletingId, vehicle.id) ? (
                                  <RefreshCw
                                    size={13}
                                    className="animate-spin"
                                  />
                                ) : (
                                  <Trash2 size={13} />
                                )}
                                Delete
                              </button>
                            )}
                            {!canEdit && !isAdmin && (
                              <span className="px-3 py-1.5 text-xs text-slate-400">
                                View only
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          <div className="mt-5 flex items-start gap-2 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">
            <Database size={15} className="mt-0.5 shrink-0" />
            <p>
              Source: DataPulse REST API backed by PostgreSQL. Vehicles with
              sales or service history are kept so that history stays intact.
            </p>
          </div>
        </section>

        <section id="sales-service" className="mb-8 scroll-mt-6">
          <div className="mb-5">
            <h3 className="font-semibold">Sales & service</h3>
            <p className="mt-1 text-sm text-slate-500">
              Record vehicle sales and manage service jobs. Vehicle status
              updates automatically.
            </p>
          </div>

          {canEdit ? (
            <div className="mb-6 grid gap-6 lg:grid-cols-2">
              <form
                onSubmit={handleRecordSale}
                className={`${cardClass} space-y-4`}
              >
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-semibold">Record a sale</h4>
                  <Euro size={18} className="text-slate-400" />
                </div>
                <div>
                  <label htmlFor="sale-vehicle" className={labelClass}>
                    Vehicle
                  </label>
                  <select
                    id="sale-vehicle"
                    required
                    disabled={saleSubmitting}
                    value={saleVehicleId}
                    onChange={(event) => {
                      setSaleVehicleId(event.target.value)
                      setSaleNotice(null)
                    }}
                    className={inputClass}
                  >
                    <option value="">
                      {saleCandidates.length
                        ? 'Select a vehicle to sell'
                        : 'No vehicles available to sell'}
                    </option>
                    {saleCandidates.map((vehicle) => (
                      <option key={vehicle.id} value={String(vehicle.id)}>
                        {saleOptionLabel(vehicle)}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-xs text-slate-500">
                    Vehicles in the workshop can be sold once their service
                    job is closed.
                  </p>
                </div>
                <div>
                  <label htmlFor="sale-amount" className={labelClass}>
                    Sale price (€)
                  </label>
                  <input
                    id="sale-amount"
                    required
                    min="0.01"
                    step="0.01"
                    type="number"
                    inputMode="decimal"
                    placeholder="e.g. 24990"
                    disabled={saleSubmitting}
                    value={saleAmount}
                    onChange={(event) => {
                      setSaleAmount(event.target.value)
                      setSaleNotice(null)
                    }}
                    className={inputClass}
                  />
                </div>
                <NoticeMessage notice={saleNotice} />
                <button
                  type="submit"
                  disabled={saleSubmitting}
                  className={primaryButtonClass}
                >
                  {saleSubmitting && <RefreshCw size={15} className="animate-spin" />}
                  {saleSubmitting ? 'Recording sale...' : 'Record sale'}
                </button>
              </form>

              <form
                onSubmit={handleCreateService}
                className={`${cardClass} space-y-4`}
              >
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-semibold">Create service job</h4>
                  <Wrench size={18} className="text-slate-400" />
                </div>
                <div>
                  <label htmlFor="service-vehicle" className={labelClass}>
                    Vehicle
                  </label>
                  <select
                    id="service-vehicle"
                    required
                    disabled={serviceSubmitting}
                    value={serviceVehicleId}
                    onChange={(event) => {
                      setServiceVehicleId(event.target.value)
                      setServiceNotice(null)
                    }}
                    className={inputClass}
                  >
                    <option value="">
                      {serviceCandidates.length
                        ? 'Select a vehicle'
                        : 'No vehicles available for service'}
                    </option>
                    {serviceCandidates.map((vehicle) => (
                      <option key={vehicle.id} value={String(vehicle.id)}>
                        {vehicle.make} {vehicle.model} · {vehicle.vin} (
                        {statusLabels[vehicle.status]})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="service-description" className={labelClass}>
                    Description
                  </label>
                  <textarea
                    id="service-description"
                    required
                    maxLength={2000}
                    rows={3}
                    disabled={serviceSubmitting}
                    value={serviceDescription}
                    onChange={(event) => {
                      setServiceDescription(event.target.value)
                      setServiceNotice(null)
                    }}
                    placeholder="Work to be carried out"
                    className={inputClass}
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {serviceSuggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        disabled={serviceSubmitting}
                        onClick={() => setServiceDescription(suggestion)}
                        className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
                <NoticeMessage notice={serviceNotice} />
                <button
                  type="submit"
                  disabled={serviceSubmitting}
                  className={primaryButtonClass}
                >
                  {serviceSubmitting && <RefreshCw size={15} className="animate-spin" />}
                  {serviceSubmitting ? 'Creating job...' : 'Create service job'}
                </button>
              </form>
            </div>
          ) : (
            <p className="mb-6 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
              Your account has read-only access. Admins and operators can
              record sales and manage service jobs.
            </p>
          )}

          <div className="grid gap-6 xl:grid-cols-2">
            <article className={cardClass}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h4 className="font-semibold">Recent sales</h4>
                  <p className="mt-1 text-xs text-slate-500">
                    {plural(sales.totalSales, 'recorded sale')} ·{' '}
                    {formatMoney(sales.totalRevenue)} revenue
                  </p>
                </div>
                <Receipt size={18} className="text-slate-400" />
              </div>
              {errors.sales ? (
                <PanelError
                  message={`Could not load sales: ${errors.sales}`}
                  onRetry={refreshAll}
                />
              ) : managedSales.length ? (
                <ul className="divide-y divide-slate-100">
                  {managedSales.slice(0, 8).map((sale) => (
                    <li
                      key={sale.id}
                      className="flex items-start justify-between gap-3 py-3 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{describeVehicle(sale)}</p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          <span className="font-mono">{sale.vin ?? 'VIN unavailable'}</span>{' '}
                          · {formatDate(sale.sold_at)}
                        </p>
                      </div>
                      <span className="shrink-0 font-semibold">
                        {formatMoney(Number(sale.amount))}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={<Receipt size={28} />} title="No sales recorded yet">
                  Recorded sales appear here with their price and date.
                </EmptyState>
              )}
            </article>

            <article className={cardClass}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h4 className="font-semibold">Service jobs</h4>
                  <p className="mt-1 text-xs text-slate-500">
                    {service.open + service.in_progress} open ·{' '}
                    {service.completed} completed
                  </p>
                </div>
                <Wrench size={18} className="text-slate-400" />
              </div>
              {jobsNotice && (
                <div className="mb-3">
                  <NoticeMessage notice={jobsNotice} />
                </div>
              )}
              {errors.service ? (
                <PanelError
                  message={`Could not load service jobs: ${errors.service}`}
                  onRetry={refreshAll}
                />
              ) : serviceJobs.length ? (
                <ul className="divide-y divide-slate-100">
                  {serviceJobs.slice(0, 8).map((job) => {
                    const isOpen = job.status === 'open' || job.status === 'in_progress'

                    return (
                      <li key={job.id} className="py-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">
                              {describeVehicle(job)}
                              <span className="ml-2 font-mono text-xs font-normal text-slate-400">
                                {job.vin}
                              </span>
                            </p>
                            <p className="mt-1 text-sm text-slate-600">
                              {job.description}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                              Opened {formatDate(job.opened_at)}
                              {job.completed_at &&
                                ` · Completed ${formatDate(job.completed_at)}`}
                            </p>
                          </div>
                          {canEdit && isOpen ? (
                            <div className="flex items-center gap-2">
                              {sameId(updatingJobId, job.id) && (
                                <RefreshCw size={14} className="animate-spin text-slate-400" />
                              )}
                              <select
                                aria-label={`Status for service job ${job.id}`}
                                value={job.status}
                                disabled={updatingJobId !== null}
                                onChange={(event) =>
                                  void handleServiceStatus(
                                    job,
                                    event.target.value as ServiceStatus,
                                  )
                                }
                                className="rounded-lg border border-slate-300 bg-white p-2 text-sm"
                              >
                                {nextServiceStatuses[job.status as 'open' | 'in_progress'].map(
                                  (status) => (
                                    <option key={status} value={status}>
                                      {serviceStatusLabels[status]}
                                    </option>
                                  ),
                                )}
                              </select>
                            </div>
                          ) : (
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${serviceStatusStyles[job.status]}`}
                            >
                              {serviceStatusLabels[job.status]}
                            </span>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <EmptyState icon={<Wrench size={28} />} title="No service jobs yet">
                  Service jobs appear here with their status and dates.
                </EmptyState>
              )}
            </article>
          </div>
        </section>

        <section id="analytics" className="mb-8 grid scroll-mt-6 gap-6 xl:grid-cols-3">
          <article className={`${cardClass} xl:col-span-2`}>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">Sales activity</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Daily recorded revenue · last seven days
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold">
                  {formatMoney(sales.totalRevenue)}
                </p>
                <p className="text-xs text-slate-500">
                  Total recorded revenue
                  {sales.totalSales > 0 &&
                    ` · average ${formatMoney(sales.averageSale)}`}
                </p>
              </div>
            </div>

            {errors.sales ? (
              <PanelError
                message={`Could not load sales analytics: ${errors.sales}`}
                onRetry={refreshAll}
              />
            ) : hasRecentSales ? (
              <div
                role="img"
                aria-label="Daily recorded revenue from the sales events database table"
                className="h-64 w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={salesChartData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#e2e8f0"
                    />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={64}
                      tick={{ fontSize: 12, fill: '#64748b' }}
                      tickFormatter={(value: number) => formatCompactMoney(value)}
                    />
                    <Tooltip
                      formatter={(value, _name, item) => [
                        formatMoney(Number(value)),
                        `Revenue (${plural(Number(item?.payload?.sales ?? 0), 'sale')})`,
                      ]}
                      contentStyle={{
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        fontSize: '12px',
                      }}
                    />
                    <Bar
                      dataKey="revenue"
                      name="Revenue"
                      fill="#06b6d4"
                      radius={[5, 5, 0, 0]}
                      maxBarSize={42}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center">
                <ChartNoAxesCombined
                  size={30}
                  className="mb-3 text-slate-400"
                />
                <p className="font-medium">
                  {sales.hasData ? 'No sales in the last seven days' : 'No sales data yet'}
                </p>
                <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">
                  {sales.hasData
                    ? 'Earlier sales are included in the totals above.'
                    : 'Revenue appears here as sales are recorded. No sample sales are shown.'}
                </p>
              </div>
            )}

            <div className="mt-4 flex flex-wrap justify-between gap-2 text-xs text-slate-500">
              <span>{plural(sales.totalSales, 'recorded sale')}</span>
              <span>Source: PostgreSQL sales events</span>
            </div>
          </article>

          <article className={cardClass}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">Service activity</h3>
              <Wrench size={18} className="text-slate-400" />
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Recorded service jobs by status
            </p>

            {errors.service ? (
              <div className="mt-6">
                <PanelError
                  message={`Could not load service analytics: ${errors.service}`}
                  onRetry={refreshAll}
                />
              </div>
            ) : service.hasData ? (
              <div className="mt-6 space-y-4">
                {[
                  { label: 'Open', value: service.open, color: 'bg-amber-500' },
                  {
                    label: 'In progress',
                    value: service.in_progress,
                    color: 'bg-cyan-500',
                  },
                  {
                    label: 'Completed',
                    value: service.completed,
                    color: 'bg-emerald-500',
                  },
                  {
                    label: 'Cancelled',
                    value: service.cancelled,
                    color: 'bg-slate-400',
                  },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="mb-1.5 flex justify-between gap-3 text-sm">
                      <span className="text-slate-600">{item.label}</span>
                      <span className="font-semibold">{item.value}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${item.color}`}
                        style={{
                          width: `${
                            service.total > 0
                              ? Math.min(100, (item.value / service.total) * 100)
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
                <p className="border-t border-slate-100 pt-4 text-xs text-slate-500">
                  {plural(service.total, 'recorded service job')}
                </p>
              </div>
            ) : (
              <div className="mt-6 flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 text-center">
                <Wrench size={28} className="mb-3 text-slate-400" />
                <p className="font-medium">No service data yet</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Service metrics appear when service jobs are recorded.
                </p>
              </div>
            )}
          </article>
        </section>

        <section
          id="system-status"
          className={`${cardClass} scroll-mt-6`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">System status</h3>
              <p className="mt-1 text-sm text-slate-500">
                Live checks of the DataPulse API and PostgreSQL database
              </p>
            </div>
            <button
              type="button"
              onClick={() => void checkHealth()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
            >
              <Activity size={15} /> Check now
            </button>
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <div className="flex gap-3">
              <CheckIndicator state={health.api} />
              <div>
                <p className="text-sm font-medium">API</p>
                <p className="mt-1 text-xs text-slate-500">{apiSummary}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <CheckIndicator state={health.database} />
              <div>
                <p className="text-sm font-medium">PostgreSQL</p>
                <p className="mt-1 text-xs text-slate-500">{databaseSummary}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Clock size={18} className="shrink-0 text-slate-400" />
              <div>
                <p className="text-sm font-medium">Last data refresh</p>
                <p className="mt-1 text-xs text-slate-500">
                  {lastUpdated ?? 'Not refreshed yet'}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <ShieldCheck size={18} className="shrink-0 text-cyan-600" />
              <div>
                <p className="text-sm font-medium">Access role</p>
                <p className="mt-1 text-xs capitalize text-slate-500">
                  {user.role}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-lg bg-slate-50 p-3">
            <p className="text-xs leading-5 text-slate-500">
              {health.checkedAt
                ? `Checked at ${health.checkedAt}; refreshes every 30 seconds. `
                : ''}
              Data requests use a bearer token, and the API enforces
              permissions independently of these dashboard controls.
            </p>
          </div>
        </section>

        {isAdmin && (
          <section
            id="data-ingestion"
            className={`${cardClass} mt-6`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <Workflow size={20} className="mt-0.5 text-cyan-700" />
                <div>
                  <h3 className="font-semibold">Data ingestion (Apache NiFi)</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Vehicle records sent to the API with a machine credential,
                    such as a NiFi InvokeHTTP processor.
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                Admin only
              </span>
            </div>

            {errors.nifi ? (
              <div className="mt-5">
                <PanelError
                  message={`Could not load ingestion logs: ${errors.nifi}`}
                  onRetry={refreshAll}
                />
              </div>
            ) : ingestion.length === 0 ? (
              <div className="mt-5">
                <EmptyState icon={<Workflow size={28} />} title="No ingestion requests recorded">
                  Requests made with a machine credential appear here once a
                  flow starts sending vehicles.
                </EmptyState>
              </div>
            ) : (
              <>
                <div className="mt-5 grid gap-4 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 p-4">
                    <p className="text-xs text-slate-500">Last request</p>
                    <p className="mt-1 text-sm font-semibold">
                      {latestIngestion ? formatDateTime(latestIngestion.created_at) : '—'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-4">
                    <p className="text-xs text-slate-500">Accepted</p>
                    <p className="mt-1 text-sm font-semibold text-emerald-700">
                      {ingestion.length - ingestionFailures}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-4">
                    <p className="text-xs text-slate-500">Rejected</p>
                    <p className={`mt-1 text-sm font-semibold ${ingestionFailures ? 'text-rose-700' : ''}`}>
                      {ingestionFailures}
                    </p>
                  </div>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead>
                      <tr className="border-y border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                        <th scope="col" className="py-2 pr-4 font-medium">Time</th>
                        <th scope="col" className="px-4 py-2 font-medium">Flow</th>
                        <th scope="col" className="px-4 py-2 font-medium">Outcome</th>
                        <th scope="col" className="px-4 py-2 font-medium">HTTP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ingestion.slice(0, 5).map((log) => (
                        <tr key={log.id}>
                          <td className="py-2 pr-4 text-slate-600">{formatDateTime(log.created_at)}</td>
                          <td className="px-4 py-2 text-slate-600">{log.flow_name}</td>
                          <td className="px-4 py-2">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                                log.outcome === 'success'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-rose-50 text-rose-700'
                              }`}
                            >
                              {log.outcome === 'success' ? 'Accepted' : 'Rejected'}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-slate-600">{log.http_status ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <p className="mt-4 text-xs leading-5 text-slate-500">
              Shows what the API received over the last 100 requests. The NiFi
              flow itself runs and is monitored in NiFi.
            </p>
          </section>
        )}

        <section
          id="users-roles"
          className={`${cardClass} mt-6 scroll-mt-6`}
        >
          <div className="flex items-center gap-3">
            <Users size={20} className="text-cyan-700" />
            <div>
              <h3 className="font-semibold">Users & roles</h3>
              <p className="mt-1 text-sm text-slate-500">
                Your current account access
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 p-4">
            <div>
              {displayName && (
                <p className="text-sm font-semibold">{displayName}</p>
              )}
              <p className="break-all text-sm">{user.email}</p>
              <p className="mt-1 text-xs capitalize text-slate-500">
                Role: {user.role}
              </p>
            </div>
            <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium capitalize text-cyan-800">
              {user.role}
            </span>
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-500">
            {isAdmin
              ? 'You have administrator permissions, including deleting vehicles and viewing ingestion logs. New accounts always start with viewer access.'
              : user.role === 'operator'
                ? 'You can add and edit vehicles, record sales and manage service jobs. Deleting records is restricted to administrators.'
                : 'You have read-only access to inventory, sales, service and analytics.'}
          </p>
        </section>

        <section
          id="settings"
          className={`${cardClass} mt-6 scroll-mt-6`}
        >
          <div className="flex items-center gap-3">
            <Settings size={20} className="text-slate-500" />
            <div>
              <h3 className="font-semibold">Session settings</h3>
              <p className="mt-1 text-sm text-slate-500">
                Manage the current browser session.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => signOut()}
            className="mt-5 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium hover:bg-slate-50"
          >
            <LogOut size={16} /> Sign out
          </button>
        </section>

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <span>DataPulse — Automotive Intelligence Platform</span>
          <span>
            {health.api === 'down'
              ? 'API connection unavailable'
              : loading
                ? 'Refreshing data...'
                : 'Dashboard connected'}
          </span>
        </footer>
      </main>
    </div>
  )
}

export default App
