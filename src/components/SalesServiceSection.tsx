import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Download, Euro, Receipt, RefreshCw, Wrench } from 'lucide-react'
import { SessionExpiredError, errorMessage, readJson } from '../lib/api.ts'
import { downloadCsv } from '../lib/csv.ts'
import { describeVehicle, formatDate, formatMoney, plural, saleOptionLabel, sameId } from '../lib/format.ts'
import {
  cardClass,
  inputClass,
  labelClass,
  nextServiceStatuses,
  primaryButtonClass,
  serviceStatusLabels,
  serviceStatusStyles,
  serviceSuggestions,
  statusLabels,
} from '../constants.ts'
import { EmptyState, NoticeMessage, PanelError } from './ui.tsx'
import type { ApiFetch } from '../hooks/useDashboardData.ts'
import type {
  Id,
  ManagedSale,
  Notice,
  PanelErrors,
  SalesAnalytics,
  ServiceAnalytics,
  ServiceJob,
  ServiceStatus,
  Vehicle,
} from '../types.ts'

type Props = {
  allVehicles: Vehicle[]
  managedSales: ManagedSale[]
  serviceJobs: ServiceJob[]
  sales: SalesAnalytics
  service: ServiceAnalytics
  errors: PanelErrors
  canEdit: boolean
  apiFetch: ApiFetch
  reload: () => Promise<void>
}

const today = () => new Date().toISOString().slice(0, 10)

