import { Fragment } from 'react'
import type { ReactNode } from 'react'
import type { Coordinate, ShipView } from './types'
import { shipNames } from './i18n'
import { letters } from './coordinates'

export function ShipDrawing({ length, vertical = false }: { length: number; vertical?: boolean }) {
  const width = length * 100
  return <svg className="ship-drawing" viewBox={vertical ? `0 0 100 ${width}` : `0 0 ${width} 100`} preserveAspectRatio="none" aria-hidden="true">
    <g transform={vertical ? 'translate(100 0) rotate(90)' : undefined}>
      <path className="ship-hull" d={`M12 22 Q8 50 12 78 H${width - 65} L${width - 9} 50 L${width - 65} 22 Z`} />
      <path className="ship-deck" d={`M30 34 H${width - 85} L${width - 48} 50 L${width - 85} 66 H30 Z`} />
      <rect className="ship-bridge" x={width * .4} y="29" width="36" height="42" rx="4" />
      <path className="ship-detail" d={`M${width * .4 + 18} 36 V64 M45 50 H${width * .32} M${width * .65} 50 H${width - 70}`} />
    </g>
  </svg>
}

export function BoardGrid({ cell, ariaLabel, ships = [] }: {
  cell: (coordinate: Coordinate) => ReactNode; ariaLabel: string; ships?: ShipView[]
}) {
  return <div className="board" role="group" aria-label={ariaLabel}>
    <div className="board-corner" aria-hidden="true">↗</div>
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
        }}><ShipDrawing length={ship.cells.length} vertical={vertical} /></div>
      })}
    </div>
  </div>
}

export function ShotMark({ status }: { status: string }) {
  return <span className="shot-mark" aria-hidden="true"><svg viewBox="0 0 32 32">
    {status === 'Miss' ? <circle cx="16" cy="16" r="7" /> : <path d="M8 8L24 24 M24 8L8 24" />}
  </svg></span>
}
