import { useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Clock, Euro, Receipt, Sparkles, TrendingUp, Wrench } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useResource } from '../hooks/useResource.ts'
import { formatCompactMoney, formatMoney, plural } from '../lib/format.ts'
import { cardClass } from '../constants.ts'
import { EmptyState, PanelError } from './ui.tsx'
import type { Insights, InsightsRange } from '../types.ts'

const ranges: Array<{ value: InsightsRange; label: string }> = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '12 months' },
  { value: 'all', label: 'All time' },
]

const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })

type Props = {
  apiGet: <T>(path: string, signal?: AbortSignal) => Promise<T>
  refreshKey: unknown
}

export function InsightsSection({ apiGet, refreshKey }: Props) {
  const [range, setRange] = useState<InsightsRange>('365')
  const { data, error, loading, reload } = useResource<Insights>(
    apiGet,
    `/analytics/insights?range=${range}`,
    refreshKey,
  )

  const tiles = [
    { label: 'Revenue', value: data ? formatMoney(data.revenue) : '…', icon: Euro, change: data?.change.revenue },
    { label: 'Vehicles sold', value: data ? String(data.sales) : '…', icon: Receipt, change: data?.change.sales },
    {
      label: 'Avg. days in stock',
      value: data ? (data.averageDaysInStock === null ? '—' : `${data.averageDaysInStock} days`) : '…',
      icon: Clock,
    },
    {
      label: 'Avg. service turnaround',
      value: data ? (data.averageServiceHours === null ? '—' : `${data.averageServiceHours} h`) : '…',
      icon: Wrench,
    },
  ]
  const topRevenue = data?.topMakes[0]?.revenue ?? 0

  return (
    <section id="insights" className={`${cardClass} mb-8 scroll-mt-6`}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <TrendingUp size={20} className="mt-0.5 text-cyan-700" />
          <div>
            <h3 className="font-semibold">Business insights</h3>
            <p className="mt-1 text-sm text-slate-500">Revenue trend, best sellers and operational speed.</p>
          </div>
        </div>
        <div role="group" aria-label="Insights period" className="inline-flex rounded-lg border border-slate-200 p-0.5">
          {ranges.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={range === option.value}
              onClick={() => setRange(option.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                range === option.value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <PanelError message={`Could not load insights: ${error}`} onRetry={reload} />
      ) : (
        <div className={loading && data ? 'opacity-60 transition-opacity' : ''}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {tiles.map((tile) => {
              const Icon = tile.icon
              const change = 'change' in tile ? tile.change : undefined
              return (
                <div key={tile.label} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-500">{tile.label}</p>
                    <Icon size={16} className="text-slate-400" />
                  </div>
                  <p className="mt-2 text-xl font-bold tracking-tight">{tile.value}</p>
                  {typeof change === 'number' && (
                    <p
                      className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                        change >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                      }`}
                      title="Compared with the previous period of the same length"
                    >
                      {change >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                      {Math.abs(change)}% vs previous
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {data && data.highlights.length > 0 && (
            <div className="mt-5 rounded-xl border border-cyan-200 bg-cyan-50 p-4">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-cyan-900">
                <Sparkles size={16} /> Highlights
              </p>
              <ul className="space-y-1.5 text-sm text-slate-700">
                {data.highlights.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-500" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data && data.sales === 0 ? (
            <div className="mt-6">
              <EmptyState icon={<TrendingUp size={28} />} title="No sales in this period">
                Choose a longer period or record a sale.
              </EmptyState>
            </div>
          ) : data ? (
            <div className="mt-6 grid gap-6 lg:grid-cols-5">
              <div className="lg:col-span-3">
                <p className="mb-3 text-sm font-medium">Revenue by month</p>
                <div role="img" aria-label="Revenue by month" className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.monthly.map((m) => ({ ...m, label: monthLabel(m.month) }))}
                      margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={64}
                        tick={{ fontSize: 12, fill: '#64748b' }}
                        tickFormatter={(value: number) => formatCompactMoney(value)}
                      />
                      <Tooltip
                        formatter={(value, _name, item) => [
                          formatMoney(Number(value)),
                          `Revenue (${plural(Number(item?.payload?.sales ?? 0), 'sale')})`,
                        ]}
                        contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                      />
                      <Bar dataKey="revenue" fill="#0e7490" radius={[5, 5, 0, 0]} maxBarSize={48} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="lg:col-span-2">
                <p className="mb-3 text-sm font-medium">Top makes by revenue</p>
                <ol className="space-y-3">
                  {data.topMakes.map((make, index) => (
                    <li key={make.make}>
                      <div className="mb-1 flex justify-between gap-3 text-sm">
                        <span>
                          <span className="mr-2 text-slate-400">{index + 1}.</span>
                          {make.make}
                          <span className="ml-2 text-xs text-slate-400">{plural(make.sales, 'sale')}</span>
                        </span>
                        <span className="font-semibold">{formatMoney(make.revenue)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-cyan-500"
                          style={{ width: `${topRevenue ? (make.revenue / topRevenue) * 100 : 0}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}
