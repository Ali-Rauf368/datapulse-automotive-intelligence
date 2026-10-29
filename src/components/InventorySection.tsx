import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CarFront,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { SessionExpiredError, errorMessage, readJson } from '../lib/api.ts'
import { downloadCsv } from '../lib/csv.ts'
import { sameId } from '../lib/format.ts'
import { cardClass, inputClass, labelClass, secondaryButtonClass, statusLabels, statusStyles } from '../constants.ts'
import { PanelError } from './ui.tsx'
import type { ApiFetch } from '../hooks/useDashboardData.ts'
import type { Id, Vehicle, VehicleStats } from '../types.ts'

const PAGE_SIZE = 10

type SortKey = 'vehicle' | 'model_year' | 'status' | 'id'

type VehicleForm = { vin: string; make: string; model: string; model_year: string }

const emptyForm: VehicleForm = {
  vin: '',
  make: '',
  model: '',
  model_year: String(new Date().getFullYear()),
}

const sortValue: Record<SortKey, (vehicle: Vehicle) => string | number> = {
  vehicle: (v) => `${v.make} ${v.model}`.toLowerCase(),
  model_year: (v) => Number(v.model_year),
  status: (v) => statusLabels[v.status],
  id: (v) => Number(v.id),
}

function SortIcon({ active, direction }: { active: boolean; direction: 'asc' | 'desc' }) {
  if (!active) return <ArrowUpDown size={12} className="opacity-40" />
  return direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
}

type Props = {
  vehicles: Vehicle[]
  stats: VehicleStats
  loading: boolean
  lastUpdated: string | null
  error: string | null
  search: string
  onSearch: (value: string) => void
  statusFilter: string
  onStatusFilter: (value: string) => void
  canEdit: boolean
  isAdmin: boolean
  apiFetch: ApiFetch
  reload: () => Promise<void>
}