export function SalesServiceSection({
  allVehicles,
  managedSales,
  serviceJobs,
  sales,
  service,
  errors,
  canEdit,
  apiFetch,
  reload,
}: Props) {
  const [saleVehicleId, setSaleVehicleId] = useState('')
  const [saleAmount, setSaleAmount] = useState('')
  const [saleSubmitting, setSaleSubmitting] = useState(false)
  const [saleNotice, setSaleNotice] = useState<Notice | null>(null)
  const [serviceVehicleId, setServiceVehicleId] = useState('')
  const [serviceDescription, setServiceDescription] = useState('')
  const [serviceSubmitting, setServiceSubmitting] = useState(false)
  const [serviceNotice, setServiceNotice] = useState<Notice | null>(null)
  const [updatingJobId, setUpdatingJobId] = useState<Id | null>(null)
  const [jobsNotice, setJobsNotice] = useState<Notice | null>(null)

  const soldVehicleIds = useMemo(
    () => new Set(managedSales.map((sale) => String(sale.vehicle_id))),
    [managedSales],
  )

  const openJobVehicleIds = useMemo(
    () =>
      new Set(
        serviceJobs
          .filter((job) => job.status === 'open' || job.status === 'in_progress')
          .map((job) => String(job.vehicle_id)),
      ),
    [serviceJobs],
  )

  // A vehicle can be sold once: no recorded sale and no open service job.
  const saleCandidates = useMemo(
    () =>
      allVehicles.filter(
        (vehicle) => !soldVehicleIds.has(String(vehicle.id)) && !openJobVehicleIds.has(String(vehicle.id)),
      ),
    [allVehicles, openJobVehicleIds, soldVehicleIds],
  )

  const serviceCandidates = useMemo(
    () => allVehicles.filter((vehicle) => vehicle.status !== 'sold'),
    [allVehicles],
  )

  async function handleRecordSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaleNotice(null)

    const amount = Number(saleAmount)
    const vehicle = allVehicles.find((item) => sameId(item.id, saleVehicleId))

    if (!vehicle) {
      setSaleNotice({ kind: 'error', text: 'Choose a vehicle to sell.' })
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setSaleNotice({ kind: 'error', text: 'Enter a sale price greater than €0.' })
      return
    }

    setSaleSubmitting(true)

    try {
      const response = await apiFetch('/sales', {
        method: 'POST',
        body: JSON.stringify({ vehicle_id: Number(vehicle.id), amount }),
      })
      await readJson<ManagedSale>(response)
      setSaleAmount('')
      setSaleVehicleId('')
      setSaleNotice({
        kind: 'success',
        text: `Sale recorded: ${vehicle.make} ${vehicle.model} for ${formatMoney(amount)}. The vehicle is now marked Sold.`,
      })
      await reload()
    } catch (error) {
      if (error instanceof SessionExpiredError) return
      setSaleNotice({ kind: 'error', text: errorMessage(error, 'Could not record the sale.') })
    } finally {
      setSaleSubmitting(false)
    }
  }

  async function handleCreateService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setServiceNotice(null)

    const description = serviceDescription.trim()
    const vehicle = allVehicles.find((item) => sameId(item.id, serviceVehicleId))

    if (!vehicle) {
      setServiceNotice({ kind: 'error', text: 'Choose a vehicle for the service job.' })
      return
    }
    if (!description) {
      setServiceNotice({ kind: 'error', text: 'Describe the work to be done.' })
      return
    }

    setServiceSubmitting(true)

    try {
      const response = await apiFetch('/service', {
        method: 'POST',
        body: JSON.stringify({ vehicle_id: Number(vehicle.id), description }),
      })
      await readJson<ServiceJob>(response)
      setServiceDescription('')
      setServiceVehicleId('')
      setServiceNotice({
        kind: 'success',
        text: `Service job opened for ${vehicle.make} ${vehicle.model}. The vehicle is now In service.`,
      })
      await reload()
    } catch (error) {
      if (error instanceof SessionExpiredError) return
      setServiceNotice({ kind: 'error', text: errorMessage(error, 'Could not create the service job.') })
    } finally {
      setServiceSubmitting(false)
    }
  }

  async function handleServiceStatus(job: ServiceJob, status: ServiceStatus) {
    if (status === job.status) return

    setJobsNotice(null)
    setUpdatingJobId(job.id)

    try {
      const response = await apiFetch(`/service/${job.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      await readJson<ServiceJob>(response)
      setJobsNotice({
        kind: 'success',
        text: `${describeVehicle(job)}: service job marked ${serviceStatusLabels[status].toLowerCase()}.`,
      })
      await reload()
    } catch (error) {
      if (error instanceof SessionExpiredError) return
      setJobsNotice({ kind: 'error', text: errorMessage(error, 'Could not update the service job.') })
    } finally {
      setUpdatingJobId(null)
    }
  }

  function exportSales() {
    downloadCsv(
      `datapulse-sales-${today()}.csv`,
      ['Sale ID', 'Sold at', 'Make', 'Model', 'VIN', 'Amount (EUR)'],
      managedSales.map((s) => [s.id, s.sold_at, s.make, s.model, s.vin, Number(s.amount).toFixed(2)]),
    )
  }

  function exportService() {
    downloadCsv(
      `datapulse-service-jobs-${today()}.csv`,
      ['Job ID', 'Status', 'Make', 'Model', 'VIN', 'Description', 'Opened', 'Completed'],
      serviceJobs.map((j) => [
        j.id,
        serviceStatusLabels[j.status],
        j.make,
        j.model,
        j.vin,
        j.description,
        j.opened_at,
        j.completed_at,
      ]),
    )
  }

  const exportButton = (label: string, onClick: () => void, disabled: boolean) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
    >
      <Download size={16} />
    </button>
  )

  return (
    <section id="sales-service" className="mb-8 scroll-mt-6">
      <div className="mb-5">
        <h3 className="font-semibold">Sales & service</h3>
        <p className="mt-1 text-sm text-slate-500">
          Record vehicle sales and manage service jobs. Vehicle status updates automatically.
        </p>
      </div>

      {canEdit ? (
        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          <form onSubmit={handleRecordSale} className={`${cardClass} space-y-4`}>
            <div className="flex items-center justify-between gap-3">
              <h4 className="font-semibold">Record a sale</h4>
              <Euro size={18} className="text-slate-400" />
            </div>
            <div>
              <label htmlFor="sale-vehicle" className={labelClass}>Vehicle</label>
              <select
                id="sale-vehicle"
                required
                disabled={saleSubmitting}
                value={saleVehicleId}
                onChange={(event) => {
                  setSaleVehicleId(event.target.value)
                  setSaleNotice(null)
                }}
                className={inputClass}
              >
                <option value="">
                  {saleCandidates.length ? 'Select a vehicle to sell' : 'No vehicles available to sell'}
                </option>
                {saleCandidates.map((vehicle) => (
                  <option key={vehicle.id} value={String(vehicle.id)}>
                    {saleOptionLabel(vehicle)}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-slate-500">
                Vehicles in the workshop can be sold once their service job is closed.
              </p>
            </div>
            <div>
              <label htmlFor="sale-amount" className={labelClass}>Sale price (€)</label>
              <input
                id="sale-amount"
                required
                min="0.01"
                step="0.01"
                type="number"
                inputMode="decimal"
                placeholder="e.g. 24990"
                disabled={saleSubmitting}
                value={saleAmount}
                onChange={(event) => {
                  setSaleAmount(event.target.value)
                  setSaleNotice(null)
                }}
                className={inputClass}
              />
            </div>
            <NoticeMessage notice={saleNotice} />
            <button type="submit" disabled={saleSubmitting} className={primaryButtonClass}>
              {saleSubmitting && <RefreshCw size={15} className="animate-spin" />}
              {saleSubmitting ? 'Recording sale...' : 'Record sale'}
            </button>
          </form>

          <form onSubmit={handleCreateService} className={`${cardClass} space-y-4`}>
            <div className="flex items-center justify-between gap-3">
              <h4 className="font-semibold">Create service job</h4>
              <Wrench size={18} className="text-slate-400" />
            </div>
            <div>
              <label htmlFor="service-vehicle" className={labelClass}>Vehicle</label>
              <select
                id="service-vehicle"
                required
                disabled={serviceSubmitting}
                value={serviceVehicleId}
                onChange={(event) => {
                  setServiceVehicleId(event.target.value)
                  setServiceNotice(null)
                }}
                className={inputClass}
              >
                <option value="">
                  {serviceCandidates.length ? 'Select a vehicle' : 'No vehicles available for service'}
                </option>
                {serviceCandidates.map((vehicle) => (
                  <option key={vehicle.id} value={String(vehicle.id)}>
                    {vehicle.make} {vehicle.model} · {vehicle.vin} ({statusLabels[vehicle.status]})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="service-description" className={labelClass}>Description</label>
              <textarea
                id="service-description"
                required
                maxLength={2000}
                rows={3}
                disabled={serviceSubmitting}
                value={serviceDescription}
                onChange={(event) => {
                  setServiceDescription(event.target.value)
                  setServiceNotice(null)
                }}
                placeholder="Work to be carried out"
                className={inputClass}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {serviceSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    disabled={serviceSubmitting}
                    onClick={() => setServiceDescription(suggestion)}
                    className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
            <NoticeMessage notice={serviceNotice} />
            <button type="submit" disabled={serviceSubmitting} className={primaryButtonClass}>
              {serviceSubmitting && <RefreshCw size={15} className="animate-spin" />}
              {serviceSubmitting ? 'Creating job...' : 'Create service job'}
            </button>
          </form>
        </div>
      ) : (
        <p className="mb-6 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          Your account has read-only access. Admins and operators can record sales and manage service jobs.
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <article className={cardClass}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h4 className="font-semibold">Recent sales</h4>
              <p className="mt-1 text-xs text-slate-500">
                {plural(sales.totalSales, 'recorded sale')} · {formatMoney(sales.totalRevenue)} revenue
              </p>
            </div>
            <div className="flex items-center gap-1">
              {exportButton('Export sales as CSV', exportSales, managedSales.length === 0)}
              <Receipt size={18} className="text-slate-400" />
            </div>
          </div>
          {errors.sales ? (
            <PanelError message={`Could not load sales: ${errors.sales}`} onRetry={() => void reload()} />
          ) : managedSales.length ? (
            <ul className="divide-y divide-slate-100">
              {managedSales.slice(0, 8).map((sale) => (
                <li key={sale.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{describeVehicle(sale)}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      <span className="font-mono">{sale.vin ?? 'VIN unavailable'}</span> · {formatDate(sale.sold_at)}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold">{formatMoney(Number(sale.amount))}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Receipt size={28} />} title="No sales recorded yet">
              Recorded sales appear here with their price and date.
            </EmptyState>
          )}
        </article>

        <article className={cardClass}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h4 className="font-semibold">Service jobs</h4>
              <p className="mt-1 text-xs text-slate-500">
                {service.open + service.in_progress} open · {service.completed} completed
              </p>
            </div>
            <div className="flex items-center gap-1">
              {exportButton('Export service jobs as CSV', exportService, serviceJobs.length === 0)}
              <Wrench size={18} className="text-slate-400" />
            </div>
          </div>
          {jobsNotice && (
            <div className="mb-3">
              <NoticeMessage notice={jobsNotice} />
            </div>
          )}
          {errors.service ? (
            <PanelError message={`Could not load service jobs: ${errors.service}`} onRetry={() => void reload()} />
          ) : serviceJobs.length ? (
            <ul className="divide-y divide-slate-100">
              {serviceJobs.slice(0, 8).map((job) => {
                const isOpen = job.status === 'open' || job.status === 'in_progress'

                return (
                  <li key={job.id} className="py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {describeVehicle(job)}
                          <span className="ml-2 font-mono text-xs font-normal text-slate-400">{job.vin}</span>
                        </p>
                        <p className="mt-1 text-sm text-slate-600">{job.description}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          Opened {formatDate(job.opened_at)}
                          {job.completed_at && ` · Completed ${formatDate(job.completed_at)}`}
                        </p>
                      </div>
                      {canEdit && isOpen ? (
                        <div className="flex items-center gap-2">
                          {sameId(updatingJobId, job.id) && (
                            <RefreshCw size={14} className="animate-spin text-slate-400" />
                          )}
                          <select
                            aria-label={`Status for service job ${job.id}`}
                            value={job.status}
                            disabled={updatingJobId !== null}
                            onChange={(event) => void handleServiceStatus(job, event.target.value as ServiceStatus)}
                            className="rounded-lg border border-slate-300 bg-white p-2 text-sm"
                          >
                            {nextServiceStatuses[job.status as 'open' | 'in_progress'].map((status) => (
                              <option key={status} value={status}>
                                {serviceStatusLabels[status]}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${serviceStatusStyles[job.status]}`}>
                          {serviceStatusLabels[job.status]}
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState icon={<Wrench size={28} />} title="No service jobs yet">
              Service jobs appear here with their status and dates.
            </EmptyState>
          )}
        </article>
      </div>
    </section>
  )
}
