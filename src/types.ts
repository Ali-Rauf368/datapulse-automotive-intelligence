export type Role = 'admin' | 'operator' | 'viewer'
export type VehicleStatus = 'active' | 'sold' | 'in_service'
export type ServiceStatus = 'open' | 'in_progress' | 'completed' | 'cancelled'

// PostgreSQL BIGINT ids arrive as strings; compare them with sameId().
export type Id = string | number

export type User = {
  id: string
  email: string
  name?: string
  role: Role
}

export type Vehicle = {
  id: Id
  vin: string
  make: string
  model: string
  model_year: number
  status: VehicleStatus
  created_at: string
}

export type VehicleStats = {
  total: number
  active: number
  sold: number
  in_service: number
  sold_without_sale: number
  in_service_without_open_job: number
}

export type LoginResponse = {
  token: string
  user: User
}

export type SalesAnalytics = {
  totalSales: number
  totalRevenue: number
  averageSale: number
  hasData: boolean
  daily: Array<{ date: string; sales: number; revenue: number }>
}

export type ServiceAnalytics = {
  total: number
  open: number
  in_progress: number
  completed: number
  cancelled: number
  hasData: boolean
}

export type VehicleRef = {
  vehicle_id: Id | null
  vin?: string | null
  make?: string | null
  model?: string | null
}

export type ManagedSale = VehicleRef & {
  id: Id
  amount: string | number
  sold_at: string
}

export type ServiceJob = VehicleRef & {
  id: Id
  status: ServiceStatus
  description: string
  opened_at: string
  completed_at: string | null
}

export type NifiLog = {
  id: Id
  flow_name: string
  outcome: 'success' | 'failure'
  http_status: number | null
  message: string | null
  created_at: string
}

export type AppUser = {
  id: Id
  email: string
  name: string
  role: Role
  active: boolean
  created_at: string
}

export type AuditEntry = {
  id: Id
  actor_email: string | null
  actor_kind: 'user' | 'machine' | 'system'
  action: string
  entity: 'vehicle' | 'sale' | 'service_job' | 'user'
  entity_id: Id | null
  summary: string
  created_at: string
}

export type InsightsRange = '30' | '90' | '365' | 'all'

export type Insights = {
  range: InsightsRange
  revenue: number
  sales: number
  averageDaysInStock: number | null
  averageServiceHours: number | null
  monthly: Array<{ month: string; sales: number; revenue: number }>
  topMakes: Array<{ make: string; sales: number; revenue: number }>
}

export type CheckState = 'checking' | 'ok' | 'down' | 'unknown'

export type Health = {
  api: CheckState
  database: CheckState
  latencyMs: number | null
  checkedAt: string | null
}

export type PanelErrors = {
  inventory: string | null
  sales: string | null
  service: string | null
  nifi: string | null
}

export type Notice = {
  kind: 'success' | 'error'
  text: string
}
