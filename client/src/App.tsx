import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { useGameHub } from './useGameHub'
import type { HubState } from './useGameHub'
import { BoardGrid, ShipDrawing, ShotMark } from './BoardGrid'
import { cellKey, cellName } from './coordinates'
import { shipNames, shotNames } from './i18n'
import { fleetSpecs, makeDefaultFleet, shipLength } from './types'
import type { Coordinate, FleetPlacement, ShipType, ShipView, ShotHistoryItem } from './types'

function cellsFor(placement: FleetPlacement): Coordinate[] {
  return Array.from({ length: shipLength(placement.type) }, (_, offset) => ({
    x: placement.start.x + (placement.orientation === 'Horizontal' ? offset : 0),
    y: placement.start.y + (placement.orientation === 'Vertical' ? offset : 0),
  }))
}
function fleetViews(fleet: FleetPlacement[]): ShipView[] {
  return fleet.map((ship) => ({ type: ship.type, cells: cellsFor(ship), hits: [], isSunk: false }))
}
function invalidCells(fleet: FleetPlacement[]) {
  const occupied = new Set<string>(), invalid = new Set<string>()
  for (const ship of fleet) for (const cell of cellsFor(ship)) {
    if (cell.x < 0 || cell.y < 0 || cell.x > 9 || cell.y > 9) {
      invalid.add(cellKey({ x: Math.max(0, Math.min(9, cell.x)), y: Math.max(0, Math.min(9, cell.y)) }))
    } else if (occupied.has(cellKey(cell))) invalid.add(cellKey(cell))
    else occupied.add(cellKey(cell))
  }
  return invalid
}
function randomFleet(): FleetPlacement[] {
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
function savedFleet(key: string): FleetPlacement[] | undefined {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (!Array.isArray(value) || value.length !== 5) return undefined
    if (!fleetSpecs.every((spec) => value.filter((s) => s?.type === spec.type && s.start
      && Number.isInteger(s.start.x) && Number.isInteger(s.start.y)
      && ['Horizontal', 'Vertical'].includes(s.orientation)).length === 1)) return undefined
    return value as FleetPlacement[]
  } catch { return undefined }
}

