import { Fragment, useRef } from 'react'
import type { ReactNode } from 'react'
import type { Coordinate, ShipView } from './types'
import { shipNames } from './i18n'
import { letters } from './coordinates'
import { ShipDrawing } from './ShipDrawing'
import { useSurfaceMotion } from './useSurfaceMotion'
export { ShipDrawing } from './ShipDrawing'

export function BoardGrid({ cell, ariaLabel, ships = [] }: {
  cell: (coordinate: Coordinate) => ReactNode; ariaLabel: string; ships?: ShipView[]
}) {
  const surface = useRef<HTMLDivElement>(null)
  useSurfaceMotion(surface)
  return <div ref={surface} className="board" role="group" aria-label={ariaLabel}>
    <div className="board-sea" aria-hidden="true" />
    <div className="board-corner" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor"><path d="m10 2 3 8-3 8-3-8 3-8ZM2 10h4m8 0h4" /></svg></div>
    {letters.map((letter) => <span className="axis axis-top" key={letter} aria-hidden="true">{letter}</span>)}
    {Array.from({ length: 10 }, (_, y) => <Fragment key={y}>
      <span className="axis axis-left" aria-hidden="true">{y + 1}</span>
      {Array.from({ length: 10 }, (_, x) => <div className="cell-slot" key={x}>{cell({ x, y })}</div>)}
    </Fragment>)}
    <div className="fleet-overlay" aria-hidden="true">
      {ships.filter((ship) => ship.cells.length > 0 && ship.cells.every((cell) => cell.x >= 0 && cell.y >= 0 && cell.x < 10 && cell.y < 10)).map((ship) => {
        const vertical = ship.cells.length > 1 && ship.cells[0].x === ship.cells[1].x
        return <div key={ship.type} title={shipNames[ship.type]} className={`ship-silhouette ship-${ship.type.toLowerCase()} ${ship.isSunk ? 'is-sunk' : ''}`} style={{
          gridColumn: `${ship.cells[0].x + 2} / span ${vertical ? 1 : ship.cells.length}`,
          gridRow: `${ship.cells[0].y + 2} / span ${vertical ? ship.cells.length : 1}`,
        }}><ShipDrawing type={ship.type} length={ship.cells.length} vertical={vertical} /></div>
      })}
    </div>
  </div>
}

export function ShotMark({ status }: { status: string }) {
  return <span className="shot-mark" aria-hidden="true"><svg viewBox="0 0 32 32">
    {status === 'Miss' ? <circle cx="16" cy="16" r="7" /> : <path d="M8 8L24 24 M24 8L8 24" />}
  </svg></span>
}