export function InventorySection({
  vehicles,
  stats,
  loading,
  lastUpdated,
  error,
  search,
  onSearch,
  statusFilter,
  onStatusFilter,
  canEdit,
  isAdmin,
  apiFetch,
  reload,
}: Props) {
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'id', direction: 'asc' })
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Vehicle | null>(null)
  const [form, setForm] = useState<VehicleForm>(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<Id | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const sorted = useMemo(() => {
    const read = sortValue[sort.key]
    const factor = sort.direction === 'asc' ? 1 : -1
    return [...vehicles].sort((a, b) => {
      const x = read(a)
      const y = read(b)
      return (x < y ? -1 : x > y ? 1 : 0) * factor
    })
  }, [vehicles, sort])

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const visible = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    )
    setPage(1)
  }

  function updateForm<K extends keyof VehicleForm>(field: K, value: VehicleForm[K]) {
    setForm((current) => ({ ...current, [field]: value }))
    setFormError(null)
    setSuccess(null)
  }

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setFormError(null)
    setSuccess(null)
    setActionError(null)
    setShowForm(true)
  }

  function openEdit(vehicle: Vehicle) {
    setEditing(vehicle)
    setForm({
      vin: vehicle.vin,
      make: vehicle.make,
      model: vehicle.model,
      model_year: String(vehicle.model_year),
    })
    setFormError(null)
    setSuccess(null)
    setActionError(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
    setForm(emptyForm)
    setFormError(null)
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setSuccess(null)

    const vin = form.vin.trim().toUpperCase()
    const make = form.make.trim()
    const model = form.model.trim()
    const modelYear = Number(form.model_year)
    // Only changed fields are sent, so records whose stored VIN predates
    // validation can still be edited.
    const changes: Record<string, string | number> = {}

    if (!editing || vin !== editing.vin) {
      if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
        setFormError('Enter a valid 17-character VIN. Letters I, O and Q are not allowed.')
        return
      }
      changes.vin = vin
    }

    if (!make || make.length > 100 || !model || model.length > 100) {
      setFormError('Make and model must each contain between 1 and 100 characters.')
      return
    }
    if (!editing || make !== editing.make) changes.make = make
    if (!editing || model !== editing.model) changes.model = model

    if (!Number.isInteger(modelYear) || modelYear < 1886 || modelYear > 2100) {
      setFormError('Enter a model year between 1886 and 2100.')
      return
    }
    if (!editing || modelYear !== Number(editing.model_year)) changes.model_year = modelYear

    if (editing && Object.keys(changes).length === 0) {
      setFormError('No changes to save.')
      return
    }

    setSubmitting(true)

    try {
      const response = await apiFetch(editing ? `/vehicles/${editing.id}` : '/vehicles', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(changes),
      })
      const saved = await readJson<Vehicle>(response)

      closeForm()
      setSuccess(
        editing
          ? `${saved.make} ${saved.model} updated successfully.`
          : `${saved.make} ${saved.model} added to inventory as Active.`,
      )
      await reload()
    } catch (caught) {
      if (caught instanceof SessionExpiredError) return
      setFormError(errorMessage(caught, 'Could not save the vehicle.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(vehicle: Vehicle) {
    const confirmed = window.confirm(
      `Permanently delete ${vehicle.make} ${vehicle.model} (VIN ${vehicle.vin})? This cannot be undone.`,
    )
    if (!confirmed) return

    setDeletingId(vehicle.id)
    setActionError(null)
    setSuccess(null)

    try {
      const response = await apiFetch(`/vehicles/${vehicle.id}`, { method: 'DELETE' })
      await readJson(response)
      setSuccess(`${vehicle.make} ${vehicle.model} was deleted.`)
      await reload()
    } catch (caught) {
      if (caught instanceof SessionExpiredError) return
      setActionError(errorMessage(caught, 'Could not delete the vehicle.'))
    } finally {
      setDeletingId(null)
    }
  }

  function exportCsv() {
    downloadCsv(
      `datapulse-inventory-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Record ID', 'VIN', 'Make', 'Model', 'Model year', 'Status', 'Added'],
      sorted.map((v) => [v.id, v.vin, v.make, v.model, v.model_year, statusLabels[v.status], v.created_at]),
    )
  }

  const header = (key: SortKey, label: string, className: string) => (
    <th
      scope="col"
      className={className}
      aria-sort={sort.key === key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className="inline-flex items-center gap-1 font-medium uppercase tracking-wide hover:text-slate-900"
      >
        {label}
        <SortIcon active={sort.key === key} direction={sort.direction} />
      </button>
    </th>
  )

  return (
    <section id="inventory" className={`${cardClass} mb-8 scroll-mt-6`}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Vehicle inventory</h3>
          <p className="mt-1 text-sm text-slate-500">Search, filter and manage PostgreSQL vehicle records.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-700"
            >
              <Plus size={16} /> Add vehicle
            </button>
          )}
          <button
            type="button"
            onClick={exportCsv}
            disabled={sorted.length === 0}
            className={secondaryButtonClass}
          >
            <Download size={15} /> Export CSV
          </button>
          <button type="button" onClick={() => void reload()} disabled={loading} className={secondaryButtonClass}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_200px]">
        <div className="relative">
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            aria-label="Search vehicles"
            placeholder="Search VIN, make or model..."
            value={search}
            onChange={(event) => {
              onSearch(event.target.value)
              setPage(1)
            }}
            className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
          />
        </div>
        <select
          aria-label="Filter vehicles by status"
          value={statusFilter}
          onChange={(event) => {
            onStatusFilter(event.target.value)
            setPage(1)
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="sold">Sold</option>
          <option value="in_service">In service</option>
        </select>
      </div>

      {showForm && canEdit && (
        <form onSubmit={handleSave} className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4 md:p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h4 className="font-semibold">
                {editing === null ? 'Add a vehicle' : `Edit ${editing.make} ${editing.model}`}
              </h4>
              <p className="mt-1 text-sm text-slate-500">
                {editing === null
                  ? 'New vehicles start as Active. Recording a sale or opening a service job updates their status.'
                  : 'Changes are saved to PostgreSQL. Status changes through the sales and service workflows.'}
              </p>
            </div>
            <button
              type="button"
              onClick={closeForm}
              aria-label="Close vehicle form"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200"
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="vehicle-vin" className={labelClass}>VIN</label>
              <input
                id="vehicle-vin"
                value={form.vin}
                onChange={(event) => updateForm('vin', event.target.value)}
                placeholder="17-character VIN"
                maxLength={17}
                required
                autoComplete="off"
                className={`${inputClass} font-mono uppercase`}
              />
            </div>
            <div>
              <label htmlFor="vehicle-make" className={labelClass}>Make</label>
              <input
                id="vehicle-make"
                value={form.make}
                onChange={(event) => updateForm('make', event.target.value)}
                placeholder="e.g. Toyota"
                maxLength={100}
                required
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="vehicle-model" className={labelClass}>Model</label>
              <input
                id="vehicle-model"
                value={form.model}
                onChange={(event) => updateForm('model', event.target.value)}
                placeholder="e.g. Corolla"
                maxLength={100}
                required
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="vehicle-year" className={labelClass}>Model year</label>
              <input
                id="vehicle-year"
                type="number"
                min={1886}
                max={2100}
                step={1}
                value={form.model_year}
                onChange={(event) => updateForm('model_year', event.target.value)}
                required
                className={inputClass}
              />
            </div>
          </div>

          {editing !== null && (
            <p className="mt-4 text-sm text-slate-600">
              Current status:{' '}
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[editing.status]}`}>
                {statusLabels[editing.status]}
              </span>
            </p>
          )}

          {formError && (
            <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {formError}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting && <RefreshCw size={15} className="animate-spin" />}
              {submitting ? 'Saving...' : editing === null ? 'Save vehicle' : 'Save changes'}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {success && (
        <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {success}
        </p>
      )}
      {actionError && (
        <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {actionError}
        </p>
      )}
      {error && (
        <div className="mb-4">
          <PanelError message={`Could not load vehicles: ${error}`} onRetry={() => void reload()} />
        </div>
      )}

      {loading && !lastUpdated && !error ? (
        <div role="status" className="flex items-center gap-3 py-12 text-sm text-slate-500">
          <RefreshCw size={18} className="animate-spin" />
          Loading vehicle records...
        </div>
      ) : !error && vehicles.length === 0 ? (
        <div className="py-10 text-center">
          <CarFront size={30} className="mx-auto mb-3 text-slate-400" />
          <p className="font-medium">No vehicles found</p>
          <p className="mt-1 text-sm text-slate-500">
            {search || statusFilter !== 'all'
              ? 'Try changing your search or filter.'
              : 'Add a vehicle or ingest one through NiFi.'}
          </p>
        </div>
      ) : vehicles.length > 0 ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-slate-500">
            <span>{vehicles.length} result{vehicles.length === 1 ? '' : 's'}</span>
            <span className="text-slate-300">•</span>
            <span>{stats.total} total database records</span>
            {lastUpdated && (
              <>
                <span className="text-slate-300">•</span>
                <span>Updated at {lastUpdated}</span>
              </>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead>
                <tr className="border-y border-slate-100 text-xs text-slate-500">
                  {header('vehicle', 'Vehicle', 'py-3 pr-4')}
                  {header('model_year', 'Model year', 'px-4 py-3')}
                  {header('status', 'Status', 'px-4 py-3')}
                  {header('id', 'Record ID', 'px-4 py-3')}
                  <th scope="col" className="px-4 py-3 text-right font-medium uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((vehicle) => (
                  <tr key={vehicle.id} className="transition-colors hover:bg-slate-50">
                    <td className="py-4 pr-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
                          <CarFront size={20} />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{vehicle.make} {vehicle.model}</p>
                          <p className="mt-1 font-mono text-xs text-slate-500">{vehicle.vin}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-600">{vehicle.model_year}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[vehicle.status]}`}>
                        {statusLabels[vehicle.status]}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-500">#{vehicle.id}</td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => openEdit(vehicle)}
                            aria-label={`Edit ${vehicle.make} ${vehicle.model}`}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-100"
                          >
                            Edit
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => void handleDelete(vehicle)}
                            disabled={sameId(deletingId, vehicle.id)}
                            aria-label={`Delete ${vehicle.make} ${vehicle.model}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                          >
                            {sameId(deletingId, vehicle.id) ? (
                              <RefreshCw size={13} className="animate-spin" />
                            ) : (
                              <Trash2 size={13} />
                            )}
                            Delete
                          </button>
                        )}
                        {!canEdit && !isAdmin && (
                          <span className="px-3 py-1.5 text-xs text-slate-400">View only</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <nav aria-label="Inventory pages" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
              <span>
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, sorted.length)} of {sorted.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  aria-label="Previous page"
                  className={secondaryButtonClass}
                >
                  <ChevronLeft size={15} />
                </button>
                <span className="px-1">Page {currentPage} of {pageCount}</span>
                <button
                  type="button"
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage === pageCount}
                  aria-label="Next page"
                  className={secondaryButtonClass}
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </nav>
          )}
        </>
      ) : null}

      <div className="mt-5 flex items-start gap-2 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">
        <Database size={15} className="mt-0.5 shrink-0" />
        <p>
          Source: DataPulse REST API backed by PostgreSQL. Vehicles with sales or service history are
          kept so that history stays intact.
        </p>
      </div>
    </section>
  )
}
