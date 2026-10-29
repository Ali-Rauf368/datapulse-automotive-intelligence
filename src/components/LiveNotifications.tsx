import { Radio, X } from 'lucide-react'
import type { LiveChange } from '../hooks/useLiveUpdates.ts'

export function LiveNotifications({
  notifications,
  onDismiss,
}: {
  notifications: LiveChange[]
  onDismiss: (id: number) => void
}) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-80 max-w-[calc(100vw-2.5rem)] flex-col gap-2"
    >
      {notifications.map((item) => (
        <div
          key={item.id}
          role="status"
          className="pointer-events-auto flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
        >
          <span className="mt-0.5 rounded-lg bg-cyan-50 p-1.5 text-cyan-700">
            <Radio size={15} />
          </span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">{item.summary}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {item.actor ?? 'System'} · just now
            </p>
          </div>
          <button
            type="button"
            onClick={() => onDismiss(item.id)}
            aria-label="Dismiss notification"
            className="rounded p-0.5 text-slate-400 hover:text-slate-700"
          >
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  )
}
