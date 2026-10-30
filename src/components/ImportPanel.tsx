import { useRef, useState } from 'react'
import { CircleCheck, CopyX, FileSpreadsheet, RefreshCw, TriangleAlert, Upload, X } from 'lucide-react'
import { SessionExpiredError, errorMessage, readJson } from '../lib/api.ts'
import { downloadCsv } from '../lib/csv.ts'
import { vehiclesFromCsv } from '../lib/csv-parse.ts'
import type { ApiFetch } from '../hooks/useDashboardData.ts'

type ImportResult = {
  created: number
  duplicates: number
  invalid: number
  results: Array<{ row: number; vin: string | null; status: 'created' | 'duplicate' | 'invalid'; error?: string }>
}

// Upload a spreadsheet of vehicles: the file is parsed in the browser, the
// API validates every row and the panel shows what happened to each.
export function ImportPanel({
  apiFetch,
  onClose,
  onImported,
}: {
  apiFetch: ApiFetch
  onClose: () => void
  onImported: () => Promise<void>
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)

  async function handleFile(file: File) {
    setFileName(file.name)
    setError(null)
    setResult(null)

    const parsed = vehiclesFromCsv(await file.text())
    if ('error' in parsed) {
      setError(parsed.error)
      return
    }

    setBusy(true)
    try {
      const response = await apiFetch('/vehicles/import', {
        method: 'POST',
        body: JSON.stringify({ vehicles: parsed.vehicles }),
      })
      setResult(await readJson<ImportResult>(response))
      await onImported()
    } catch (caught) {
      if (caught instanceof SessionExpiredError) return
      setError(errorMessage(caught, 'Could not import the file.'))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const problems = result?.results.filter((r) => r.status !== 'created') ?? []

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4 md:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold">Import vehicles from a spreadsheet</h4>
          <p className="mt-1 text-sm text-slate-500">
            CSV with columns <span className="font-mono text-xs">vin, make, model, model_year</span>. Up to 500
            vehicles; every row is checked and existing VINs are skipped.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close import" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200">
          <X size={18} />
        </button>
      </div>

      <label
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white px-6 py-8 text-center transition-colors hover:border-cyan-400 ${busy ? 'pointer-events-none opacity-60' : ''}`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          const file = event.dataTransfer.files[0]
          if (file) void handleFile(file)
        }}
      >
        {busy ? <RefreshCw size={26} className="mb-2 animate-spin text-cyan-600" /> : <Upload size={26} className="mb-2 text-cyan-600" />}
        <span className="text-sm font-medium">{busy ? `Importing ${fileName}…` : 'Choose a CSV file or drop it here'}</span>
        <span className="mt-1 text-xs text-slate-500">Exported from Excel, Google Sheets or a dealer system</span>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          aria-label="Vehicle CSV file"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void handleFile(file)
          }}
        />
      </label>

      <button
        type="button"
        onClick={() =>
          downloadCsv('datapulse-import-template.csv', ['vin', 'make', 'model', 'model_year'], [
            ['WVWZZZCDZRW123456', 'Volkswagen', 'Golf 8', 2024],
            ['YV1XZK7V2R2000001', 'Volvo', 'XC40 Recharge', 2024],
          ])
        }
        className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-cyan-700 hover:text-cyan-900"
      >
        <FileSpreadsheet size={15} /> Download template
      </button>

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
      )}

      {result && (
        <div className="mt-4" role="status">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              <CircleCheck size={16} /> <b>{result.created}</b> imported
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
              <CopyX size={16} /> <b>{result.duplicates}</b> already present
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <TriangleAlert size={16} /> <b>{result.invalid}</b> invalid
            </div>
          </div>
          {problems.length > 0 && (
            <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr><th className="px-3 py-2 font-medium">Row</th><th className="px-3 py-2 font-medium">VIN</th><th className="px-3 py-2 font-medium">Problem</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {problems.map((p) => (
                    <tr key={p.row}>
                      <td className="px-3 py-1.5 text-slate-500">{p.row + 1}</td>
                      <td className="px-3 py-1.5 font-mono">{p.vin ?? '—'}</td>
                      <td className="px-3 py-1.5 text-slate-600">{p.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
