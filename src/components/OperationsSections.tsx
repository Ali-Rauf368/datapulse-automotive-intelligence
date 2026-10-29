import { Activity, Clock, LogOut, Settings, ShieldCheck, Users, Workflow } from 'lucide-react'
import { displayNameOf, formatDateTime } from '../lib/format.ts'
import { cardClass } from '../constants.ts'
import { CheckIndicator, EmptyState, PanelError } from './ui.tsx'
import type { Health, NifiLog, User } from '../types.ts'

export function SystemStatusSection({
  health,
  lastUpdated,
  role,
  onCheck,
}: {
  health: Health
  lastUpdated: string | null
  role: string
  onCheck: () => void
}) {
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

  return (
    <section id="system-status" className={`${cardClass} scroll-mt-6`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">System status</h3>
          <p className="mt-1 text-sm text-slate-500">Live checks of the DataPulse API and PostgreSQL database</p>
        </div>
        <button
          type="button"
          onClick={onCheck}
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
            <p className="mt-1 text-xs text-slate-500">{lastUpdated ?? 'Not refreshed yet'}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <ShieldCheck size={18} className="shrink-0 text-cyan-600" />
          <div>
            <p className="text-sm font-medium">Access role</p>
            <p className="mt-1 text-xs capitalize text-slate-500">{role}</p>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-lg bg-slate-50 p-3">
        <p className="text-xs leading-5 text-slate-500">
          {health.checkedAt ? `Checked at ${health.checkedAt}; refreshes every 30 seconds. ` : ''}
          Data requests use a bearer token, and the API enforces permissions independently of these
          dashboard controls.
        </p>
      </div>
    </section>
  )
}

export function IngestionPanel({
  logs,
  error,
  onRetry,
}: {
  logs: NifiLog[] | null
  error: string | null
  onRetry: () => void
}) {
  const ingestion = logs ?? []
  const failures = ingestion.filter((log) => log.outcome === 'failure').length
  const latest = ingestion[0]

  return (
    <section id="data-ingestion" className={`${cardClass} mt-6`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Workflow size={20} className="mt-0.5 text-cyan-700" />
          <div>
            <h3 className="font-semibold">Data ingestion (Apache NiFi)</h3>
            <p className="mt-1 text-sm text-slate-500">
              Vehicle records sent to the API with a machine credential, such as a NiFi InvokeHTTP processor.
            </p>
          </div>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">Admin only</span>
      </div>

      {error ? (
        <div className="mt-5">
          <PanelError message={`Could not load ingestion logs: ${error}`} onRetry={onRetry} />
        </div>
      ) : ingestion.length === 0 ? (
        <div className="mt-5">
          <EmptyState icon={<Workflow size={28} />} title="No ingestion requests recorded">
            Requests made with a machine credential appear here once a flow starts sending vehicles.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">Last request</p>
              <p className="mt-1 text-sm font-semibold">{latest ? formatDateTime(latest.created_at) : '—'}</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">Accepted</p>
              <p className="mt-1 text-sm font-semibold text-emerald-700">{ingestion.length - failures}</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">Rejected</p>
              <p className={`mt-1 text-sm font-semibold ${failures ? 'text-rose-700' : ''}`}>{failures}</p>
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
                          log.outcome === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
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
        Shows what the API received over the last 100 requests. The NiFi flow itself runs and is monitored in NiFi.
      </p>
    </section>
  )
}

export function AccountSections({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const displayName = displayNameOf(user)
  const description =
    user.role === 'admin'
      ? 'You have administrator permissions, including deleting vehicles and viewing ingestion logs. New accounts always start with viewer access.'
      : user.role === 'operator'
        ? 'You can add and edit vehicles, record sales and manage service jobs. Deleting records is restricted to administrators.'
        : 'You have read-only access to inventory, sales, service and analytics.'

  return (
    <>
      <section id="users-roles" className={`${cardClass} mt-6 scroll-mt-6`}>
        <div className="flex items-center gap-3">
          <Users size={20} className="text-cyan-700" />
          <div>
            <h3 className="font-semibold">Users & roles</h3>
            <p className="mt-1 text-sm text-slate-500">Your current account access</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 p-4">
          <div>
            {displayName && <p className="text-sm font-semibold">{displayName}</p>}
            <p className="break-all text-sm">{user.email}</p>
            <p className="mt-1 text-xs capitalize text-slate-500">Role: {user.role}</p>
          </div>
          <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium capitalize text-cyan-800">
            {user.role}
          </span>
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-500">{description}</p>
      </section>

      <section id="settings" className={`${cardClass} mt-6 scroll-mt-6`}>
        <div className="flex items-center gap-3">
          <Settings size={20} className="text-slate-500" />
          <div>
            <h3 className="font-semibold">Session settings</h3>
            <p className="mt-1 text-sm text-slate-500">Manage the current browser session.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="mt-5 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium hover:bg-slate-50"
        >
          <LogOut size={16} /> Sign out
        </button>
      </section>
    </>
  )
}
