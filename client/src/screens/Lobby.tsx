import { useState } from 'react'
import { BoardGrid, ShotMark } from '../BoardGrid'
import { OceanBoard3D } from '../Board3D'
import { fleetViews } from '../fleetPlacement'
import type { BotDifficulty, FleetPlacement } from '../types'
import { botDifficultyNames } from '../i18n'
import type { GraphicsQuality } from '../battlePresentation'

const previewFleet: FleetPlacement[] = [
  { type: 'Carrier', start: { x: 1, y: 1 }, orientation: 'Horizontal' },
  { type: 'Battleship', start: { x: 7, y: 2 }, orientation: 'Vertical' },
  { type: 'Cruiser', start: { x: 2, y: 5 }, orientation: 'Horizontal' },
  { type: 'Submarine', start: { x: 0, y: 7 }, orientation: 'Horizontal' },
  { type: 'Destroyer', start: { x: 5, y: 8 }, orientation: 'Horizontal' },
]

export function Lobby({ connected, busy, joinCode, setJoinCode, threeDimensional, quality, onBoardMode, onCreate, onBot, onJoin }: {
  connected: boolean; busy: boolean; joinCode: string; setJoinCode: (code: string) => void
  threeDimensional: boolean; onBoardMode: (enabled: boolean) => void
  quality: GraphicsQuality
  onCreate: () => void; onBot: (difficulty: BotDifficulty) => void; onJoin: () => void
}) {
  const [difficulty, setDifficulty] = useState<BotDifficulty>('Easy')
  const disabled = busy || !connected
  return <div className="lobby-view"><div className="hero-copy">
    <h1>Bố trí hạm đội.<br /><em>Làm chủ đại dương.</em></h1>
    <p className="hero-lede">Giấu hạm đội, tìm đối thủ. Đánh chìm cả năm tàu để chiến thắng.</p>
  </div><div className="lobby-panel">
    <h2>Bắt đầu hải chiến</h2>
    <button className="primary-action" onClick={onCreate} disabled={disabled}>Tạo phòng chơi cùng bạn bè</button>
    <div className="bot-setup" role="group" aria-label="Chơi với máy">
      <button className="bot-action" onClick={() => onBot(difficulty)} disabled={disabled} aria-label={`Chơi với máy ${botDifficultyNames[difficulty]}`}>Chơi với máy
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
      </button>
      <div className="bot-level">
        <select id="bot-difficulty" aria-label="Mức độ máy" value={difficulty} disabled={disabled}
          onChange={(event) => setDifficulty(event.target.value as BotDifficulty)}>
          <option value="Easy">Dễ</option><option value="Hard">Khó</option><option value="Annihilation">Hủy diệt</option>
        </select>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m5 7 5 5 5-5" /></svg>
      </div>
    </div>
    <div className="split-rule" aria-hidden="true" />
    <label className="field-label" htmlFor="room-code">Mã phòng</label>
    <form className="join-row" onSubmit={(event) => { event.preventDefault(); if (!disabled && joinCode.length === 6) onJoin() }}>
      <input id="room-code" autoComplete="off" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} placeholder="A7K9Q2" maxLength={6} />
      <button disabled={disabled || joinCode.length !== 6}>Vào phòng</button>
    </form>
    {!connected && <p role="status" className="ready-note">Đang kết nối máy chủ…</p>}
  </div>
  <section className="ocean-preview" aria-label="Xem trước bản đồ hải chiến">
    <div className="preview-toolbar"><h2>Vùng biển</h2><div className="board-tabs" role="group" aria-label="Chọn giao diện bàn cờ">
      <button aria-pressed={threeDimensional} onClick={() => onBoardMode(true)}>3D</button>
      <button aria-pressed={!threeDimensional} onClick={() => onBoardMode(false)}>2D</button>
    </div></div>
    {threeDimensional ? <OceanBoard3D quality={quality} label="Bản đồ xem trước: năm tàu đặt hợp lệ, một phát bắn trượt" ships={fleetViews(previewFleet)}
      shots={[{ coordinate: { x: 7, y: 0 }, status: 'Miss' }]} onUnavailable={() => onBoardMode(false)} />
      : <BoardGrid ariaLabel="Bản đồ xem trước 2D" ships={fleetViews(previewFleet)} cell={(cell) => cell.x === 7 && cell.y === 0
        ? <div className="grid-cell shot-miss"><ShotMark status="Miss" /></div> : <div className="grid-cell" />} />}
  </section></div>
}
