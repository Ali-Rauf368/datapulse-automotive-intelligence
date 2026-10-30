// Minimal RFC 4180 parser: quoted fields, escaped quotes (""), commas and
// line breaks inside quotes, CRLF line endings and a leading BOM.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  for (let i = 0; i < input.length; i++) {
    const char = input[i]

    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
      continue
    }

    if (char === '"') quoted = true
    else if (char === ',' || char === ';') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++
      row.push(field)
      if (row.some((cell) => cell.trim() !== '')) rows.push(row)
      row = []
      field = ''
    } else field += char
  }

  row.push(field)
  if (row.some((cell) => cell.trim() !== '')) rows.push(row)
  return rows
}

const columnAliases: Record<string, 'vin' | 'make' | 'model' | 'model_year'> = {
  vin: 'vin',
  make: 'make',
  brand: 'make',
  model: 'model',
  modelyear: 'model_year',
  year: 'model_year',
}

// Turns a vehicle spreadsheet into rows for the import API. Header names are
// matched loosely ("Model year", "model_year" and "Year" all work).
export function vehiclesFromCsv(text: string):
  | { vehicles: Array<Record<string, string>> }
  | { error: string } {
  const [header, ...body] = parseCsv(text)

  if (!header) return { error: 'The file is empty.' }

  const columns = header.map((name) => columnAliases[name.toLowerCase().replace(/[^a-z]/g, '')])
  const missing = (['vin', 'make', 'model', 'model_year'] as const).filter((c) => !columns.includes(c))

  if (missing.length) {
    return { error: `Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Use the template.` }
  }
  if (body.length === 0) return { error: 'The file has a header but no vehicles.' }
  if (body.length > 500) return { error: `The file has ${body.length} vehicles; import at most 500 at a time.` }

  return {
    vehicles: body.map((cells) => {
      const vehicle: Record<string, string> = {}
      columns.forEach((column, index) => {
        if (column) vehicle[column] = (cells[index] ?? '').trim()
      })
      return vehicle
    }),
  }
}
