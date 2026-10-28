// Adds realistic demo inventory with sales and service history so the
// dashboard has something to show. Insert-only and idempotent: vehicles are
// matched by VIN, so existing records are never changed, and history rows are
// tagged source = 'demo-seed'. Times are relative to when the script runs.
//
//   npm run seed:demo               add the demo data (skips what exists)
//   npm run seed:demo -- --remove   delete exactly what this script added
import 'dotenv/config'
import { pool } from '../db.ts'

const SOURCE = 'demo-seed'

type ServiceStatus = 'open' | 'in_progress' | 'completed' | 'cancelled'

type DemoVehicle = {
  wmi: string
  vds: string
  plant: string
  serial: string
  make: string
  model: string
  year: number
  inStockDays: number
  // Sold `daysAgo` calendar days before the run date, at local `time`.
  sale?: { amount: number; daysAgo: number; time: string }
  service?: Array<{
    description: string
    status: ServiceStatus
    openedDaysAgo: number
    completedDaysAgo?: number
  }>
}

const demoVehicles: DemoVehicle[] = [
  { wmi: 'WVW', vds: 'ZZZCD', plant: 'W', serial: '504211', make: 'Volkswagen', model: 'Golf 8 Life 1.5 eTSI', year: 2023, inStockDays: 34,
    sale: { amount: 27450, daysAgo: 2, time: '11:05' } },
  { wmi: 'WVG', vds: 'ZZZ5N', plant: 'W', serial: '318842', make: 'Volkswagen', model: 'Tiguan 2.0 TDI', year: 2022, inStockDays: 41,
    sale: { amount: 33900, daysAgo: 5, time: '14:10' } },
  { wmi: 'WBA', vds: '5R710', plant: 'F', serial: '842785', make: 'BMW', model: '320d Touring', year: 2022, inStockDays: 27,
    sale: { amount: 38750, daysAgo: 1, time: '15:20' } },
  { wmi: 'WBA', vds: '11EF0', plant: 'B', serial: '315507', make: 'BMW', model: 'iX1 xDrive30', year: 2024, inStockDays: 12 },
  { wmi: 'W1K', vds: '2060A', plant: 'F', serial: '107633', make: 'Mercedes-Benz', model: 'C 220 d', year: 2023, inStockDays: 52,
    sale: { amount: 44900, daysAgo: 12, time: '17:15' } },
  { wmi: 'W1N', vds: '2437L', plant: 'J', serial: '052148', make: 'Mercedes-Benz', model: 'EQA 250', year: 2024, inStockDays: 9,
    service: [{ description: 'Pre-delivery inspection', status: 'open', openedDaysAgo: 0.4 }] },
  { wmi: 'WAU', vds: 'ZZZF4', plant: 'N', serial: '064520', make: 'Audi', model: 'A4 Avant 40 TDI', year: 2021, inStockDays: 38,
    service: [{ description: 'Annual inspection (60,000 km)', status: 'completed', openedDaysAgo: 9, completedDaysAgo: 8.6 }],
    sale: { amount: 29990, daysAgo: 3, time: '16:45' } },
  { wmi: 'WAU', vds: 'ZZZFZ', plant: 'Z', serial: '015883', make: 'Audi', model: 'Q4 e-tron 40', year: 2023, inStockDays: 21,
    service: [{ description: 'Software update: infotainment and battery management', status: 'completed', openedDaysAgo: 6.2, completedDaysAgo: 6 }] },
  { wmi: 'TMB', vds: 'JJ9NX', plant: '1', serial: '097451', make: 'Škoda', model: 'Octavia Combi 2.0 TDI', year: 2022, inStockDays: 47,
    sale: { amount: 24800, daysAgo: 19, time: '09:50' } },
  { wmi: 'TMB', vds: 'JC9NY', plant: '2', serial: '018834', make: 'Škoda', model: 'Enyaq iV 80', year: 2023, inStockDays: 16,
    service: [{ description: 'High-voltage battery health check', status: 'in_progress', openedDaysAgo: 1.3 }] },
  { wmi: 'LRW', vds: '3E7FA', plant: 'C', serial: '421337', make: 'Tesla', model: 'Model 3 Long Range', year: 2022, inStockDays: 30,
    sale: { amount: 36500, daysAgo: 4, time: '10:30' } },
  { wmi: 'KMH', vds: 'M8411', plant: 'U', serial: '082215', make: 'Hyundai', model: 'Ioniq 5 77 kWh', year: 2023, inStockDays: 19,
    service: [{ description: 'Tyre change: summer to winter', status: 'cancelled', openedDaysAgo: 5.1 }] },
  { wmi: 'U5Y', vds: 'H8141', plant: 'L', serial: '603928', make: 'Kia', model: 'Sportage 1.6 T-GDI', year: 2024, inStockDays: 6 },
  { wmi: 'YV1', vds: 'UZK1V', plant: '1', serial: '004287', make: 'Volvo', model: 'XC60 B5 AWD', year: 2022, inStockDays: 25,
    service: [{ description: 'Replace front brake pads and discs', status: 'open', openedDaysAgo: 0.8 }] },
  { wmi: 'WF0', vds: 'XXWPG', plant: 'R', serial: '411209', make: 'Ford', model: 'Kuga 2.5 PHEV', year: 2021, inStockDays: 44,
    sale: { amount: 26300, daysAgo: 8, time: '12:40' } },
  { wmi: 'W0V', vds: 'P2F04', plant: 'P', serial: '722610', make: 'Opel', model: 'Corsa 1.2', year: 2023, inStockDays: 14 },
  { wmi: 'VF1', vds: 'RJA00', plant: '6', serial: '831405', make: 'Renault', model: 'Clio TCe 90', year: 2022, inStockDays: 58,
    sale: { amount: 15990, daysAgo: 26, time: '13:25' } },
  { wmi: 'VR3', vds: 'MDYHZ', plant: 'S', serial: '172044', make: 'Peugeot', model: '3008 Hybrid 225', year: 2023, inStockDays: 33,
    service: [{ description: 'Annual inspection (30,000 km)', status: 'completed', openedDaysAgo: 13, completedDaysAgo: 12.7 }] },
]

