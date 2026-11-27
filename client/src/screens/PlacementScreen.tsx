import { useState } from 'react'
import { BoardGrid, ShipDrawing } from '../BoardGrid'
import { OceanBoard3D } from '../Board3D'
import { GameHeader } from '../GameUi'
import { cellsFor, fleetViews, invalidCells } from '../fleetPlacement'
import { cellKey, cellName } from '../coordinates'
import { shipNames } from '../i18n'
import { fleetSpecs } from '../types'
import type { Coordinate, FleetPlacement, ShipType } from '../types'
import type { GraphicsQuality } from '../battlePresentation'

export function PlacementScreen({ fleet, selected, onSelect, onPlace, onRotate, onRandom, onSubmit, submitted, opponentReady, busy, threeDimensional, quality, onFallback }: {
  fleet: FleetPlacement[]; selected: ShipType; onSelect: (type: ShipType) => void; onPlace: (cell: Coordinate) => void
  onRotate: () => void; onRandom: () => void; onSubmit: () => void; submitted: boolean; opponentReady: boolean; busy: boolean
  threeDimensional: boolean; onFallback: () => void
  quality: GraphicsQuality
}) {
  const [hovered, setHovered] = useState<Coordinate | null>(null)
  const chosen = fleet.find((ship) => ship.type === selected)!
  const placementPreview = hovered ? cellsFor({ ...chosen, start: hovered }) : []
  const invalid = invalidCells(fleet)
  const proposed = fleet.map((ship) => ship.type === selected && hovered ? { ...ship, start: hovered } : ship)
  const previewCells = new Set(hovered ? cellsFor(proposed.find((ship) => ship.type === selected)!).map(cellKey) : [])
  const invalidPreview = hovered && invalidCells(proposed).size > 0
  const views = fleetViews(fleet)
  return <div className="game-view placement-view">
    <GameHeader title="Bố trí đội tàu" detail={submitted ? 'Đã khóa tàu · đang chờ đối thủ' : 'Chọn tàu, chọn ô để đặt. Nhấn R để xoay.'} />
    <div className="game-layout"><div className="board-wrap"><div className="board-label"><span>Vùng biển của bạn</span><span>Đầu tàu hướng sang phải hoặc xuống dưới</span></div>
      {threeDimensional ? <OceanBoard3D quality={quality} label="Bản đồ xếp đội tàu" ships={views} previewCells={placementPreview}
        previewInvalid={hovered ? invalidCells(proposed).size > 0 : false} onHover={setHovered} onCell={!submitted && !busy ? onPlace : undefined} onUnavailable={onFallback} /> : <BoardGrid ariaLabel="Bản đồ bố trí đội tàu" ships={views} cell={(cell) => {
        const ship = views.find((ship) => ship.cells.some((part) => cellKey(part) === cellKey(cell)))
        return <button className={`grid-cell placement-cell ${ship ? 'has-ship' : ''} ${previewCells.has(cellKey(cell)) && !submitted ? `ghost-cell ${invalidPreview ? 'invalid-cell' : ''}` : ''} ${invalid.has(cellKey(cell)) ? 'invalid-cell' : ''}`}
          disabled={submitted || busy} onClick={() => onPlace(cell)} onMouseEnter={() => setHovered(cell)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(cell)} onBlur={() => setHovered(null)}
          onContextMenu={(event) => { event.preventDefault(); if (!submitted && !busy) onRotate() }}
          aria-label={`${cellName(cell)}${ship ? `, ${shipNames[ship.type]}` : ', biển trống'}${invalid.has(cellKey(cell)) ? ', vị trí không hợp lệ' : ''}`} />
      }} />}
      <p className="form-note">Hình tàu cho biết hướng và chiều dài. Bạn có thể đặt tàu sát nhau, nhưng không được chồng lấn hoặc ra ngoài bản đồ.</p>
    </div><aside className="fleet-panel"><h2>Đội tàu của bạn</h2><div className="fleet-list">
      {fleetSpecs.map((spec) => <button key={spec.type} className={`fleet-row ${selected === spec.type ? 'is-selected' : ''}`} aria-pressed={selected === spec.type} onClick={() => onSelect(spec.type)} disabled={submitted || busy}>
        <span className="fleet-ship-preview"><ShipDrawing type={spec.type} length={spec.length} /></span>
        <span className="fleet-name">{shipNames[spec.type]}<small>{spec.length} ô · {fleet.find((s) => s.type === spec.type)?.orientation === 'Horizontal' ? 'Nằm ngang' : 'Nằm dọc'}</small></span>
        <span className="fleet-state">{submitted ? 'Đã khóa' : selected === spec.type ? 'Đang chọn' : ''}</span>
      </button>)}
    </div><div className="placement-actions">
      <button className="secondary-action" onClick={onRotate} disabled={submitted || busy}>Xoay tàu đang chọn <kbd>R</kbd></button>
      <button className="secondary-action" onClick={onRandom} disabled={submitted || busy}>Xếp ngẫu nhiên</button>
      <button className="primary-action" onClick={onSubmit} disabled={submitted || busy || invalid.size > 0}>{submitted ? 'Đã khóa đội tàu' : busy ? 'Đang khóa…' : 'Khóa đội tàu · Sẵn sàng'}</button>
    </div>
    {invalid.size > 0 && !submitted && <p className="fleet-error" role="alert">Tàu chồng lấn hoặc vượt bản đồ. Di chuyển tàu khỏi ô đánh dấu đỏ.</p>}
    {opponentReady && <p className="ready-note">Đối thủ đã sẵn sàng.</p>}
    </aside></div>
  </div>
}
