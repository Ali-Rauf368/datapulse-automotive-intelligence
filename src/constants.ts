import {
  Activity,
  CarFront,
  ChartNoAxesCombined,
  LayoutDashboard,
  Settings,
  Users,
  Wrench,
} from 'lucide-react'
import type {
  Health,
  PanelErrors,
  SalesAnalytics,
  ServiceAnalytics,
  ServiceStatus,
  VehicleStats,
  VehicleStatus,
} from './types.ts'

export const TOKEN_KEY = 'datapulse_token'
export const USER_KEY = 'datapulse_user'
// Name given to accounts created before signup collected one (migration 002).
export const DEFAULT_ACCOUNT_NAME = 'DataPulse User'

export const emptyStats: VehicleStats = {
  total: 0,
  active: 0,
  sold: 0,
  in_service: 0,
  sold_without_sale: 0,
  in_service_without_open_job: 0,
}

export const emptySales: SalesAnalytics = {
  totalSales: 0,
  totalRevenue: 0,
  averageSale: 0,
  hasData: false,
  daily: [],
}

export const emptyService: ServiceAnalytics = {
  total: 0,
  open: 0,
  in_progress: 0,
  completed: 0,
  cancelled: 0,
  hasData: false,
}

export const noErrors: PanelErrors = {
  inventory: null,
  sales: null,
  service: null,
  nifi: null,
}

export const initialHealth: Health = {
  api: 'checking',
  database: 'checking',
  latencyMs: null,
  checkedAt: null,
}

export const navigation = [
  { label: 'Overview', icon: LayoutDashboard, href: '#overview' },
  { label: 'Inventory', icon: CarFront, href: '#inventory' },
  { label: 'Sales & service', icon: Wrench, href: '#sales-service' },
  { label: 'Analytics', icon: ChartNoAxesCombined, href: '#analytics' },
  { label: 'System status', icon: Activity, href: '#system-status' },
  { label: 'Users & roles', icon: Users, href: '#users-roles' },
  { label: 'Settings', icon: Settings, href: '#settings' },
]

export const statusStyles: Record<VehicleStatus, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  sold: 'bg-slate-100 text-slate-700',
  in_service: 'bg-amber-50 text-amber-700',
}

export const statusLabels: Record<VehicleStatus, string> = {
  active: 'Active',
  sold: 'Sold',
  in_service: 'In service',
}

export const serviceStatusLabels: Record<ServiceStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export const serviceStatusStyles: Record<ServiceStatus, string> = {
  open: 'bg-amber-50 text-amber-700',
  in_progress: 'bg-cyan-50 text-cyan-700',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-slate-100 text-slate-600',
}

// Moves allowed from a job that is still open; completed and cancelled jobs
// are final (the API enforces the same rule).
export const nextServiceStatuses: Record<'open' | 'in_progress', ServiceStatus[]> = {
  open: ['open', 'in_progress', 'completed', 'cancelled'],
  in_progress: ['in_progress', 'open', 'completed', 'cancelled'],
}

export const serviceSuggestions = [
  'Annual inspection',
  'Oil and filter change',
  'Brake inspection',
  'Tyre change: summer to winter',
]

export const labelClass = 'mb-1.5 block text-sm font-medium text-slate-700'
export const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50'
export const cardClass = 'rounded-2xl border border-slate-200 bg-white p-6 shadow-sm'
export const primaryButtonClass =
  'inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60'
export const secondaryButtonClass =
  'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60'
