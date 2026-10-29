import { useEffect } from 'react'
import { CarFront, CirclePlus, Euro, Pencil, RefreshCw, Trash2, Wrench, X } from 'lucide-react'
import { useResource } from '../hooks/useResource.ts'
import { formatDateTime } from '../lib/format.ts'
import { statusLabels, statusStyles } from '../constants.ts'
import { PanelError } from './ui.tsx'
import type { Id, Vehicle } from '../types.ts'

type TimelineEvent = {
  at: string
  kind: 'added' | 'edited' | 'sold' | 'service' | 'deleted'
  title: string
  actor: string | null
}

const kindStyle = {
  added: { icon: CirclePlus, color: 'bg-cyan-50 text-cyan-700' },
  edited: { icon: Pencil, color: 'bg-slate-100 text-slate-600' },
  sold: { icon: Euro, color: 'bg-emerald-50 text-emerald-700' },
  service: { icon: Wrench, color: 'bg-amber-50 text-amber-700' },
  deleted: { icon: Trash2, color: 'bg-rose-50 text-rose-700' },
}

export function VehicleHistoryDrawer({
  vehicleId,
  apiGet,
  refreshKey,
  onClose,
}: {
  vehicleId: Id
  apiGet: <T>(path: string, signal?: AbortSignal) => Promise<T>
  refreshKey: unknown
  onClose: () => void
}) {
  const { data, error, reload } = useResource<{ vehicle: Vehicle; events: TimelineEvent[] }>(
    apiGet,
    `/vehicles/${vehicleId}/history`,
    refreshKey,
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button type="button" aria-label="Close vehicle history" onClick={onClose} className="absolute inset-0 bg-slate-950/30" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Vehicle history"
        className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
              <CarFront size={22} />
            </div>
            <div>
              <h3 className="font-semibold">
                {data ? `${data.vehicle.make} ${data.vehicle.model}` : 'Vehicle history'}
              </h3>
              {data && (
                <p className="mt-0.5 font-mono text-xs text-slate-500">
                  {data.vehicle.vin} · {data.vehicle.model_year}
                </p>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 p-6">
          {error ? (
            <PanelError message={`Could not load history: ${error}`} onRetry={reload} />
          ) : !data ? (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <RefreshCw size={15} className="animate-spin" /> Loading history…
            </p>
          ) : (
            <>
              <p className="mb-6 text-sm text-slate-600">
                Current status:{' '}
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[data.vehicle.status]}`}>
                  {statusLabels[data.vehicle.status]}
                </span>
              </p>
              <ol className="relative space-y-6 border-l border-slate-200 pl-6">
                {data.events.map((event, index) => {
                  const { icon: Icon, color } = kindStyle[event.kind]
                  return (
                    <li key={`${event.at}-${index}`} className="relative">
                      <span className={`absolute -left-[37px] flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white ${color}`}>
                        <Icon size={13} />
                      </span>
                      <p className="text-sm font-medium">{event.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatDateTime(event.at)}
                        {event.actor && ` · ${event.actor}`}
                      </p>
                    </li>
                  )
                })}
              </ol>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}