// North American VIN check digit (position 9), so the VINs are well formed.
const TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4,
  N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
}
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2]
const YEAR_CODES: Record<number, string> = {
  2019: 'K', 2020: 'L', 2021: 'M', 2022: 'N', 2023: 'P', 2024: 'R', 2025: 'S',
}

function buildVin(vehicle: DemoVehicle): string {
  const draft = `${vehicle.wmi}${vehicle.vds}0${YEAR_CODES[vehicle.year]}${vehicle.plant}${vehicle.serial}`
  const sum = [...draft].reduce(
    (total, char, index) =>
      total + (/\d/.test(char) ? Number(char) : TRANSLITERATION[char]) * WEIGHTS[index],
    0,
  )
  const check = sum % 11 === 10 ? 'X' : String(sum % 11)
  const vin = `${draft.slice(0, 8)}${check}${draft.slice(9)}`

  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
    throw new Error(`Invalid demo VIN for ${vehicle.make} ${vehicle.model}: ${vin}`)
  }

  return vin
}

// Status follows history, matching the rules the API enforces.
function statusFor(vehicle: DemoVehicle): 'active' | 'sold' | 'in_service' {
  if (vehicle.sale) return 'sold'
  return vehicle.service?.some((job) => job.status === 'open' || job.status === 'in_progress')
    ? 'in_service'
    : 'active'
}

const hoursAgo = (days: number) => Math.round(days * 24)
const vins = demoVehicles.map(buildVin)

