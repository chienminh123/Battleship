import { cellKey } from './coordinates'
import type { Coordinate, ShipView, ShotHistoryItem } from './types'

export type GraphicsQuality = 'auto' | 'low' | 'high'
export type BattleEvent = { id: number; board: 'enemy' | 'own'; shot: ShotHistoryItem }

export function effectDuration(shot?: ShotHistoryItem) {
  return shot?.status === 'Sunk' || shot?.status === 'Won' ? 2100 : 1050
}

// A sunk fleet is public information. Never infer its outline from adjacent hits.
export function revealedShips(shots: ShotHistoryItem[]): ShipView[] {
  return shots.flatMap((shot) => shot.sunkShip && shot.sunkCells?.length ? [{
    type: shot.sunkShip, cells: shot.sunkCells, hits: shot.sunkCells, isSunk: true,
  }] : [])
}

export function sunkCellKeys(shots: ShotHistoryItem[], ships: ShipView[] = []) {
  return new Set([
    ...shots.flatMap((shot) => shot.sunkCells ?? []),
    ...ships.filter((ship) => ship.isSunk).flatMap((ship) => ship.cells),
  ].map(cellKey))
}

export function shotStatus(shot: ShotHistoryItem | undefined, sunk: Set<string>) {
  return shot && sunk.has(cellKey(shot.coordinate)) ? 'Sunk' : shot?.status
}

export function validCell(cell: Coordinate) {
  return Number.isInteger(cell.x) && Number.isInteger(cell.y) && cell.x >= 0 && cell.x < 10 && cell.y >= 0 && cell.y < 10
}
