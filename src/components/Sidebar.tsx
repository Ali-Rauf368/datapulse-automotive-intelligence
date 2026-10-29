import { Activity, LogOut } from 'lucide-react'
import { navigation } from '../constants.ts'
import { displayNameOf } from '../lib/format.ts'
import type { Health, User } from '../types.ts'

type Props = {
  user: User
  activeSection: string
  onNavigate: (href: string) => void
  health: Health
  loading: boolean
  anyPanelError: boolean
  onSignOut: () => void
}

export function Sidebar({ user, activeSection, onNavigate, health, loading, anyPanelError, onSignOut }: Props) {
  const displayName = displayNameOf(user)
  const status =
    health.api === 'down'
      ? { dot: 'bg-rose-400', label: 'API unavailable' }
      : anyPanelError
        ? { dot: 'bg-amber-400', label: 'Some data unavailable' }
        : loading
          ? { dot: 'bg-cyan-400', label: 'Loading data' }
          : { dot: 'bg-emerald-400', label: 'Connected' }

  return (
    <aside className="bg-slate-950 p-6 text-white md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:overflow-y-auto">
      <div className="mb-10 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-400 text-slate-950">
          <Activity size={23} />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">DataPulse</h1>
          <p className="text-xs text-slate-400">Automotive Intelligence Platform</p>
        </div>
      </div>

      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Workspace</p>

      <nav aria-label="Main navigation" className="space-y-1">
        {navigation.map(({ label, icon: Icon, href }) => (
          <a
            key={label}
            href={href}
            onClick={() => onNavigate(href)}
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
          <span className={`h-2 w-2 rounded-full ${status.dot}`} />
          {status.label}
        </div>
        <p className="text-xs leading-5 text-slate-400">Signed-in API session.</p>
      </div>

      <div className="mt-4 rounded-xl border border-slate-800 p-4">
        {displayName && <p className="text-sm font-semibold">{displayName}</p>}
        <p className={`break-all text-sm ${displayName ? 'mt-0.5 text-slate-400' : 'font-medium'}`}>
          {user.email}
        </p>
        <p className="mt-1 text-xs text-cyan-300">
          {user.role.charAt(0).toUpperCase() + user.role.slice(1)} role
        </p>
        <button
          type="button"
          onClick={onSignOut}
          className="mt-4 inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white"
        >
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </aside>
  )
}