function App() {
  const { state, createRoom, createBotRoom, joinRoom, submitFleet, fire, rematch, leaveRoom } = useGameHub()
  const [joinCode, setJoinCode] = useState('')
  const [fleets, setFleets] = useState<Record<string, FleetPlacement[]>>({})
  const [selectedShip, setSelectedShip] = useState<ShipType>('Carrier')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const fleetKey = state.roomCode && state.player ? `battleship-fleet:${state.roomCode}:${state.player}` : ''
  const stored = useMemo(() => savedFleet(fleetKey), [fleetKey])
  const fleet = fleets[fleetKey] ?? stored ?? makeDefaultFleet()
  const updateFleet = useCallback((change: (value: FleetPlacement[]) => FleetPlacement[]) => {
    if (!fleetKey) return
    setFleets((current) => ({ ...current, [fleetKey]: change(current[fleetKey] ?? stored ?? makeDefaultFleet()) }))
  }, [fleetKey, stored])
  const rotate = useCallback(() => updateFleet((current) => current.map((ship) => ship.type === selectedShip
    ? { ...ship, orientation: ship.orientation === 'Horizontal' ? 'Vertical' : 'Horizontal' } : ship)), [selectedShip, updateFleet])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'r' && state.phase === 'Placing' && !state.fleetSubmitted
        && !(event.target instanceof HTMLInputElement)) { event.preventDefault(); rotate() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rotate, state.phase, state.fleetSubmitted])
  useEffect(() => {
    if (fleetKey && state.phase === 'Placing' && !state.fleetSubmitted) localStorage.setItem(fleetKey, JSON.stringify(fleet))
  }, [fleetKey, fleet, state.phase, state.fleetSubmitted])

  const run = async (action: () => Promise<unknown>, success?: string) => {
    if (busy) return
    setBusy(true); setNotice('')
    try { await action(); if (success) setNotice(success) }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Không thể thực hiện. Hãy thử lại.') }
    finally { setBusy(false) }
  }
  const hasRoom = Boolean(state.roomCode)
  return <main className={`app-shell ${hasRoom ? 'in-game' : ''}`}>
    <header className="topbar">
      <div className="brand"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>BATTLESHIP <small>/ HẢI CHIẾN</small></span></div>
      <div className="topbar-meta"><span className={`connection-dot ${state.connected ? 'is-live' : ''}`} />
        <span>{state.connected ? 'ĐÃ KẾT NỐI' : 'ĐANG KẾT NỐI'}</span>
        {hasRoom && <><span className="meta-divider" /><span>{state.isBot ? 'ĐẤU VỚI MÁY' : `PHÒNG ${state.roomCode}`}</span>
          <button className="leave-button" onClick={() => { if (window.confirm('Rời trận đấu và trở về sảnh?')) leaveRoom() }}>Rời trận</button></>}
      </div>
    </header>
    <div className="page-grid">
      <aside className="side-rail"><p className="rail-copy">Hai hạm đội.<br />Một đại dương.</p><div className="rail-rule" /><p className="form-note">Giấu đội tàu.<br />Chọn tọa độ.<br />Đánh chìm đối thủ.</p></aside>
      <section className="workspace">
        {state.error && <div className="alert-bar" role="alert">{state.error}<button onClick={() => window.location.reload()}>Kết nối lại</button></div>}
        {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Đóng thông báo">×</button></div>}
        {!hasRoom && <Lobby connected={state.connected} busy={busy} joinCode={joinCode} setJoinCode={setJoinCode}
          onCreate={() => run(createRoom)} onBot={() => run(createBotRoom)} onJoin={() => run(() => joinRoom(joinCode))} />}
        {hasRoom && state.phase === 'WaitingForOpponent' && <div className="waiting-view">
          <h1>Phòng đã sẵn sàng.<br /><em>Mời bạn cùng chơi.</em></h1>
          <p className="hero-lede">Gửi mã sáu ký tự này cho bạn bè. Đối thủ vào phòng là có thể bắt đầu xếp tàu.</p>
          <button className="room-code" onClick={() => run(async () => { if (!navigator.clipboard) throw new Error('Hãy chọn và sao chép mã phòng bên dưới.'); await navigator.clipboard.writeText(state.roomCode) }, 'Đã sao chép mã phòng.')}><span>{state.roomCode}</span><small>Sao chép mã</small></button>
          <p className="waiting-note" role="status">Đang chờ đối thủ vào phòng…</p>
          <button className="text-action" onClick={leaveRoom}>Trở về sảnh</button>
        </div>}
        {hasRoom && state.phase === 'Placing' && <PlacementScreen fleet={fleet} selected={selectedShip} onSelect={setSelectedShip}
          onPlace={(cell) => updateFleet((current) => current.map((ship) => ship.type === selectedShip ? { ...ship, start: cell } : ship))}
          onRotate={rotate} onRandom={() => updateFleet(randomFleet)} onSubmit={() => run(() => submitFleet(fleet))}
          submitted={state.fleetSubmitted} opponentReady={state.opponentFleetSubmitted} busy={busy || !state.connected} />}
        {hasRoom && state.phase === 'Playing' && <BattleScreen state={state} busy={busy} onFire={(cell) => run(async () => {
          const result = await fire(cell); if (!result.accepted) throw new Error(shotNames[result.status])
        })} />}
        {hasRoom && state.phase === 'Finished' && <GameOverScreen state={state} busy={busy || !state.connected} onRematch={() => run(rematch)} onLeave={leaveRoom} />}
      </section>
    </div>
  </main>
}

function Lobby({ connected, busy, joinCode, setJoinCode, onCreate, onBot, onJoin }: {
  connected: boolean; busy: boolean; joinCode: string; setJoinCode: (code: string) => void
  onCreate: () => void; onBot: () => void; onJoin: () => void
}) {
  const disabled = busy || !connected
  return <div className="lobby-view"><div className="hero-copy">
    <h1>Bố trí hạm đội.<br /><em>Làm chủ đại dương.</em></h1>
    <p className="hero-lede">Năm con tàu, một bản đồ 10 × 10. Giấu đội tàu của bạn và lần lượt bắn để tìm đối thủ. Ai đánh chìm toàn bộ tàu trước sẽ thắng.</p>
    <p className="lobby-rules">Chơi cùng bạn bè bằng mã phòng, hoặc luyện tập với máy ngay.</p>
  </div><div className="lobby-panel">
    <h2>Bắt đầu hải chiến</h2>
    <button className="primary-action" onClick={onCreate} disabled={disabled}>Tạo phòng chơi cùng bạn bè</button>
    <button className="secondary-action bot-action" onClick={onBot} disabled={disabled}>Chơi với máy <span>Ngẫu nhiên</span></button>
    <p className="form-note">Máy tự xếp đủ năm tàu và bắn ngẫu nhiên, không lặp ô.</p>
    <div className="split-rule"><span>ĐÃ CÓ MÃ PHÒNG?</span></div>
    <label className="field-label" htmlFor="room-code">Mã phòng của bạn bè</label>
    <form className="join-row" onSubmit={(event) => { event.preventDefault(); if (!disabled && joinCode.length === 6) onJoin() }}>
      <input id="room-code" autoComplete="off" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} placeholder="A7K9Q2" maxLength={6} />
      <button disabled={disabled || joinCode.length !== 6}>Vào phòng</button>
    </form><p className="form-note">Không cần tài khoản. Trận đấu có thể khôi phục khi tải lại trang.</p>
    {!connected && <p role="status" className="ready-note">Đang kết nối máy chủ…</p>}
  </div></div>
}

