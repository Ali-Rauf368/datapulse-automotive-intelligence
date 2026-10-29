import { ChartNoAxesCombined, Wrench } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatCompactMoney, formatDate, formatMoney, plural } from '../lib/format.ts'
import { cardClass } from '../constants.ts'
import { PanelError } from './ui.tsx'
import type { PanelErrors, SalesAnalytics, ServiceAnalytics } from '../types.ts'

type Props = {
  sales: SalesAnalytics
  service: ServiceAnalytics
  errors: PanelErrors
  onRetry: () => void
}

export function AnalyticsSection({ sales, service, errors, onRetry }: Props) {
  const chartData = sales.daily.map((item) => ({ ...item, label: formatDate(item.date) }))
  const hasRecentSales = sales.daily.some((day) => day.sales > 0)

  const serviceRows = [
    { label: 'Open', value: service.open, color: 'bg-amber-500' },
    { label: 'In progress', value: service.in_progress, color: 'bg-cyan-500' },
    { label: 'Completed', value: service.completed, color: 'bg-emerald-500' },
    { label: 'Cancelled', value: service.cancelled, color: 'bg-slate-400' },
  ]

  return (
    <section id="analytics" className="mb-8 grid scroll-mt-6 gap-6 xl:grid-cols-3">
      <article className={`${cardClass} xl:col-span-2`}>
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">Sales activity</h3>
            <p className="mt-1 text-sm text-slate-500">Daily recorded revenue · last seven days</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold">{formatMoney(sales.totalRevenue)}</p>
            <p className="text-xs text-slate-500">
              Total recorded revenue
              {sales.totalSales > 0 && ` · average ${formatMoney(sales.averageSale)}`}
            </p>
          </div>
        </div>

        {errors.sales ? (
          <PanelError message={`Could not load sales analytics: ${errors.sales}`} onRetry={onRetry} />
        ) : hasRecentSales ? (
          <div role="img" aria-label="Daily recorded revenue from the sales events database table" className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
                <Bar dataKey="revenue" name="Revenue" fill="#06b6d4" radius={[5, 5, 0, 0]} maxBarSize={42} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center">
            <ChartNoAxesCombined size={30} className="mb-3 text-slate-400" />
            <p className="font-medium">{sales.hasData ? 'No sales in the last seven days' : 'No sales data yet'}</p>
            <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">
              {sales.hasData
                ? 'Earlier sales are included in the totals above.'
                : 'Revenue appears here as sales are recorded. No sample sales are shown.'}
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap justify-between gap-2 text-xs text-slate-500">
          <span>{plural(sales.totalSales, 'recorded sale')}</span>
          <span>Source: PostgreSQL sales events</span>
        </div>
      </article>

      <article className={cardClass}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">Service activity</h3>
          <Wrench size={18} className="text-slate-400" />
        </div>
        <p className="mt-1 text-sm text-slate-500">Recorded service jobs by status</p>

        {errors.service ? (
          <div className="mt-6">
            <PanelError message={`Could not load service analytics: ${errors.service}`} onRetry={onRetry} />
          </div>
        ) : service.hasData ? (
          <div className="mt-6 space-y-4">
            {serviceRows.map((item) => (
              <div key={item.label}>
                <div className="mb-1.5 flex justify-between gap-3 text-sm">
                  <span className="text-slate-600">{item.label}</span>
                  <span className="font-semibold">{item.value}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${item.color}`}
                    style={{ width: `${service.total > 0 ? Math.min(100, (item.value / service.total) * 100) : 0}%` }}
                  />
                </div>
              </div>
            ))}
            <p className="border-t border-slate-100 pt-4 text-xs text-slate-500">
              {plural(service.total, 'recorded service job')}
            </p>
          </div>
        ) : (
          <div className="mt-6 flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 text-center">
            <Wrench size={28} className="mb-3 text-slate-400" />
            <p className="font-medium">No service data yet</p>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Service metrics appear when service jobs are recorded.
            </p>
          </div>
        )}
      </article>
    </section>
  )
}
