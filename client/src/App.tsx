import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { useGameHub } from './useGameHub'
import type { HubState } from './useGameHub'
import { BoardGrid, ShipDrawing, ShotMark } from './BoardGrid'
import { OceanBoard3D } from './Board3D'
import { GameSettings } from './GameSettings'
import { useGamePreferences } from './useGamePreferences'
import { battleSound } from './battleSound'
import { revealedShips, shotStatus, sunkCellKeys } from './battlePresentation'
import type { BattleEvent, GraphicsQuality } from './battlePresentation'
import { useBattleTimeline } from './useBattleTimeline'
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
  const { preferences, update: updatePreferences } = useGamePreferences()
  const { activeEvent, presenting } = useBattleTimeline(state.liveEvents)
  const showResult = state.phase === 'Finished' && !presenting
  useEffect(() => {
    battleSound.configure({ ...preferences, playing: state.phase === 'Playing' })
    const visibility = () => battleSound.visibility()
    document.addEventListener('visibilitychange', visibility)
    return () => document.removeEventListener('visibilitychange', visibility)
  }, [preferences, state.phase])
  useEffect(() => {
    if (showResult && state.gameOver && state.liveEvents.length) battleSound.result(state.gameOver.winner === state.player)
    return () => battleSound.cancel()
  }, [showResult, state.gameOver, state.player, state.liveEvents.length])
  const [joinCode, setJoinCode] = useState('')
  const [fleets, setFleets] = useState<Record<string, FleetPlacement[]>>({})
  const [selectedShip, setSelectedShip] = useState<ShipType>('Carrier')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [threeDimensional, setThreeDimensional] = useState(() => localStorage.getItem('battleship-view-mode') !== '2d')
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
  const setBoardMode = useCallback((enabled: boolean) => {
    localStorage.setItem('battleship-view-mode', enabled ? '3d' : '2d')
    setThreeDimensional(enabled)
  }, [])
  const useTwoDimensionalFallback = useCallback(() => setBoardMode(false), [setBoardMode])
  const hasRoom = Boolean(state.roomCode)
  return <main className={`app-shell ${hasRoom ? 'in-game' : ''}`} onPointerDownCapture={() => battleSound.unlock()} onKeyDownCapture={() => battleSound.unlock()}>
    <header className="topbar">
      <div className="brand"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>BATTLESHIP <small>/ HẢI CHIẾN</small></span></div>
      <div className="topbar-meta"><span className={`connection-dot ${state.connected ? 'is-live' : ''}`} />
        <span>{state.connected ? 'ĐÃ KẾT NỐI' : 'ĐANG KẾT NỐI'}</span>
        {hasRoom && <><span className="meta-divider" /><span>{state.isBot ? 'ĐẤU VỚI MÁY' : `PHÒNG ${state.roomCode}`}</span>
          <button className="mode-button" aria-label="Chuyển giao diện bàn cờ" aria-pressed={threeDimensional} onClick={() => setBoardMode(!threeDimensional)}>{threeDimensional ? '3D / 2D' : '2D / 3D'}</button>
          <button className="leave-button" onClick={() => { if (window.confirm('Rời trận đấu và trở về sảnh?')) leaveRoom() }}>Rời trận</button></>}
        <GameSettings preferences={preferences} onChange={updatePreferences} />
      </div>
    </header>
    <div className="page-grid">
      <aside className="side-rail"><p className="rail-copy">Hai hạm đội.<br />Một đại dương.</p><div className="rail-rule" /><p className="form-note">Giấu đội tàu.<br />Chọn tọa độ.<br />Đánh chìm đối thủ.</p></aside>
      <section className="workspace">
        {state.error && <div className="alert-bar" role="alert">{state.error}<button onClick={() => window.location.reload()}>Kết nối lại</button></div>}
        {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Đóng thông báo">×</button></div>}
        {!hasRoom && <Lobby connected={state.connected} busy={busy} joinCode={joinCode} setJoinCode={setJoinCode}
          threeDimensional={threeDimensional} quality={preferences.quality} onBoardMode={setBoardMode} onCreate={() => run(createRoom)} onBot={() => run(createBotRoom)} onJoin={() => run(() => joinRoom(joinCode))} />}
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
          submitted={state.fleetSubmitted} opponentReady={state.opponentFleetSubmitted} busy={busy || !state.connected} threeDimensional={threeDimensional} quality={preferences.quality} onFallback={useTwoDimensionalFallback} />}
        {hasRoom && (state.phase === 'Playing' || (state.phase === 'Finished' && !showResult)) && <BattleScreen state={state} busy={busy} activeEvent={activeEvent} presenting={presenting} quality={preferences.quality} threeDimensional={threeDimensional} onFallback={useTwoDimensionalFallback} onFire={(cell) => run(async () => {
          const result = await fire(cell); if (!result.accepted) throw new Error(shotNames[result.status])
        })} />}
        {hasRoom && showResult && <GameOverScreen state={state} busy={busy || !state.connected} quality={preferences.quality} threeDimensional={threeDimensional} onFallback={useTwoDimensionalFallback} onRematch={() => run(rematch)} onLeave={leaveRoom} />}
      </section>
    </div>
  </main>
}