function PlacementScreen({ fleet, selected, onSelect, onPlace, onRotate, onRandom, onSubmit, submitted, opponentReady, busy }: {
  fleet: FleetPlacement[]; selected: ShipType; onSelect: (type: ShipType) => void; onPlace: (cell: Coordinate) => void
  onRotate: () => void; onRandom: () => void; onSubmit: () => void; submitted: boolean; opponentReady: boolean; busy: boolean
}) {
  const [hovered, setHovered] = useState<Coordinate | null>(null)
  const invalid = invalidCells(fleet)
  const proposed = fleet.map((ship) => ship.type === selected && hovered ? { ...ship, start: hovered } : ship)
  const previewCells = new Set(hovered ? cellsFor(proposed.find((ship) => ship.type === selected)!).map(cellKey) : [])
  const invalidPreview = hovered && invalidCells(proposed).size > 0
  const views = fleetViews(fleet)
  return <div className="game-view placement-view">
    <GameHeader title="Bố trí đội tàu" detail={submitted ? 'Đã khóa tàu · đang chờ đối thủ' : 'Chọn tàu, chọn ô để đặt. Nhấn R để xoay.'} />
    <div className="game-layout"><div className="board-wrap"><div className="board-label"><span>Vùng biển của bạn</span><span>Đầu tàu hướng sang phải hoặc xuống dưới</span></div>
      <BoardGrid ariaLabel="Bản đồ bố trí đội tàu" ships={views} cell={(cell) => {
        const ship = views.find((ship) => ship.cells.some((part) => cellKey(part) === cellKey(cell)))
        return <button className={`grid-cell placement-cell ${ship ? 'has-ship' : ''} ${previewCells.has(cellKey(cell)) && !submitted ? `ghost-cell ${invalidPreview ? 'invalid-cell' : ''}` : ''} ${invalid.has(cellKey(cell)) ? 'invalid-cell' : ''}`}
          disabled={submitted || busy} onClick={() => onPlace(cell)} onMouseEnter={() => setHovered(cell)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(cell)} onBlur={() => setHovered(null)}
          onContextMenu={(event) => { event.preventDefault(); if (!submitted && !busy) onRotate() }}
          aria-label={`${cellName(cell)}${ship ? `, ${shipNames[ship.type]}` : ', biển trống'}${invalid.has(cellKey(cell)) ? ', vị trí không hợp lệ' : ''}`} />
      }} />
      <p className="form-note">Hình tàu cho biết hướng và chiều dài. Bạn có thể đặt tàu sát nhau, nhưng không được chồng lấn hoặc ra ngoài bản đồ.</p>
    </div><aside className="fleet-panel"><h2>Đội tàu của bạn</h2><div className="fleet-list">
      {fleetSpecs.map((spec) => <button key={spec.type} className={`fleet-row ${selected === spec.type ? 'is-selected' : ''}`} aria-pressed={selected === spec.type} onClick={() => onSelect(spec.type)} disabled={submitted || busy}>
        <span className="fleet-ship-preview"><ShipDrawing length={spec.length} /></span>
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

function Legend() {
  return <ul className="shot-legend" aria-label="Chú thích bản đồ">
    <li><i className="legend-unfired" />Chưa bắn</li><li><i className="legend-miss"><ShotMark status="Miss" /></i>Trượt</li>
    <li><i className="legend-hit"><ShotMark status="Hit" /></i>Trúng tàu</li><li><i className="legend-sunk"><ShotMark status="Sunk" /></i>Chìm tàu</li>
  </ul>
}

function BattleScreen({ state, busy, onFire }: { state: HubState; busy: boolean; onFire: (cell: Coordinate) => void }) {
  const [focus, setFocus] = useState<'enemy' | 'own'>(state.isYourTurn ? 'enemy' : 'own')
  const [autoSwitch, setAutoSwitch] = useState(true)
  useEffect(() => {
    if (!autoSwitch) return
    // Keep the latest hit visible before switching boards. Both boards stay mounted.
    const timer = window.setTimeout(() => setFocus(state.isYourTurn ? 'enemy' : 'own'), state.isYourTurn ? 1200 : 650)
    return () => window.clearTimeout(timer)
  }, [state.isYourTurn, state.incomingShots.length, autoSwitch])
  const ownShips = state.ownBoard?.ships ?? []
  const ownCells = new Map(ownShips.flatMap((ship) => ship.cells.map((cell) => [cellKey(cell), ship])))
  const shots = new Map(state.shots.map((shot) => [cellKey(shot.coordinate), shot]))
  const incoming = new Map(state.incomingShots.map((shot) => [cellKey(shot.coordinate), shot]))
  const latestOutgoing = state.shots.at(-1), latestIncoming = state.incomingShots.at(-1)
  const chooseFocus = (value: 'enemy' | 'own') => { setFocus(value); setAutoSwitch(false) }
  const readyToFire = state.isYourTurn && state.connected && !busy
  const shotCell = (cell: Coordinate, shot: ShotHistoryItem | undefined, own: boolean) => {
    const ship = own ? ownCells.get(cellKey(cell)) : undefined
    const sunk = own && ship?.isSunk && shot?.status !== 'Miss'
    const status = sunk ? 'Sunk' : shot?.status
    const last = own ? latestIncoming : latestOutgoing
    const recent = Boolean(last && cellKey(last.coordinate) === cellKey(cell))
    const label = `${cellName(cell)}, ${shot ? shotNames[status!] : 'chưa bắn'}${ship ? `, ${shipNames[ship.type]}` : ''}`
    const content = <>{status && <ShotMark status={status} />}{recent && <span className="latest-shot" aria-hidden="true" />}</>
    const className = `grid-cell ${own ? 'own-cell' : 'target-cell'} ${ship ? 'has-ship' : ''} ${status ? `shot-${status.toLowerCase()}` : 'unfired'} ${recent ? 'is-latest' : ''}`
    return own ? <div className={className} aria-label={label} title={label}>{content}</div>
      : <button className={className} disabled={!readyToFire || Boolean(shot)} onClick={() => onFire(cell)} aria-label={`${label}${!shot ? ', bắn tại đây' : ''}`} title={label}>{content}</button>
  }
  return <div className="game-view battle-view">
    <GameHeader title={state.isYourTurn ? 'Đến lượt bạn bắn' : state.isBot ? 'Máy đang ngắm bắn' : 'Đối thủ đang ngắm bắn'} detail={state.isYourTurn ? 'Chọn một ô chưa bắn trên biển đối thủ.' : 'Theo dõi vị trí và tình trạng đội tàu của bạn.'} />
    <div className={`turn-banner ${state.isYourTurn ? 'your-turn' : ''}`} role="status" aria-live="polite">
      <strong>{!state.connected ? 'Mất kết nối · Đang thử kết nối lại' : state.isYourTurn ? 'Lượt của bạn' : state.isBot ? 'Lượt của máy' : 'Lượt đối thủ'}</strong><span>{state.message}</span>
    </div>
    <div className="battle-toolbar"><div className="board-tabs" role="group" aria-label="Chọn bản đồ chính">
      <button aria-pressed={focus === 'enemy'} onClick={() => chooseFocus('enemy')}>Ngắm bắn đối thủ</button>
      <button aria-pressed={focus === 'own'} onClick={() => chooseFocus('own')}>Đội tàu của tôi</button>
    </div><label className="auto-switch"><input type="checkbox" checked={autoSwitch} onChange={(e) => setAutoSwitch(e.target.checked)} />Tự đổi theo lượt</label></div>
    <Legend />
    <div className={`battle-layout focus-${focus}`}>
      <section className={`board-wrap enemy-board ${focus === 'enemy' ? 'board-primary' : 'board-secondary'}`} aria-label="Vùng biển đối thủ">
        <div className="board-label"><h2>Vùng biển đối thủ</h2><span>{state.shots.length} phát đã bắn</span></div>
        <BoardGrid ariaLabel="Bản đồ ngắm bắn đối thủ" cell={(cell) => shotCell(cell, shots.get(cellKey(cell)), false)} />
        <p className="board-hint">{latestOutgoing ? `Phát bắn của bạn: ${cellName(latestOutgoing.coordinate)} · ${shotNames[latestOutgoing.status]}` : 'Chọn tọa độ để tìm đội tàu đang ẩn của đối thủ.'}</p>
        {focus !== 'enemy' && <button className="text-action expand-board" onClick={() => chooseFocus('enemy')}>Phóng lớn bản đồ bắn</button>}
      </section>
      <section className={`board-wrap own-board ${focus === 'own' ? 'board-primary' : 'board-secondary'}`} aria-label="Đội tàu của bạn">
        <div className="board-label"><h2>Đội tàu của bạn</h2><span>{ownShips.filter((ship) => !ship.isSunk).length}/5 tàu còn nổi</span></div>
        <BoardGrid ariaLabel="Bản đồ đội tàu của bạn" ships={ownShips} cell={(cell) => shotCell(cell, incoming.get(cellKey(cell)), true)} />
        <p className="board-hint">{latestIncoming ? `Đối thủ bắn: ${cellName(latestIncoming.coordinate)} · ${shotNames[latestIncoming.status]}` : 'Tàu của bạn luôn hiện tại đây, kể cả sau khi tải lại trang.'}</p>
        {focus !== 'own' && <button className="text-action expand-board" onClick={() => chooseFocus('own')}>Phóng lớn đội tàu của tôi</button>}
      </section>
    </div>
    <p className="battle-footer">{!state.opponentConnected && !state.isBot ? 'Đối thủ mất kết nối. Đang chờ kết nối lại…' : 'Mỗi lượt bắn một ô. Bắn trúng vẫn chuyển lượt.'}</p>
  </div>
}

function GameOverScreen({ state, busy, onRematch, onLeave }: { state: HubState; busy: boolean; onRematch: () => void; onLeave: () => void }) {
  const won = state.gameOver?.winner === state.player
  const opponent = state.gameOver?.opponentFleet ?? []
  return <div className="game-view game-over-view">
    <h1>{won ? 'Bạn đã chiến thắng!' : 'Hạm đội đã thất thủ.'}</h1>
    <p className="hero-lede">{won ? 'Bạn đã đánh chìm toàn bộ năm tàu đối thủ. Đại dương thuộc về bạn!' : 'Đối thủ đã đánh chìm toàn bộ tàu của bạn. Thử lại với một cách bố trí khác nhé.'}</p>
    <p className="result-summary">{state.shots.length} phát bắn · {state.isBot ? 'Đấu với máy' : `Phòng ${state.roomCode}`}</p>
    <div className="game-over-actions"><button className="primary-action" disabled={busy} onClick={onRematch}>{busy ? 'Đang chuẩn bị…' : state.isBot ? 'Chơi lại với máy' : 'Yêu cầu chơi lại'}</button><button className="secondary-action" onClick={onLeave}>Trở về sảnh</button></div>
    <p className="board-hint" role="status">{state.message}</p>
    <div className="final-boards"><div><h2>Đội tàu đối thủ được tiết lộ</h2><BoardGrid ariaLabel="Vị trí đội tàu đối thủ sau trận đấu" ships={opponent} cell={(cell) => {
      const ship = opponent.find((item) => item.hits.some((part) => cellKey(part) === cellKey(cell)))
      const status = ship ? ship.isSunk ? 'Sunk' : 'Hit' : undefined
      return <div className={`grid-cell own-cell ${status ? `shot-${status.toLowerCase()}` : ''}`}>{status && <ShotMark status={status} />}</div>
    }} /></div><div><h2>Đội tàu của bạn</h2><BoardGrid ariaLabel="Đội tàu của bạn sau trận đấu" ships={state.ownBoard?.ships} cell={(cell) => {
      const shot = state.incomingShots.find((s) => cellKey(s.coordinate) === cellKey(cell))
      const ship = state.ownBoard?.ships.find((item) => item.cells.some((part) => cellKey(part) === cellKey(cell)))
      const status = shot ? ship?.isSunk && shot.status !== 'Miss' ? 'Sunk' : shot.status : undefined
      return <div className={`grid-cell own-cell ${status ? `shot-${status.toLowerCase()}` : ''}`}>{status && <ShotMark status={status} />}</div>
    }} /></div></div>
  </div>
}

function GameHeader({ title, detail }: { title: string; detail: string }) {
  return <div className="game-header"><h1>{title}</h1><p>{detail}</p></div>
}
export default App
