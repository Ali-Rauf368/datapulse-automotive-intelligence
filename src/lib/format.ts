import { DEFAULT_ACCOUNT_NAME } from '../constants.ts'
import type { Id, User, Vehicle, VehicleRef } from '../types.ts'

// The name to show for an account, or null when it still has the
// placeholder name given to accounts created before signup collected one.
export function displayNameOf(user: User): string | null {
  return user.name && user.name !== DEFAULT_ACCOUNT_NAME ? user.name : null
}

export function sameId(a: Id | null | undefined, b: Id | null | undefined): boolean {
  return a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b)
}

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatCompactMoney(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'EUR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount)
}

export function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString()
}

export function formatDateTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

export function describeVehicle(item: VehicleRef): string {
  if (item.make || item.model) return `${item.make ?? ''} ${item.model ?? ''}`.trim()
  return item.vehicle_id === null ? 'Deleted vehicle' : `Vehicle #${item.vehicle_id}`
}

export function saleOptionLabel(vehicle: Vehicle): string {
  const base = `${vehicle.make} ${vehicle.model} · ${vehicle.vin}`

  if (vehicle.status === 'sold') return `${base} (marked sold, no sale on record)`
  if (vehicle.status === 'in_service') return `${base} (in service, no open job)`
  return base
}
