import { useCallback, useEffect, useState } from 'react'
import { Moon, RefreshCw, Search, Sun } from 'lucide-react'
import { CommandPalette } from './CommandPalette.tsx'
import { displayNameOf, formatMoney } from '../lib/format.ts'
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
import { useLiveUpdates } from '../hooks/useLiveUpdates.ts'
import { LiveNotifications } from './LiveNotifications.tsx'
import { VehicleHistoryDrawer } from './VehicleHistoryDrawer.tsx'
import type { Id, User } from '../types.ts'

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
  const live = useLiveUpdates({ token, currentEmail: user.email, onChange: reload })
  const [historyId, setHistoryId] = useState<Id | null>(null)
  const closeHistory = useCallback(() => setHistoryId(null), [])
  const [dark, setDark] = useState(readStoredTheme)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [greeting] = useState(greetingForNow)

  const toggleTheme = useCallback(() => {
    setDark((current) => {
      try {
        localStorage.setItem(THEME_KEY, current ? 'light' : 'dark')
      } catch {
        // Storage can be unavailable (private mode); the toggle still works.
      }
      return !current
    })
  }, [])

  const navigateTo = useCallback((href: string) => {
    setActiveSection(href)
    document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' })
  }, [setActiveSection])

  // Ctrl/Cmd + K opens the command palette from anywhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
  const firstName = (displayNameOf(user) ?? user.email.split('@')[0]).split(' ')[0]
  const openJobs = data.service.open + data.service.in_progress

  return (
    <div className="min-h-screen bg-slate-950 md:flex">
      <Sidebar
        user={user}
        activeSection={activeSection}
        onNavigate={setActiveSection}
        health={health}
        loading={data.loading}
        anyPanelError={anyPanelError}
        live={live.connected}
        dark={dark}
        onToggleTheme={toggleTheme}
        onOpenPalette={() => setPaletteOpen(true)}
        onSignOut={() => onSignOut()}
      />

      <div className={`min-h-screen min-w-0 flex-1 bg-slate-50 text-slate-900 ${dark ? 'theme-dark' : ''}`}>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        vehicles={data.allVehicles}
        role={user.role}
        dark={dark}
        onNavigate={navigateTo}
        onOpenVehicle={setHistoryId}
        onRefresh={refreshAll}
        onToggleTheme={toggleTheme}
        onSignOut={() => onSignOut()}
      />

      <LiveNotifications notifications={live.notifications} onDismiss={live.dismiss} />

      {historyId !== null && (
        <VehicleHistoryDrawer
          vehicleId={historyId}
          apiGet={apiGet}
          refreshKey={data.lastUpdated}
          onClose={closeHistory}
        />
      )}

      <main id="overview" className="min-w-0 scroll-mt-6 p-5 md:p-8">
        <header className="relative mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-7">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-cyan-100 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-sm text-slate-500">{greeting.date}</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">
                {greeting.text}, {firstName}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Here is your dealership today: inventory, sales, service and data operations.
              </p>
              <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Revenue</p>
                  <p className="text-lg font-semibold">{formatMoney(data.sales.totalRevenue)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Vehicles</p>
                  <p className="text-lg font-semibold">{data.stats.total}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Open service jobs</p>
                  <p className="text-lg font-semibold">{openJobs}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="hidden items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-500 shadow-sm transition-colors hover:bg-slate-50 sm:inline-flex"
              >
                <Search size={16} />
                Search anything
                <kbd className="rounded border border-slate-200 px-1.5 text-[11px]">Ctrl K</kbd>
              </button>
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
                title={dark ? 'Light mode' : 'Dark mode'}
                className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-colors hover:bg-slate-100"
              >
                {dark ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <button
                type="button"
                onClick={refreshAll}
                aria-label="Refresh dashboard data"
                title="Refresh dashboard data"
                className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-colors hover:bg-slate-100"
              >
                <RefreshCw size={20} className={data.loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
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
          onOpenHistory={setHistoryId}
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
    </div>
  )
}

const THEME_KEY = 'datapulse_theme'

function readStoredTheme(): boolean {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark'
  } catch {
    return false
  }
}

function greetingForNow() {
  const now = new Date()
  const hour = now.getHours()
  return {
    text: hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening',
    date: now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  }
}
