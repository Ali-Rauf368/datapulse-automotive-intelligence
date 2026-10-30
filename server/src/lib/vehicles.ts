import type { PoolClient } from 'pg'

export const VEHICLE_STATUSES = ['active', 'sold', 'in_service'] as const
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number]

export const SERVICE_STATUSES = ['open', 'in_progress', 'completed', 'cancelled'] as const
export type ServiceStatus = (typeof SERVICE_STATUSES)[number]
export const CLOSED_SERVICE_STATUSES: readonly ServiceStatus[] = ['completed', 'cancelled']

export const VEHICLE_COLUMNS =
  'id, vin, make, model, model_year, status, created_at'

// 17 characters; I, O and Q are never used in VINs.
export const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/

export type NewVehicle = { vin: string; make: string; model: string; model_year: number }

// Validates and normalises the fields of a new vehicle. Returns the cleaned
// vehicle, or the first problem found.
export function validateNewVehicle(
  input: Record<string, unknown>,
): { vehicle: NewVehicle } | { error: string } {
  const { vin, make, model, model_year: modelYear } = input

  if (
    typeof vin !== 'string' ||
    typeof make !== 'string' ||
    typeof model !== 'string' ||
    !Number.isInteger(modelYear)
  ) {
    return { error: 'VIN, make, model and a valid model_year are required' }
  }

  const vehicle = {
    vin: vin.trim().toUpperCase(),
    make: make.trim(),
    model: model.trim(),
    model_year: modelYear as number,
  }

  if (!VIN_PATTERN.test(vehicle.vin)) return { error: 'VIN must contain 17 valid characters' }
  if (!vehicle.make || vehicle.make.length > 100) return { error: 'Make must be between 1 and 100 characters' }
  if (!vehicle.model || vehicle.model.length > 100) return { error: 'Model must be between 1 and 100 characters' }
  if (vehicle.model_year < 1886 || vehicle.model_year > 2100) {
    return { error: 'Model year must be between 1886 and 2100' }
  }

  return { vehicle }
}

export function isVehicleStatus(value: unknown): value is VehicleStatus {
  return (
    typeof value === 'string' &&
    VEHICLE_STATUSES.includes(value as VehicleStatus)
  )
}

export async function vehicleHistory(
  client: PoolClient,
  vehicleId: number,
): Promise<{ hasSale: boolean; hasOpenJob: boolean }> {
  const result = await client.query(
    `SELECT
       EXISTS (SELECT 1 FROM sales_events WHERE vehicle_id = $1) AS has_sale,
       EXISTS (
         SELECT 1 FROM service_events
         WHERE vehicle_id = $1 AND status IN ('open', 'in_progress')
       ) AS has_open_job`,
    [vehicleId],
  )

  return {
    hasSale: result.rows[0].has_sale,
    hasOpenJob: result.rows[0].has_open_job,
  }
}

// A vehicle's status must agree with its history: a recorded sale means
// "sold", an open or in-progress service job means "in_service", and anything
// else is "active". Returns why a requested status is not allowed, or null.
export async function statusConflict(
  client: PoolClient,
  vehicleId: number,
  requested: VehicleStatus,
): Promise<string | null> {
  const { hasSale, hasOpenJob } = await vehicleHistory(client, vehicleId)
  const expected: VehicleStatus = hasSale
    ? 'sold'
    : hasOpenJob
      ? 'in_service'
      : 'active'

  if (requested === expected) return null

  if (requested === 'sold') {
    return 'Use "Record a sale" to mark a vehicle as sold, so the sale price is captured.'
  }
  if (expected === 'sold') {
    return 'This vehicle has a recorded sale, so its status stays sold.'
  }
  if (requested === 'in_service') {
    return 'Create a service job to put a vehicle in service.'
  }
  return 'Complete or cancel the open service job to return this vehicle to active.'
}
