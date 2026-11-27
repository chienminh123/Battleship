import { ShotMark } from './BoardGrid'

export function Legend() {
  return <ul className="shot-legend" aria-label="Chú thích bản đồ">
    <li><i className="legend-unfired" />Chưa bắn</li><li><i className="legend-miss"><ShotMark status="Miss" /></i>Trượt</li>
    <li><i className="legend-hit"><ShotMark status="Hit" /></i>Trúng tàu</li><li><i className="legend-sunk"><ShotMark status="Sunk" /></i>Chìm tàu</li>
  </ul>
}

export function GameHeader({ title, detail }: { title: string; detail: string }) {
  return <div className="game-header"><h1>{title}</h1><p>{detail}</p></div>
}
