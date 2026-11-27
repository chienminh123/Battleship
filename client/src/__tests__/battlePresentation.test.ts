import { describe, expect, it } from 'vitest'
import { revealedShips, shotStatus, sunkCellKeys } from '../battlePresentation'
import type { ShipView, ShotHistoryItem } from '../types'

const hits: ShotHistoryItem[] = [{ coordinate: { x: 0, y: 3 }, status: 'Hit' }, { coordinate: { x: 1, y: 3 }, status: 'Won', sunkShip: 'Submarine', sunkCells: [{ x: 0, y: 3 }, { x: 1, y: 3 }, { x: 2, y: 3 }] }]

describe('private and sunk-fleet presentation', () => {
  it('reveals only the exact completed ship cells, not adjacent unfinished hits', () => {
    const visible = revealedShips([
      { coordinate: { x: 0, y: 3 }, status: 'Hit' },
      { coordinate: { x: 0, y: 4 }, status: 'Hit' },
      { coordinate: { x: 1, y: 3 }, status: 'Sunk', sunkShip: 'Submarine', sunkCells: [{ x: 0, y: 3 }, { x: 1, y: 3 }, { x: 2, y: 3 }] },
    ])
    expect(visible).toHaveLength(1)
    expect(visible[0]?.cells).toEqual([{ x: 0, y: 3 }, { x: 1, y: 3 }, { x: 2, y: 3 }])
    expect(visible[0]?.isSunk).toBe(true)
  })

  it('paints earlier hits as sunk after reconnecting from the full sunk-cell history', () => {
    const cells = sunkCellKeys(hits)
    expect(shotStatus(hits[0], cells)).toBe('Sunk')
    expect(shotStatus({ coordinate: { x: 7, y: 7 }, status: 'Hit' }, cells)).toBe('Hit')
  })

  it('recovers sunk cells from the player-owned fleet when old shot history lacks them', () => {
    const fleet: ShipView[] = [{ type: 'Submarine', cells: [{ x: 0, y: 3 }, { x: 1, y: 3 }, { x: 2, y: 3 }], hits: [{ x: 0, y: 3 }, { x: 1, y: 3 }, { x: 2, y: 3 }], isSunk: true }]
    const cells = sunkCellKeys([{ coordinate: { x: 0, y: 3 }, status: 'Hit' }], fleet)
    expect(shotStatus({ coordinate: { x: 0, y: 3 }, status: 'Hit' }, cells)).toBe('Sunk')
  })
})