function Lobby({ connected, busy, joinCode, setJoinCode, threeDimensional, quality, onBoardMode, onCreate, onBot, onJoin }: {
  connected: boolean; busy: boolean; joinCode: string; setJoinCode: (code: string) => void
  threeDimensional: boolean; onBoardMode: (enabled: boolean) => void
  quality: GraphicsQuality
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
  </div>
  <section className="ocean-preview" aria-label="Xem trước bản đồ hải chiến">
    <div className="preview-toolbar"><h2>Chiến trường 3D</h2><div className="board-tabs" role="group" aria-label="Chọn giao diện bàn cờ">
      <button aria-pressed={threeDimensional} onClick={() => onBoardMode(true)}>3D</button>
      <button aria-pressed={!threeDimensional} onClick={() => onBoardMode(false)}>2D</button>
    </div></div>
    {threeDimensional ? <OceanBoard3D quality={quality} label="Bản đồ xem trước: năm tàu đặt hợp lệ, một phát bắn trượt" ships={fleetViews(makeDefaultFleet())}
      shots={[{ coordinate: { x: 7, y: 0 }, status: 'Miss' }]} onUnavailable={() => onBoardMode(false)} />
      : <BoardGrid ariaLabel="Bản đồ xem trước 2D" ships={fleetViews(makeDefaultFleet())} cell={(cell) => cell.x === 7 && cell.y === 0
        ? <div className="grid-cell shot-miss"><ShotMark status="Miss" /></div> : <div className="grid-cell" />} />}
    <p className="preview-caption">{threeDimensional ? 'Toàn cảnh hạm đội · Bật Xoay để khám phá góc nhìn khác.' : 'Màn hình phẳng 2D, hoạt động trên mọi thiết bị.'}</p>
  </section></div>
}

function PlacementScreen({ fleet, selected, onSelect, onPlace, onRotate, onRandom, onSubmit, submitted, opponentReady, busy, threeDimensional, quality, onFallback }: {
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

function BattleScreen({ state, busy, threeDimensional, quality, activeEvent, presenting, onFallback, onFire }: {
  state: HubState; busy: boolean; threeDimensional: boolean; quality: GraphicsQuality
  activeEvent?: BattleEvent; presenting: boolean; onFallback: () => void; onFire: (cell: Coordinate) => void
}) {
  const [focus, setFocus] = useState<'enemy' | 'own'>(state.isYourTurn ? 'enemy' : 'own')
  const [autoSwitch, setAutoSwitch] = useState(true)
  const [selected, setSelected] = useState<Coordinate | null>(null)
  useEffect(() => {
    if (!autoSwitch) return
    const timer = window.setTimeout(() => setFocus(activeEvent?.board ?? (state.isYourTurn ? 'enemy' : 'own')), 0)
    return () => window.clearTimeout(timer)
  }, [state.isYourTurn, activeEvent, autoSwitch])
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

function GameOverScreen({ state, busy, threeDimensional, quality, onFallback, onRematch, onLeave }: { state: HubState; busy: boolean; threeDimensional: boolean; quality: GraphicsQuality; onFallback: () => void; onRematch: () => void; onLeave: () => void }) {
  const won = state.gameOver?.winner === state.player
  const opponent = state.gameOver?.opponentFleet ?? []
  return <div className="game-view game-over-view">
    <h1>{won ? 'Bạn đã chiến thắng!' : 'Hạm đội đã thất thủ.'}</h1>
    <p className="hero-lede">{won ? 'Bạn đã đánh chìm toàn bộ năm tàu đối thủ. Đại dương thuộc về bạn!' : 'Đối thủ đã đánh chìm toàn bộ tàu của bạn. Thử lại với một cách bố trí khác nhé.'}</p>
    <p className="result-summary">{state.shots.length} phát bắn · {state.isBot ? 'Đấu với máy' : `Phòng ${state.roomCode}`}</p>
    <div className="game-over-actions"><button className="primary-action" disabled={busy} onClick={onRematch}>{busy ? 'Đang chuẩn bị…' : state.isBot ? 'Chơi lại với máy' : 'Yêu cầu chơi lại'}</button><button className="secondary-action" onClick={onLeave}>Trở về sảnh</button></div>
    <p className="board-hint" role="status">{state.message}</p>
    <div className="final-boards"><div><h2>Đội tàu đối thủ được tiết lộ</h2>{threeDimensional
      ? <OceanBoard3D label="Đội tàu đối thủ được tiết lộ sau trận đấu" quality={quality} showWrecks ships={opponent} shots={state.shots} onUnavailable={onFallback} />
      : <BoardGrid ariaLabel="Vị trí đội tàu đối thủ sau trận đấu" ships={opponent} cell={(cell) => {
        const shot = state.shots.find((item) => cellKey(item.coordinate) === cellKey(cell))
        const status = shotStatus(shot, sunkCellKeys(state.shots, opponent))
        return <div className={`grid-cell own-cell ${status ? `shot-${status.toLowerCase()}` : ''}`}>{status && <ShotMark status={status} />}</div>
      }} />}</div><div><h2>Đội tàu của bạn</h2>{threeDimensional
      ? <OceanBoard3D label="Đội tàu của bạn sau trận đấu" quality={quality} showWrecks ships={state.ownBoard?.ships} shots={state.incomingShots} onUnavailable={onFallback} />
      : <BoardGrid ariaLabel="Đội tàu của bạn sau trận đấu" ships={state.ownBoard?.ships} cell={(cell) => {
        const shot = state.incomingShots.find((s) => cellKey(s.coordinate) === cellKey(cell))
        const status = shotStatus(shot, sunkCellKeys(state.incomingShots, state.ownBoard?.ships))
        return <div className={`grid-cell own-cell ${status ? `shot-${status.toLowerCase()}` : ''}`}>{status && <ShotMark status={status} />}
      </div> }} />}</div></div>
  </div>
}

function GameHeader({ title, detail }: { title: string; detail: string }) {
  return <div className="game-header"><h1>{title}</h1><p>{detail}</p></div>
}
export default App
