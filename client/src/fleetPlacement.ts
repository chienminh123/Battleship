import { cellKey } from './coordinates'
import { fleetSpecs, shipLength } from './types'
import type { Coordinate, FleetPlacement, ShipView } from './types'

export function cellsFor(placement: FleetPlacement): Coordinate[] {
  return Array.from({ length: shipLength(placement.type) }, (_, offset) => ({
    x: placement.start.x + (placement.orientation === 'Horizontal' ? offset : 0),
    y: placement.start.y + (placement.orientation === 'Vertical' ? offset : 0),
  }))
}
export function fleetViews(fleet: FleetPlacement[]): ShipView[] {
  return fleet.map((ship) => ({ type: ship.type, cells: cellsFor(ship), hits: [], isSunk: false }))
}
export function invalidCells(fleet: FleetPlacement[]) {
  const occupied = new Set<string>(), invalid = new Set<string>()
  for (const ship of fleet) for (const cell of cellsFor(ship)) {
    if (cell.x < 0 || cell.y < 0 || cell.x > 9 || cell.y > 9) {
      invalid.add(cellKey({ x: Math.max(0, Math.min(9, cell.x)), y: Math.max(0, Math.min(9, cell.y)) }))
    } else if (occupied.has(cellKey(cell))) invalid.add(cellKey(cell))
    else occupied.add(cellKey(cell))
  }
  return invalid
}
export function randomFleet(): FleetPlacement[] {
  const occupied = new Set<string>()
  return fleetSpecs.map((spec) => {
    const options: FleetPlacement[] = []
    for (const orientation of ['Horizontal', 'Vertical'] as const)
      for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
        const ship = { type: spec.type, start: { x, y }, orientation }
        if (cellsFor(ship).every((cell) => cell.x < 10 && cell.y < 10 && !occupied.has(cellKey(cell)))) options.push(ship)
      }
    const chosen = options[Math.floor(Math.random() * options.length)]
    cellsFor(chosen).forEach((cell) => occupied.add(cellKey(cell)))
    return chosen
  })
}
export function savedFleet(key: string): FleetPlacement[] | undefined {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (!Array.isArray(value) || value.length !== 5) return undefined
    if (!fleetSpecs.every((spec) => value.filter((s) => s?.type === spec.type && s.start
      && Number.isInteger(s.start.x) && Number.isInteger(s.start.y)
      && ['Horizontal', 'Vertical'].includes(s.orientation)).length === 1)) return undefined
    return value as FleetPlacement[]
  } catch { return undefined }
}
