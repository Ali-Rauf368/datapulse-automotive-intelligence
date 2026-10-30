import { useState } from 'react'
import { Activity, LogOut, Menu, Moon, Search, Sun, X } from 'lucide-react'
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
  live: boolean
  dark: boolean
  onToggleTheme: () => void
  onOpenPalette: () => void
  onSignOut: () => void
}

export function Sidebar({
  user,
  activeSection,
  onNavigate,
  health,
  loading,
  anyPanelError,
  live,
  dark,
  onToggleTheme,
  onOpenPalette,
  onSignOut,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
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
    <aside className="sticky top-0 z-30 bg-slate-950 px-5 py-4 text-white md:h-screen md:w-64 md:shrink-0 md:overflow-y-auto md:p-6">
      <div className="flex items-center gap-3 md:mb-10">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-400 text-slate-950">
          <Activity size={23} />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold tracking-tight">DataPulse</h1>
          <p className="text-xs text-slate-400">Automotive Intelligence Platform</p>
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="sidebar-menu"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 md:hidden"
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* On phones the menu folds away behind the button above. */}
      <div id="sidebar-menu" className={`${menuOpen ? 'mt-5 block' : 'hidden'} md:mt-0 md:block`}>

      <button
        type="button"
        onClick={onOpenPalette}
        className="mb-6 flex w-full items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-400 transition-colors hover:border-slate-700 hover:text-slate-200"
      >
        <Search size={15} />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="rounded border border-slate-700 px-1.5 text-[10px]">Ctrl K</kbd>
      </button>

      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Workspace</p>

      <nav aria-label="Main navigation" className="space-y-1">
        {navigation
          .filter((item) => !item.adminOnly || user.role === 'admin')
          .map(({ label, icon: Icon, href }) => (
          <a
            key={label}
            href={href}
            onClick={() => {
              onNavigate(href)
              setMenuOpen(false)
            }}
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
        <p className="flex items-center gap-1.5 text-xs leading-5 text-slate-400">
          <span className={`h-1.5 w-1.5 rounded-full ${live ? 'animate-pulse bg-cyan-400' : 'bg-slate-600'}`} />
          {live ? 'Live updates on' : 'Live updates reconnecting…'}
        </p>
      </div>

      <div className="mt-4 rounded-xl border border-slate-800 p-4">
        {displayName && <p className="text-sm font-semibold">{displayName}</p>}
        <p className={`break-all text-sm ${displayName ? 'mt-0.5 text-slate-400' : 'font-medium'}`}>
          {user.email}
        </p>
        <p className="mt-1 text-xs text-cyan-300">
          {user.role.charAt(0).toUpperCase() + user.role.slice(1)} role
        </p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white"
          >
            <LogOut size={16} /> Sign out
          </button>
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </div>
      </div>
    </aside>
  )
}
