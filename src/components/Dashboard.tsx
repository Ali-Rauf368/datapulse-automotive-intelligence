import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useDashboardData } from '../hooks/useDashboardData.ts'
import { useHealth } from '../hooks/useHealth.ts'
import { useScrollSpy } from '../hooks/useScrollSpy.ts'
import { navigation } from '../constants.ts'
import { Sidebar } from './Sidebar.tsx'
import { KpiSection } from './KpiSection.tsx'
import { InventorySection } from './InventorySection.tsx'
import { SalesServiceSection } from './SalesServiceSection.tsx'
import { AnalyticsSection } from './AnalyticsSection.tsx'
import { AccountSections, IngestionPanel, SystemStatusSection } from './OperationsSections.tsx'
import { InsightsSection } from './InsightsSection.tsx'
import { AuditLogSection, UserManagement } from './AdminSections.tsx'
import type { User } from '../types.ts'

const sectionHrefs = navigation.map((item) => item.href)

type Props = {
  token: string
  user: User
  onUserChange: (user: User) => void
  onSignOut: (notice?: string | null) => void
}

// Mounted once per session (keyed by token in App), so signing out discards
// all dashboard state.
export function Dashboard({ token, user, onUserChange, onSignOut }: Props) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const isAdmin = user.role === 'admin'
  const canEdit = user.role === 'admin' || user.role === 'operator'

  const data = useDashboardData({
    token,
    isAdmin,
    search,
    statusFilter,
    onSessionExpired: onSignOut,
  })
  const { health, checkHealth } = useHealth(true)
  const [activeSection, setActiveSection] = useScrollSpy(sectionHrefs, true)
  const { apiGet, loadData } = data

  const reload = useCallback(() => loadData(), [loadData])

  function refreshAll() {
    void loadData()
    void checkHealth()
  }

  // Confirms the stored session and picks up name or role changes.
  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const profile = await apiGet<User>('/auth/me', controller.signal)
        if (!controller.signal.aborted) onUserChange(profile)
      } catch {
        // An expired session signs out inside apiFetch; other failures are
        // reported by the dashboard panels.
      }
    }, 0)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [apiGet, onUserChange])

  const anyPanelError = Object.values(data.errors).some(Boolean)

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 md:flex">
      <Sidebar
        user={user}
        activeSection={activeSection}
        onNavigate={setActiveSection}
        health={health}
        loading={data.loading}
        anyPanelError={anyPanelError}
        onSignOut={() => onSignOut()}
      />

      <main id="overview" className="min-w-0 flex-1 scroll-mt-6 p-5 md:p-8">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="mb-1 text-sm text-slate-500">Workspace / Overview</p>
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl">Business overview</h2>
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
            <RefreshCw size={20} className={data.loading ? 'animate-spin' : ''} />
          </button>
        </header>

        <KpiSection
          stats={data.stats}
          loading={data.loading}
          lastUpdated={data.lastUpdated}
          error={data.errors.inventory}
          canEdit={canEdit}
        />

        <InventorySection
          vehicles={data.vehicles}
          stats={data.stats}
          loading={data.loading}
          lastUpdated={data.lastUpdated}
          error={data.errors.inventory}
          search={search}
          onSearch={setSearch}
          statusFilter={statusFilter}
          onStatusFilter={setStatusFilter}
          canEdit={canEdit}
          isAdmin={isAdmin}
          apiFetch={data.apiFetch}
          reload={reload}
        />

        <SalesServiceSection
          allVehicles={data.allVehicles}
          managedSales={data.managedSales}
          serviceJobs={data.serviceJobs}
          sales={data.sales}
          service={data.service}
          errors={data.errors}
          canEdit={canEdit}
          apiFetch={data.apiFetch}
          reload={reload}
        />

        <AnalyticsSection sales={data.sales} service={data.service} errors={data.errors} onRetry={refreshAll} />

        <InsightsSection apiGet={apiGet} refreshKey={data.lastUpdated} />

        <SystemStatusSection
          health={health}
          lastUpdated={data.lastUpdated}
          role={user.role}
          onCheck={() => void checkHealth()}
        />

        {isAdmin && <IngestionPanel logs={data.nifiLogs} error={data.errors.nifi} onRetry={refreshAll} />}

        {isAdmin && <AuditLogSection apiGet={apiGet} refreshKey={data.lastUpdated} />}

        <AccountSections user={user} onSignOut={() => onSignOut()}>
          {isAdmin && (
            <UserManagement
              apiGet={apiGet}
              apiFetch={data.apiFetch}
              currentUser={user}
              refreshKey={data.lastUpdated}
              onChanged={reload}
            />
          )}
        </AccountSections>

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <span>DataPulse — Automotive Intelligence Platform</span>
          <span>
            {health.api === 'down'
              ? 'API connection unavailable'
              : data.loading
                ? 'Refreshing data...'
                : 'Dashboard connected'}
          </span>
        </footer>
      </main>
    </div>
  )
}