async function seed(): Promise<void> {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const existing = await client.query<{ vin: string }>(
      'SELECT vin FROM vehicles WHERE vin = ANY($1::text[])',
      [vins],
    )
    const present = new Set(existing.rows.map((row) => row.vin))
    let vehicles = 0
    let sales = 0
    let jobs = 0

    for (const [index, vehicle] of demoVehicles.entries()) {
      const vin = vins[index]
      if (present.has(vin)) continue

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO vehicles (vin, make, model, model_year, status, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW() - make_interval(hours => $6))
         RETURNING id`,
        [vin, vehicle.make, vehicle.model, vehicle.year, statusFor(vehicle), hoursAgo(vehicle.inStockDays)],
      )
      const vehicleId = inserted.rows[0].id
      vehicles++

      for (const job of vehicle.service ?? []) {
        await client.query(
          `INSERT INTO service_events
             (vehicle_id, status, description, opened_at, completed_at, source, created_at)
           VALUES ($1, $2, $3, NOW() - make_interval(hours => $4),
                   CASE WHEN $5::int IS NULL THEN NULL ELSE NOW() - make_interval(hours => $5::int) END,
                   $6, NOW() - make_interval(hours => $4))`,
          [
            vehicleId,
            job.status,
            job.description,
            hoursAgo(job.openedDaysAgo),
            job.completedDaysAgo === undefined ? null : hoursAgo(job.completedDaysAgo),
            SOURCE,
          ],
        )
        jobs++
      }

      if (vehicle.sale) {
        // Whole days back from today's date keep each sale on its own day in
        // the seven-day chart and always in the past.
        const [hour, minute] = vehicle.sale.time.split(':').map(Number)
        await client.query(
          `INSERT INTO sales_events (vehicle_id, amount, sold_at, source, created_at)
           SELECT $1, $2, t, $3, t
           FROM (SELECT date_trunc('day', NOW()) - make_interval(days => $4)
                        + make_interval(hours => $5, mins => $6) AS t) sold`,
          [vehicleId, vehicle.sale.amount, SOURCE, vehicle.sale.daysAgo, hour, minute],
        )
        sales++
      }
    }

    await client.query('COMMIT')

    console.log(
      vehicles === 0
        ? 'Demo data is already present; nothing was added.'
        : `Added ${vehicles} vehicles, ${sales} sales and ${jobs} service jobs (tagged "${SOURCE}").`,
    )
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

async function remove(): Promise<void> {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const seeded = await client.query<{ id: string }>(
      'SELECT id FROM vehicles WHERE vin = ANY($1::text[]) FOR UPDATE',
      [vins],
    )
    const ids = seeded.rows.map((row) => row.id)

    const sales = await client.query(
      'DELETE FROM sales_events WHERE vehicle_id = ANY($1::bigint[]) AND source = $2',
      [ids, SOURCE],
    )
    const jobs = await client.query(
      'DELETE FROM service_events WHERE vehicle_id = ANY($1::bigint[]) AND source = $2',
      [ids, SOURCE],
    )
    // Vehicles that gained other history (e.g. a sale recorded during a demo)
    // are kept so that history stays attached.
    const vehicles = await client.query(
      `DELETE FROM vehicles v
       WHERE v.id = ANY($1::bigint[])
         AND NOT EXISTS (SELECT 1 FROM sales_events WHERE vehicle_id = v.id)
         AND NOT EXISTS (SELECT 1 FROM service_events WHERE vehicle_id = v.id)`,
      [ids],
    )

    await client.query('COMMIT')

    const kept = ids.length - (vehicles.rowCount ?? 0)
    console.log(
      `Removed ${vehicles.rowCount} vehicles, ${sales.rowCount} sales and ${jobs.rowCount} service jobs.` +
        (kept > 0 ? ` Kept ${kept} demo vehicles that have other history.` : ''),
    )
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

const removing = process.argv.includes('--remove')

;(removing ? remove() : seed())
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Demo data script failed')
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
