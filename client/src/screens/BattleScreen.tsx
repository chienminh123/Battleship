import { useEffect, useState } from 'react'
import { BoardGrid, ShotMark } from '../BoardGrid'
import { OceanBoard3D } from '../Board3D'
import { GameHeader, Legend } from '../GameUi'
import { cellKey, cellName } from '../coordinates'
import { botDifficultyNames, shipNames, shotNames } from '../i18n'
import { revealedShips, shotStatus, sunkCellKeys } from '../battlePresentation'
import type { BattleEvent, GraphicsQuality } from '../battlePresentation'
import type { Coordinate, ShotHistoryItem } from '../types'
import type { HubState } from '../useGameHub'

export function BattleScreen({ state, busy, threeDimensional, quality, activeEvent, heldEvent, presenting, autoSwitch, onAutoSwitch: setAutoSwitch, onFallback, onFire }: {
  state: HubState; busy: boolean; threeDimensional: boolean; quality: GraphicsQuality
  activeEvent?: BattleEvent; heldEvent?: BattleEvent; presenting: boolean
  autoSwitch: boolean; onAutoSwitch: (enabled: boolean) => void
  onFallback: () => void; onFire: (cell: Coordinate) => void
}) {
  const [focus, setFocus] = useState<'enemy' | 'own'>(state.isYourTurn ? 'enemy' : 'own')
  const [selected, setSelected] = useState<Coordinate | null>(null)
  useEffect(() => {
    if (!autoSwitch) return
    // The turn flips in the same update that queues the shot effect; while an effect is
    // queued but not yet started, keep the current board instead of flashing to the other one.
    const board = (activeEvent ?? heldEvent)?.board ?? (presenting ? undefined : state.isYourTurn ? 'enemy' : 'own')
    if (!board) return
    const timer = window.setTimeout(() => setFocus(board), 0)
    return () => window.clearTimeout(timer)
  }, [state.isYourTurn, activeEvent, heldEvent, presenting, autoSwitch])
  const ownShips = state.ownBoard?.ships ?? []
  const ownCells = new Map(ownShips.flatMap((ship) => ship.cells.map((cell) => [cellKey(cell), ship])))
  const shots = new Map(state.shots.map((shot) => [cellKey(shot.coordinate), shot]))
  const incoming = new Map(state.incomingShots.map((shot) => [cellKey(shot.coordinate), shot]))
  const enemySunk = sunkCellKeys(state.shots), ownSunk = sunkCellKeys(state.incomingShots, ownShips)
  const target = selected && !shots.has(cellKey(selected)) ? selected : null
  const latestOutgoing = state.shots.at(-1), latestIncoming = state.incomingShots.at(-1)
  const chooseFocus = (value: 'enemy' | 'own') => { setFocus(value); setAutoSwitch(false) }
  const readyToFire = state.phase === 'Playing' && state.isYourTurn && state.connected && !busy && !presenting
  const selectTarget = (cell: Coordinate) => {
    if (readyToFire) setSelected(cell)
  }
  const shotCell = (cell: Coordinate, shot: ShotHistoryItem | undefined, own: boolean) => {
    const ship = own ? ownCells.get(cellKey(cell)) : undefined
    const status = shotStatus(shot, own ? ownSunk : enemySunk)
    const last = own ? latestIncoming : latestOutgoing
    const recent = Boolean(last && cellKey(last.coordinate) === cellKey(cell))
    const label = `${cellName(cell)}, ${shot ? shotNames[status!] : 'chưa bắn'}${ship ? `, ${shipNames[ship.type]}` : ''}`
    const content = <>{status && <ShotMark status={status} />}{recent && <span className="latest-shot" aria-hidden="true" />}</>
    const className = `grid-cell ${own ? 'own-cell' : 'target-cell'} ${ship ? 'has-ship' : ''} ${status ? `shot-${status.toLowerCase()}` : 'unfired'} ${recent ? 'is-latest' : ''} ${!own && target && cellKey(target) === cellKey(cell) ? 'is-targeted' : ''}`
    return own ? <div className={className} aria-label={label} title={label}>{content}</div>
      : <button className={className} disabled={!readyToFire || Boolean(shot)} onClick={() => selectTarget(cell)} aria-label={`${label}${!shot ? ', chọn mục tiêu' : ''}`} title={label}>{content}</button>
  }
  return <div className="game-view battle-view">
    <GameHeader title={state.isYourTurn ? 'Đến lượt bạn bắn' : state.isBot ? 'Máy đang ngắm bắn' : 'Đối thủ đang ngắm bắn'} detail={state.isYourTurn ? 'Chọn một ô trên biển đối thủ, rồi nhấn Bắn.' : 'Theo dõi vị trí và tình trạng đội tàu của bạn.'} />
    <div className={`turn-banner ${state.isYourTurn ? 'your-turn' : ''}`} role="status" aria-live="polite">
      <strong>{!state.connected ? 'Mất kết nối · Đang thử kết nối lại' : state.isYourTurn ? 'Lượt của bạn' : state.isBot ? 'Lượt của máy' : 'Lượt đối thủ'}</strong><span>{state.message}</span>
      {state.isBot && <small className="turn-banner-meta">Máy · {botDifficultyNames[state.botDifficulty ?? 'Easy']}</small>}
    </div>
    <div className="battle-toolbar"><div className="board-tabs" role="group" aria-label="Chọn bản đồ chính">
      <button aria-pressed={focus === 'enemy'} onClick={() => chooseFocus('enemy')}>Ngắm bắn đối thủ</button>
      <button aria-pressed={focus === 'own'} onClick={() => chooseFocus('own')}>Đội tàu của tôi</button>
    </div><label className="auto-switch"><input type="checkbox" checked={autoSwitch} onChange={(e) => setAutoSwitch(e.target.checked)} />Tự đổi theo lượt</label></div>
    <Legend />
    <div className={`battle-layout focus-${focus}`}>
      <section className={`board-wrap enemy-board ${focus === 'enemy' ? 'board-primary' : 'board-secondary'}`} aria-label="Vùng biển đối thủ">
        <div className="board-label"><h2>Vùng biển đối thủ</h2><span>{state.shots.length} phát đã bắn</span></div>
        {threeDimensional ? <OceanBoard3D label="Bản đồ ngắm bắn đối thủ" variant={focus === 'enemy' ? 'primary' : 'mini'} quality={quality} animate effect={activeEvent?.board === 'enemy' ? activeEvent : undefined}
          ships={revealedShips(state.shots)} shots={state.shots} selectedCell={target} onCell={readyToFire ? selectTarget : undefined} onUnavailable={onFallback} />
          : <BoardGrid ariaLabel="Bản đồ ngắm bắn đối thủ" cell={(cell) => shotCell(cell, shots.get(cellKey(cell)), false)} />}
        <div className="fire-controls">
          <div className="target-coordinate"><span>Mục tiêu</span><strong aria-live="polite">{target ? cellName(target) : '—'}</strong></div>
          <label>Cột<select aria-label="Cột mục tiêu" value={selected?.x ?? ''} disabled={!readyToFire} onChange={(event) => {
            const x = Number(event.currentTarget.value)
            setSelected((current) => ({ x, y: current?.y ?? 0 }))
          }}>
            <option value="" disabled>—</option>{'ABCDEFGHIJ'.split('').map((letter, x) => <option key={letter} value={x}>{letter}</option>)}
          </select></label>
          <label>Hàng<select aria-label="Hàng mục tiêu" value={selected?.y ?? ''} disabled={!readyToFire} onChange={(event) => {
            const y = Number(event.currentTarget.value)
            setSelected((current) => ({ x: current?.x ?? 0, y }))
          }}>
            <option value="" disabled>—</option>{Array.from({ length: 10 }, (_, y) => <option key={y} value={y}>{y + 1}</option>)}
          </select></label>
          <button type="button" className="primary-action fire-button" disabled={!readyToFire || !target} onClick={() => { if (target && readyToFire) onFire(target) }}>{target ? `Bắn ${cellName(target)}` : 'Bắn'}</button>
        </div>
        <p className="board-hint">{latestOutgoing ? `Phát bắn của bạn: ${cellName(latestOutgoing.coordinate)} · ${shotNames[latestOutgoing.status]}` : 'Chọn tọa độ để tìm đội tàu đang ẩn của đối thủ.'}</p>
        {focus !== 'enemy' && <button className="text-action expand-board" onClick={() => chooseFocus('enemy')}>Phóng lớn bản đồ bắn</button>}
      </section>
      <section className={`board-wrap own-board ${focus === 'own' ? 'board-primary' : 'board-secondary'}`} aria-label="Đội tàu của bạn">
        <div className="board-label"><h2>Đội tàu của bạn</h2><span>{ownShips.filter((ship) => !ship.isSunk).length}/5 tàu còn nổi</span></div>
        {threeDimensional ? <OceanBoard3D label="Đội tàu của bạn và lịch sử đợt pháo của đối thủ" variant={focus === 'own' ? 'primary' : 'mini'} quality={quality} animate effect={activeEvent?.board === 'own' ? activeEvent : undefined} ships={ownShips} shots={state.incomingShots} onUnavailable={onFallback} />
          : <BoardGrid ariaLabel="Bản đồ đội tàu của bạn" ships={ownShips} cell={(cell) => shotCell(cell, incoming.get(cellKey(cell)), true)} />}
        <p className="board-hint">{latestIncoming ? `Đối thủ bắn: ${cellName(latestIncoming.coordinate)} · ${shotNames[latestIncoming.status]}` : 'Tàu của bạn luôn hiện tại đây, kể cả sau khi tải lại trang.'}</p>
        {focus !== 'own' && <button className="text-action expand-board" onClick={() => chooseFocus('own')}>Phóng lớn đội tàu của tôi</button>}
        <ul className="fleet-status" aria-label="Tình trạng đội tàu">{ownShips.map((ship) => <li key={ship.type} className={ship.isSunk ? 'is-sunk' : ''}>
          <span>{shipNames[ship.type]}</span><span>{ship.isSunk ? 'Đã chìm' : `${ship.cells.length - ship.hits.length}/${ship.cells.length} ô`}</span>
        </li>)}</ul>
      </section>
    </div>
    <p className="battle-footer">{!state.opponentConnected && !state.isBot ? 'Đối thủ mất kết nối. Đang chờ kết nối lại…' : 'Mỗi lượt bắn một ô. Bắn trúng vẫn chuyển lượt.'}</p>
  </div>
}
