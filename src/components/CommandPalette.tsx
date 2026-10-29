import { useEffect, useMemo, useRef, useState } from 'react'
import { CarFront, CornerDownLeft, LogOut, Moon, RefreshCw, Search, Sun } from 'lucide-react'
import { navigation, statusLabels } from '../constants.ts'
import type { Id, Role, Vehicle } from '../types.ts'

type Item = {
  key: string
  group: 'Go to' | 'Vehicles' | 'Actions'
  label: string
  hint?: string
  icon: typeof Search
  run: () => void
}

type Props = {
  open: boolean
  onClose: () => void
  vehicles: Vehicle[]
  role: Role
  dark: boolean
  onNavigate: (href: string) => void
  onOpenVehicle: (id: Id) => void
  onRefresh: () => void
  onToggleTheme: () => void
  onSignOut: () => void
}

// Keyboard-first launcher (Ctrl/Cmd + K): jump to a section, open any
// vehicle's history or run an action.
export function CommandPalette({
  open,
  onClose,
  vehicles,
  role,
  dark,
  onNavigate,
  onOpenVehicle,
  onRefresh,
  onToggleTheme,
  onSignOut,
}: Props) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase()
    const matches = (text: string) => !q || text.toLowerCase().includes(q)

    const sections: Item[] = navigation
      .filter((item) => !item.adminOnly || role === 'admin')
      .filter((item) => matches(item.label))
      .map((item) => ({
        key: item.href,
        group: 'Go to',
        label: item.label,
        icon: item.icon,
        run: () => onNavigate(item.href),
      }))

    const cars: Item[] = (q ? vehicles : [])
      .filter((v) => matches(`${v.make} ${v.model} ${v.vin}`))
      .slice(0, 6)
      .map((v) => ({
        key: `vehicle-${v.id}`,
        group: 'Vehicles',
        label: `${v.make} ${v.model}`,
        hint: `${v.vin} · ${statusLabels[v.status]}`,
        icon: CarFront,
        run: () => onOpenVehicle(v.id),
      }))

    const actions: Item[] = [
      { key: 'refresh', group: 'Actions' as const, label: 'Refresh data', icon: RefreshCw, run: onRefresh },
      { key: 'theme', group: 'Actions' as const, label: dark ? 'Switch to light mode' : 'Switch to dark mode', icon: dark ? Sun : Moon, run: onToggleTheme },
      { key: 'signout', group: 'Actions' as const, label: 'Sign out', icon: LogOut, run: onSignOut },
    ].filter((item) => matches(item.label))

    return [...cars, ...sections, ...actions]
  }, [query, vehicles, role, dark, onNavigate, onOpenVehicle, onRefresh, onToggleTheme, onSignOut])

  if (!open) return null

  const active = Math.min(selected, Math.max(items.length - 1, 0))

  function choose(item: Item | undefined) {
    if (!item) return
    onClose()
    setQuery('')
    item.run()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]">
      <button type="button" aria-label="Close command palette" onClick={onClose} className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-slate-100 px-4">
          <Search size={18} className="text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setSelected(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setSelected((active + 1) % Math.max(items.length, 1))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setSelected((active - 1 + items.length) % Math.max(items.length, 1))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                choose(items[active])
              } else if (event.key === 'Escape') {
                onClose()
              }
            }}
            placeholder="Search vehicles, sections or actions…"
            aria-label="Search commands"
            className="h-14 w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <kbd className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500">Esc</kbd>
        </div>

        <ul role="listbox" aria-label="Results" className="max-h-80 overflow-y-auto p-2">
          {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">No matches</li>}
          {items.map((item, index) => {
            const Icon = item.icon
            const showGroup = index === 0 || items[index - 1].group !== item.group
            return (
              <li key={item.key}>
                {showGroup && (
                  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{item.group}</p>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  onMouseEnter={() => setSelected(index)}
                  onClick={() => choose(item)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${
                    index === active ? 'bg-cyan-50 text-cyan-900' : 'text-slate-700'
                  }`}
                >
                  <Icon size={16} className="shrink-0 text-slate-400" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.hint && <span className="truncate font-mono text-xs text-slate-400">{item.hint}</span>}
                  {index === active && <CornerDownLeft size={14} className="shrink-0 text-slate-400" />}
                </button>
              </li>
            )
          })}
        </ul>

        <div className="flex items-center gap-4 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">
          <span><kbd className="font-sans">↑ ↓</kbd> navigate</span>
          <span><kbd className="font-sans">Enter</kbd> open</span>
          <span><kbd className="font-sans">Ctrl K</kbd> toggle</span>
        </div>
      </div>
    </div>
  )
}
