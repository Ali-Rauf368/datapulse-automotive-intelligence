import { CarFront, CircleCheck, Euro, Info, ShieldCheck, TriangleAlert, Wrench } from 'lucide-react'
import { plural } from '../lib/format.ts'
import type { VehicleStats } from '../types.ts'

type Props = {
  stats: VehicleStats
  loading: boolean
  lastUpdated: string | null
  error: string | null
  canEdit: boolean
}

export function KpiSection({ stats, loading, lastUpdated, error, canEdit }: Props) {
  const metrics = [
    { label: 'Vehicles in inventory', value: stats.total, detail: 'Total records in PostgreSQL', icon: CarFront },
    { label: 'Active vehicles', value: stats.active, detail: 'Available for sale or service', icon: CircleCheck },
    { label: 'Sold vehicles', value: stats.sold, detail: 'Currently marked sold', icon: Euro },
    { label: 'In service', value: stats.in_service, detail: 'Currently in the workshop', icon: Wrench },
  ]

  const reconciliation = [
    stats.sold_without_sale > 0 &&
      `${plural(stats.sold_without_sale, 'vehicle')} marked Sold without a recorded sale`,
    stats.in_service_without_open_job > 0 &&
      `${plural(stats.in_service_without_open_job, 'vehicle')} marked In service without an open service job`,
  ].filter((item): item is string => Boolean(item))

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Key performance indicators</h3>
          <p className="mt-1 text-xs text-slate-500">Live inventory statistics from PostgreSQL.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-medium text-cyan-800">
          <ShieldCheck size={14} />
          Authenticated workspace
        </span>
      </div>

      <section
        aria-label="Key performance indicators"
        className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-4 ${reconciliation.length ? 'mb-4' : 'mb-8'}`}
      >
        {metrics.map(({ label, value, detail, icon: Icon }) => (
          <article
            key={label}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-500">{label}</p>
              <div className="rounded-xl bg-cyan-50 p-2 text-cyan-700">
                <Icon size={20} aria-hidden="true" />
              </div>
            </div>
            <p className="text-2xl font-bold tracking-tight">
              {error ? '—' : loading && !lastUpdated ? '…' : String(value)}
            </p>
            <div className="mt-2 flex items-start gap-1.5">
              {error ? (
                <TriangleAlert size={15} className="mt-0.5 shrink-0 text-amber-600" />
              ) : (
                <CircleCheck size={15} className="mt-0.5 shrink-0 text-emerald-600" />
              )}
              <p className="text-xs leading-5 text-slate-500">{error ? 'Data unavailable' : detail}</p>
            </div>
          </article>
        ))}
      </section>

      {reconciliation.length > 0 && !error && (
        <div
          role="note"
          className="mb-8 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <Info size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Inventory data check</p>
            <p className="mt-1 leading-6">
              {reconciliation.join(' and ')}. Their history is incomplete, so the sales and service
              totals below do not include them.
              {canEdit && ' Record the sale, or open and close a service job, to reconcile them.'}
            </p>
          </div>
        </div>
      )}
    </>
  )
}
