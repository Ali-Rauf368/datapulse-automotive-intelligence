// Builds an RFC 4180 CSV and downloads it. Values that a spreadsheet would
// treat as formulas are prefixed with an apostrophe (CSV injection).
export function downloadCsv(
  filename: string,
  header: string[],
  rows: Array<Array<string | number | null | undefined>>,
): void {
  const cell = (value: string | number | null | undefined) => {
    let text = value === null || value === undefined ? '' : String(value)
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }

  const csv = [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n')
  // The BOM lets Excel open UTF-8 (e.g. "Škoda", "€") correctly.
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
