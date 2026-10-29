import type { ReactNode } from 'react'
import { CircleCheck, Info, RefreshCw, TriangleAlert } from 'lucide-react'
import type { CheckState, Notice } from '../types.ts'

export function NoticeMessage({ notice }: { notice: Notice | null }) {
  if (!notice) return null

  return notice.kind === 'success' ? (
    <p
      role="status"
      className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"
    >
      {notice.text}
    </p>
  ) : (
    <p
      role="alert"
      className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
    >
      {notice.text}
    </p>
  )
}

export function PanelError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
    >
      <span className="flex items-start gap-2">
        <TriangleAlert size={16} className="mt-0.5 shrink-0" />
        {message}
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md border border-rose-200 bg-white px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
      >
        Retry
      </button>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
      <div className="mb-3 text-slate-400">{icon}</div>
      <p className="font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">{children}</p>
    </div>
  )
}

export function CheckIndicator({ state }: { state: CheckState }) {
  if (state === 'ok') return <CircleCheck size={18} className="shrink-0 text-emerald-600" />
  if (state === 'down') return <TriangleAlert size={18} className="shrink-0 text-rose-600" />
  if (state === 'checking') {
    return <RefreshCw size={18} className="shrink-0 animate-spin text-slate-400" />
  }
  return <Info size={18} className="shrink-0 text-slate-400" />
}

export function Spinner({ size = 15 }: { size?: number }) {
  return <RefreshCw size={size} className="animate-spin" />
}
