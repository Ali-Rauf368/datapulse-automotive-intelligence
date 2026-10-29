import { useState } from 'react'
import { History, RefreshCw, UserCog } from 'lucide-react'
import { useResource } from '../hooks/useResource.ts'
import { SessionExpiredError, errorMessage, readJson } from '../lib/api.ts'
import { formatDate, formatDateTime, sameId } from '../lib/format.ts'
import { cardClass } from '../constants.ts'
import { EmptyState, NoticeMessage, PanelError } from './ui.tsx'
import type { ApiFetch } from '../hooks/useDashboardData.ts'
import type { AppUser, AuditEntry, Id, Notice, Role, User } from '../types.ts'

type Getter = <T>(path: string, signal?: AbortSignal) => Promise<T>

const roleOptions: Role[] = ['viewer', 'operator', 'admin']

export function UserManagement({
  apiGet,
  apiFetch,
  currentUser,
  refreshKey,
  onChanged,
}: {
  apiGet: Getter
  apiFetch: ApiFetch
  currentUser: User
  refreshKey: unknown
  onChanged: () => void
}) {
  const { data: users, error, reload } = useResource<AppUser[]>(apiGet, '/users', refreshKey)
  const [savingId, setSavingId] = useState<Id | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  async function update(user: AppUser, change: { role?: Role; active?: boolean }) {
    setNotice(null)
    setSavingId(user.id)

    try {
      await readJson(await apiFetch(`/users/${user.id}`, { method: 'PATCH', body: JSON.stringify(change) }))
      setNotice({
        kind: 'success',
        text:
          change.role !== undefined
            ? `${user.email} is now ${change.role}.`
            : `${user.email} was ${change.active ? 'reactivated' : 'deactivated'}.`,
      })
      reload()
      onChanged()
    } catch (caught) {
      if (caught instanceof SessionExpiredError) return
      setNotice({ kind: 'error', text: errorMessage(caught, 'Could not update the user.') })
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center gap-2">
        <UserCog size={18} className="text-cyan-700" />
        <h4 className="font-semibold">Manage users</h4>
      </div>
      {notice && (
        <div className="mb-3">
          <NoticeMessage notice={notice} />
        </div>
      )}
      {error ? (
        <PanelError message={`Could not load users: ${error}`} onRetry={reload} />
      ) : !users ? (
        <p className="flex items-center gap-2 py-4 text-sm text-slate-500">
          <RefreshCw size={15} className="animate-spin" /> Loading users…
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-y border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="py-2 pr-4 font-medium">User</th>
                <th scope="col" className="px-4 py-2 font-medium">Joined</th>
                <th scope="col" className="px-4 py-2 font-medium">Role</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Access</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => {
                const self = sameId(user.id, currentUser.id)
                const busy = sameId(savingId, user.id)

                return (
                  <tr key={user.id} className={user.active ? '' : 'text-slate-400'}>
                    <td className="py-3 pr-4">
                      <p className="font-medium">
                        {user.name}
                        {self && <span className="ml-2 text-xs font-normal text-cyan-700">(you)</span>}
                      </p>
                      <p className="text-xs text-slate-500">{user.email}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(user.created_at)}</td>
                    <td className="px-4 py-3">
                      <select
                        aria-label={`Role for ${user.email}`}
                        value={user.role}
                        disabled={self || busy || !user.active}
                        onChange={(event) => void update(user, { role: event.target.value as Role })}
                        className="rounded-lg border border-slate-300 bg-white p-1.5 text-sm capitalize disabled:bg-slate-50"
                      >
                        {roleOptions.map((role) => (
                          <option key={role} value={role}>{role}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {self ? (
                        <span className="text-xs text-slate-400">Your account</span>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void update(user, { active: !user.active })}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                            user.active
                              ? 'border-rose-200 text-rose-700 hover:bg-rose-50'
                              : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                          }`}
                        >
                          {user.active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs leading-5 text-slate-500">
        Changes apply on the user’s next request. You cannot change your own account, and at least one
        active administrator is always kept.
      </p>
    </div>
  )
}

const entityFilters = [
  { value: '', label: 'All activity' },
  { value: 'vehicle', label: 'Vehicles' },
  { value: 'sale', label: 'Sales' },
  { value: 'service_job', label: 'Service' },
  { value: 'user', label: 'Users' },
]

const actionStyles: Record<string, string> = {
  vehicle: 'bg-cyan-50 text-cyan-700',
  sale: 'bg-emerald-50 text-emerald-700',
  service_job: 'bg-amber-50 text-amber-700',
  user: 'bg-violet-50 text-violet-700',
}

export function AuditLogSection({ apiGet, refreshKey }: { apiGet: Getter; refreshKey: unknown }) {
  const [entity, setEntity] = useState('')
  const { data, error, reload } = useResource<AuditEntry[]>(
    apiGet,
    `/audit?limit=25${entity ? `&entity=${entity}` : ''}`,
    refreshKey,
  )

  return (
    <section id="activity" className={`${cardClass} mt-6 scroll-mt-6`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <History size={20} className="mt-0.5 text-cyan-700" />
          <div>
            <h3 className="font-semibold">Activity log</h3>
            <p className="mt-1 text-sm text-slate-500">Who changed what and when, recorded with each change.</p>
          </div>
        </div>
        <select
          aria-label="Filter activity"
          value={entity}
          onChange={(event) => setEntity(event.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          {entityFilters.map((filter) => (
            <option key={filter.value} value={filter.value}>{filter.label}</option>
          ))}
        </select>
      </div>

      {error ? (
        <PanelError message={`Could not load activity: ${error}`} onRetry={reload} />
      ) : data && data.length === 0 ? (
        <EmptyState icon={<History size={28} />} title="No activity yet">
          Sales, service updates, vehicle edits and role changes appear here.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-slate-100">
          {(data ?? []).map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
              <div className="min-w-0">
                <p>
                  <span className={`mr-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${actionStyles[entry.entity] ?? 'bg-slate-100 text-slate-600'}`}>
                    {entry.action}
                  </span>
                  {entry.summary}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {entry.actor_kind === 'machine' ? 'NiFi machine credential' : entry.actor_email ?? 'System'}
                </p>
              </div>
              <span className="shrink-0 text-xs text-slate-500">{formatDateTime(entry.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
