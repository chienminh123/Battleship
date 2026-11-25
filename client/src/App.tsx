import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import './App.css'
import { useGameHub } from './useGameHub'
import {
  fleetSpecs,
  makeDefaultFleet,
  sameCoordinate,
  shipLength,
  type Coordinate,
  type FleetPlacement,
  type GameShotStatus,
  type ShipView,
  type ShipType,
} from './types'

const letters = 'ABCDEFGHIJ'.split('')
const emptyShips: ShipView[] = []

function App() {
  const { state, createRoom, joinRoom, submitFleet, fire, rematch, leaveRoom } = useGameHub()
  const [joinCode, setJoinCode] = useState('')
  const [fleetsByRoom, setFleetsByRoom] = useState<Record<string, FleetPlacement[]>>({})
  const [selectedShip, setSelectedShip] = useState<ShipType>('Carrier')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (action: () => Promise<unknown>, success?: string) => {
    setBusy(true)
    try {
      await action()
      if (success) setNotice(success)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The operation could not be completed.')
    } finally {
      setBusy(false)
    }
  }

  const handleSubmitFleet = () => run(async () => {
    const response = await submitFleet(fleet)
    if (!response.accepted) throw new Error('The server rejected this fleet. Review the marked coordinates.')
  })

  const hasRoom = Boolean(state.roomCode)
  const savedFleetKey = state.roomCode && state.player ? `battleship-fleet:${state.roomCode}:${state.player}` : ''
  const storedFleet = useMemo(() => {
    if (!savedFleetKey) return undefined
    const saved = localStorage.getItem(savedFleetKey)
    if (!saved) return undefined
    try { return JSON.parse(saved) as FleetPlacement[] } catch { return undefined }
  }, [savedFleetKey])
  const submittedFleet = useMemo(() => {
    if (!state.fleetSubmitted || !state.ownBoard?.ships.length) return undefined
    return state.ownBoard.ships.map((ship) => ({
      type: ship.type,
      start: ship.cells[0],
      orientation: ship.cells.length > 1 && ship.cells[0].y === ship.cells[1].y ? 'Horizontal' as const : 'Vertical' as const,
    }))
  }, [state.fleetSubmitted, state.ownBoard])
  const fleet = submittedFleet ?? fleetsByRoom[savedFleetKey] ?? storedFleet ?? makeDefaultFleet()
  const updateFleet = useCallback((update: (current: FleetPlacement[]) => FleetPlacement[]) => {
    if (!savedFleetKey) return
    setFleetsByRoom((current) => ({
      ...current,
      [savedFleetKey]: update(current[savedFleetKey] ?? storedFleet ?? makeDefaultFleet()),
    }))
  }, [savedFleetKey, storedFleet])
  const handlePlacementCell = (coordinate: Coordinate) => updateFleet((current) => current.map((placement) => placement.type === selectedShip ? { ...placement, start: coordinate } : placement))
  useEffect(() => {
    const rotate = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'r' || state.phase !== 'Placing') return
      updateFleet((current) => current.map((placement) => placement.type === selectedShip
        ? { ...placement, orientation: placement.orientation === 'Horizontal' ? 'Vertical' : 'Horizontal' }
        : placement))
    }
    window.addEventListener('keydown', rotate)
    return () => window.removeEventListener('keydown', rotate)
  }, [selectedShip, state.phase, updateFleet])
  const fleetCells = useMemo(() => buildFleetCells(fleet), [fleet])
  const ownShips = state.ownBoard?.ships ?? emptyShips
  const shotMap = useMemo(() => new Map(state.shots.map((shot) => [key(shot.coordinate), shot])), [state.shots])
  const incomingMap = useMemo(() => new Map<string, { coordinate: Coordinate; status: GameShotStatus; sunkShip?: ShipType }>(state.incomingShots.map((shot) => [key(shot.coordinate), shot])), [state.incomingShots])
  const receivedMap = useMemo(() => new Map<string, { coordinate: Coordinate; status: GameShotStatus }>((state.ownBoard?.incomingShots ?? []).map((coordinate) => {
    const hit = ownShips.some((ship) => ship.hits.some((cell) => sameCoordinate(cell, coordinate)))
    return [key(coordinate), { coordinate, status: hit ? 'Hit' as const : 'Miss' as const }]
  })), [state.ownBoard, ownShips])
  const allIncomingMap = useMemo(() => new Map([...receivedMap, ...incomingMap]), [receivedMap, incomingMap])
  const revealedFleet = state.gameOver?.opponentFleet ?? emptyShips
  const revealedCells = useMemo(() => new Map(revealedFleet.flatMap((ship) => ship.cells.map((cell) => [key(cell), ship]))), [revealedFleet])
  useEffect(() => {
    if (state.phase !== 'Placing' || state.fleetSubmitted || !savedFleetKey) return
    localStorage.setItem(savedFleetKey, JSON.stringify(fleet))
  }, [fleet, savedFleetKey, state.fleetSubmitted, state.phase])

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="Battleship fleet command">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>BATTLESHIP <small>/ FLEET COMMAND</small></span>
        </div>
        <div className="topbar-meta">
          <span className={`connection-dot ${state.connected ? 'is-live' : ''}`} />
          <span>{state.connected ? 'LINK ACTIVE' : 'CONNECTING'}</span>
          {hasRoom && <><span className="meta-divider" /><span>ROOM {state.roomCode}</span></>}
        </div>
      </header>

      <div className="page-grid">
        <aside className="side-rail">
          <div className="rail-label">OPERATIONS LOG</div>
          <div className="rail-status"><span className={`status-light ${state.connected ? 'is-live' : ''}`} />{state.connected ? 'SERVER READY' : 'LINK PENDING'}</div>
          <div className="rail-rule" />
          <p className="rail-copy">Two stations.<br />One sea.<br />No second chances.</p>
          <div className="rail-coordinates" aria-hidden="true">
            <span>10° 00' N</span><span>103° 50' E</span>
          </div>
        </aside>

        <section className="workspace">
          <svg className="chart-contours" viewBox="0 0 640 420" aria-hidden="true">
            <path d="M652 13C560 6 586 71 492 72s-99-41-180-17-62 93-155 94-104-38-170-4" />
            <path d="M651 38c-72-4-66 59-164 58s-105-38-174-15-66 92-158 93S40 139-8 165" />
            <path d="M652 66c-66-1-67 54-163 55s-110-35-173-12-69 92-161 93-108-34-164-8" />
            <path d="M653 97c-70 5-73 50-167 52s-105-31-169-8-73 91-165 91-108-29-160-1" />
            <path d="M651 128c-76 8-83 47-171 49s-102-27-165-5-76 88-168 89S39 235-7 265" />
          </svg>
          {state.error && <div className="alert-bar" role="alert">{state.error}<button onClick={() => window.location.reload()}>RETRY LINK</button></div>}
          {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss message">×</button></div>}

          {!hasRoom && <Lobby busy={busy || !state.connected} onCreate={() => run(createRoom)} joinCode={joinCode} setJoinCode={setJoinCode} onJoin={() => run(() => joinRoom(joinCode), 'Room joined.')} />}
          {hasRoom && state.phase === 'WaitingForOpponent' && <WaitingRoom code={state.roomCode} onCopy={() => navigator.clipboard?.writeText(state.roomCode)} onLeave={leaveRoom} />}
          {hasRoom && state.phase === 'Placing' && <PlacementScreen fleet={fleet} selectedShip={selectedShip} setSelectedShip={setSelectedShip} fleetCells={fleetCells} onCell={handlePlacementCell} onRotate={() => updateFleet((current) => current.map((placement) => placement.type === selectedShip ? { ...placement, orientation: placement.orientation === 'Horizontal' ? 'Vertical' : 'Horizontal' } : placement))} onSubmit={handleSubmitFleet} submitted={state.fleetSubmitted} opponentReady={state.opponentFleetSubmitted} busy={busy} />}
          {hasRoom && state.phase === 'Playing' && <BattleScreen state={state} ownShips={ownShips} shotMap={shotMap} incomingMap={allIncomingMap} onFire={(coordinate) => run(async () => { const result = await fire(coordinate); if (!result.accepted) throw new Error(statusText(result.status)) })} />}
          {hasRoom && state.phase === 'Finished' && <GameOverScreen state={state} revealedCells={revealedCells} onRematch={() => run(rematch)} onLeave={leaveRoom} />}
        </section>
      </div>
    </main>
  )
}

function Lobby({ busy, onCreate, joinCode, setJoinCode, onJoin }: { busy: boolean; onCreate: () => void; joinCode: string; setJoinCode: (value: string) => void; onJoin: () => void }) {
  return <div className="lobby-view">
    <div className="hero-copy">
      <div className="section-index">CHART 01 / OPEN WATERS</div>
      <h1>Plot your course.<br /><em>Sink their fleet.</em></h1>
      <p className="hero-lede">A private two-player engagement on a 10 × 10 grid. Place five ships, take the first shot, and trust the current.</p>
      <div className="hero-specs"><span><strong>10×10</strong> GRID</span><span><strong>05</strong> SHIPS</span><span><strong>01</strong> TARGET</span></div>
    </div>
    <div className="lobby-panel">
      <div className="panel-head"><span>START A MISSION</span><span className="panel-code">N 01</span></div>
      <button className="primary-action" onClick={onCreate} disabled={busy}><span>{busy ? 'CONNECTING…' : 'CREATE NEW ROOM'}</span><b>↗</b></button>
      <div className="split-rule"><span>OR JOIN WITH A CODE</span></div>
      <label className="field-label" htmlFor="room-code">ROOM CODE</label>
      <div className="join-row"><input id="room-code" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase().slice(0, 6))} placeholder="A7K9Q2" maxLength={6} onKeyDown={(event) => event.key === 'Enter' && onJoin()} /><button onClick={onJoin} disabled={busy || joinCode.length < 4}>JOIN</button></div>
      <p className="form-note">No account. Share a code. Match history is not saved.</p>
    </div>
    <div className="tide-line"><span>EST. 2026</span><span>ANONYMOUS / SERVER AUTHORITATIVE</span><span>SCROLL TO NAVIGATE ↓</span></div>
  </div>
}

function WaitingRoom({ code, onCopy, onLeave }: { code: string; onCopy: () => void; onLeave: () => void }) {
  return <div className="waiting-view">
    <div className="section-index">CHART 02 / STANDBY</div>
    <h1>Room secured.<br /><em>Bring a friend.</em></h1>
    <p className="hero-lede">Your station is ready. Send this six-character code to the opposing captain.</p>
    <button className="room-code" onClick={onCopy} aria-label="Copy room code"><span>{code}</span><small>COPY CODE ↗</small></button>
    <div className="waiting-radar"><span className="radar-ring ring-one" /><span className="radar-ring ring-two" /><span className="radar-sweep" /><span className="radar-center" /></div>
    <p className="waiting-note"><span className="pulse" /> LISTENING FOR OPPONENT</p>
    <button className="text-action" onClick={onLeave}>← RETURN TO LOBBY</button>
  </div>
}

function PlacementScreen({ fleet, selectedShip, setSelectedShip, fleetCells, onCell, onRotate, onSubmit, submitted, opponentReady, busy }: { fleet: FleetPlacement[]; selectedShip: ShipType; setSelectedShip: (ship: ShipType) => void; fleetCells: Map<string, ShipType>; onCell: (coordinate: Coordinate) => void; onRotate: () => void; onSubmit: () => void; submitted: boolean; opponentReady: boolean; busy: boolean }) {
  const [hovered, setHovered] = useState<Coordinate | null>(null)
  const invalidCells = getInvalidFleetCells(fleet)
  const selected = fleet.find((placement) => placement.type === selectedShip)
  const preview = hovered && selected ? new Set(cellsFor({ ...selected, start: hovered }).map(key)) : new Set<string>()
  const previewInvalid = preview.size !== shipLength(selectedShip) || [...preview].some((cellKey) => invalidCells.has(cellKey) && fleetCells.get(cellKey) !== selectedShip)
  return <div className="game-view placement-view">
    <GameHeader index="03" title="Deploy your fleet" detail={opponentReady ? 'Opponent fleet locked' : 'Arrange five ships on your grid'} />
    <div className="game-layout">
      <div className="board-wrap"><div className="board-label"><span>YOUR WATERS</span><span>CLICK TO PLOT / R TO ROTATE</span></div><BoardGrid ariaLabel="Your fleet placement grid" cell={(coordinate) => {
        const ship = fleetCells.get(key(coordinate))
        const ghost = preview.has(key(coordinate))
        const isInvalid = invalidCells.has(key(coordinate)) || (ghost && previewInvalid)
        return <button className={`grid-cell ${ship ? `ship-cell ship-${ship.toLowerCase()}` : ''} ${ghost ? 'ghost-cell' : ''} ${isInvalid ? 'invalid-cell' : ''}`} disabled={submitted} onMouseEnter={() => setHovered(coordinate)} onFocus={() => setHovered(coordinate)} onMouseLeave={() => setHovered(null)} onBlur={() => setHovered(null)} onContextMenu={(event) => { event.preventDefault(); onRotate() }} onClick={() => onCell(coordinate)} aria-label={`${letters[coordinate.x]}${coordinate.y + 1}${ship ? ` ${ship}` : ''}${isInvalid ? ' invalid' : ''}`}>{ship && <span>{fleetSpecs.find((spec) => spec.type === ship)?.mark}</span>}</button>
      }} /></div>
      <aside className="fleet-panel"><div className="panel-head"><span>FLEET REGISTER</span><span className="panel-code">05 / 05</span></div><div className="fleet-list">{fleetSpecs.map((spec) => { const placement = fleet.find((item) => item.type === spec.type)!; return <button key={spec.type} className={`fleet-row ${selectedShip === spec.type ? 'is-selected' : ''}`} onClick={() => setSelectedShip(spec.type)} disabled={submitted}><span className="fleet-mark">{spec.mark}</span><span className="fleet-name">{spec.type}<small>{spec.length} CELLS / {placement.orientation === 'Horizontal' ? 'HORIZONTAL' : 'VERTICAL'}</small></span><span className="fleet-state">{submitted ? 'LOCKED' : 'READY'}</span></button> })}</div><div className="placement-actions"><button className="secondary-action" onClick={onRotate} disabled={submitted}>ROTATE SELECTED <b>R</b></button><button className="primary-action" onClick={onSubmit} disabled={submitted || busy || invalidCells.size > 0}><span>{submitted ? 'FLEET LOCKED' : busy ? 'LOCKING FLEET…' : 'LOCK FLEET'}</span><b>↗</b></button></div><p className="form-note">Ships may touch. They may not overlap or leave the chart.{invalidCells.size > 0 && !submitted && <strong className="fleet-error"> Move the marked ship to clear the chart.</strong>}</p>{opponentReady && <p className="ready-note">OPPONENT FLEET LOCKED / YOURS IS NEXT</p>}</aside>
    </div>
  </div>
}

function BattleScreen({ state, ownShips, shotMap, incomingMap, onFire }: { state: ReturnType<typeof useGameHub>['state']; ownShips: { type: ShipType; cells: Coordinate[]; hits: Coordinate[]; isSunk: boolean }[]; shotMap: Map<string, { status: GameShotStatus; sunkShip?: ShipType }>; incomingMap: Map<string, { status: GameShotStatus; sunkShip?: ShipType }>; onFire: (coordinate: Coordinate) => void }) {
  const ownShipCells = new Map(ownShips.flatMap((ship) => ship.cells.map((cell) => [key(cell), ship])))
  return <div className="game-view battle-view"><GameHeader index="04" title="Engage the enemy" detail={state.isYourTurn ? 'Your firing order' : 'Awaiting return fire'} /><div className={`turn-banner ${state.isYourTurn ? 'your-turn' : ''}`}><span className="pulse" />{state.isYourTurn ? 'YOUR TURN — SELECT A TARGET' : 'OPPONENT TURN — HOLD POSITION'}<strong>{state.roomCode}</strong></div><div className="battle-layout"><div className="board-wrap"><div className="board-label"><span>ENEMY WATERS</span><span>UNKNOWN CONTACTS</span></div><BoardGrid ariaLabel="Enemy target grid" cell={(coordinate) => { const shot = shotMap.get(key(coordinate)); const revealed = false; return <button className={`grid-cell target-cell ${shot ? `shot-${shot.status.toLowerCase()}` : ''}`} disabled={!state.isYourTurn || Boolean(shot)} onClick={() => onFire(coordinate)} aria-label={`${letters[coordinate.x]}${coordinate.y + 1}${shot ? ` ${shot.status}` : ' fire'}`}>{shot && <span>{shot.status === 'Miss' ? '·' : shot.status === 'Sunk' || shot.status === 'Won' ? '×' : '•'}</span>}{revealed && '•'}</button> }} /></div><div className="board-wrap"><div className="board-label"><span>YOUR WATERS</span><span>INCOMING FIRE</span></div><BoardGrid ariaLabel="Your fleet grid" cell={(coordinate) => { const ship = ownShipCells.get(key(coordinate)); const shot = incomingMap.get(key(coordinate)); return <div className={`grid-cell own-cell ${ship ? `ship-cell ship-${ship.type.toLowerCase()}` : ''} ${shot ? `incoming-${shot.status.toLowerCase()}` : ''}`} aria-label={`${letters[coordinate.x]}${coordinate.y + 1}${shot ? ` ${shot.status}` : ''}`}>{shot && <span>{shot.status === 'Miss' ? '·' : '×'}</span>}{ship && !shot && <span>{fleetSpecs.find((spec) => spec.type === ship.type)?.mark}</span>}</div> }} /></div></div><div className="battle-footer"><span>{state.message}</span><span>{state.shots.length.toString().padStart(2, '0')} SHOTS FIRED / {state.incomingShots.length.toString().padStart(2, '0')} RECEIVED</span></div></div>
}

function GameOverScreen({ state, revealedCells, onRematch, onLeave }: { state: ReturnType<typeof useGameHub>['state']; revealedCells: Map<string, { type: ShipType }>; onRematch: () => void; onLeave: () => void }) {
  const won = state.gameOver?.winner === state.player
  return <div className="game-view game-over-view"><div className="victory-stamp" aria-hidden="true">{won ? 'WIN' : 'LOST'}</div><div className="section-index">CHART 05 / FINAL REPORT</div><h1>{won ? <>Mission<br /><em>complete.</em></> : <>Fleet<br /><em>lost.</em></>}</h1><p className="hero-lede">{won ? 'Every opposing vessel has been sent below the surface.' : 'Your station has been overcome. Study the chart and return to the sea.'}</p><div className="final-report"><span>WINNER</span><strong>{state.gameOver?.winner === 'One' ? 'STATION ONE' : 'STATION TWO'}</strong><span>ROOM</span><strong>{state.roomCode}</strong></div><div className="game-over-actions"><button className="primary-action" onClick={onRematch}><span>REQUEST REMATCH</span><b>↗</b></button><button className="secondary-action" onClick={onLeave}>RETURN TO LOBBY</button></div><div className="mini-chart"><BoardGrid ariaLabel="Final opposing fleet chart" cell={(coordinate) => { const ship = revealedCells.get(key(coordinate)); return <div className={`grid-cell own-cell ${ship ? `ship-cell ship-${ship.type.toLowerCase()}` : ''}`}><span>{ship ? fleetSpecs.find((spec) => spec.type === ship.type)?.mark : ''}</span></div> }} /></div></div>
}

function GameHeader({ index, title, detail }: { index: string; title: string; detail: string }) { return <div className="game-header"><div><div className="section-index">CHART {index} / ACTIVE MISSION</div><h1>{title}</h1></div><p>{detail}</p></div> }

function BoardGrid({ cell, ariaLabel }: { cell: (coordinate: Coordinate) => ReactNode; ariaLabel: string }) { return <div className="board" role="grid" aria-label={ariaLabel}><div className="board-corner">N</div>{letters.map((letter) => <span className="axis axis-top" key={letter}>{letter}</span>)}{Array.from({ length: 10 }, (_, y) => <Fragment key={`row-${y}`}><span className="axis axis-left">{String(y + 1).padStart(2, '0')}</span>{Array.from({ length: 10 }, (_, x) => <div className="cell-slot" key={`${x}-${y}`} role="gridcell">{cell({ x, y })}</div>)}</Fragment>)}</div> }

function buildFleetCells(fleet: FleetPlacement[]) { const cells = new Map<string, ShipType>(); fleet.forEach((placement) => { for (let offset = 0; offset < shipLength(placement.type); offset += 1) { const coordinate = placement.orientation === 'Horizontal' ? { x: placement.start.x + offset, y: placement.start.y } : { x: placement.start.x, y: placement.start.y + offset }; if (coordinate.x >= 0 && coordinate.x < 10 && coordinate.y >= 0 && coordinate.y < 10) cells.set(key(coordinate), placement.type) } }); return cells }
function cellsFor(placement: FleetPlacement) { return Array.from({ length: shipLength(placement.type) }, (_, offset) => placement.orientation === 'Horizontal' ? { x: placement.start.x + offset, y: placement.start.y } : { x: placement.start.x, y: placement.start.y + offset }) }
function getInvalidFleetCells(fleet: FleetPlacement[]) {
  const occupied = new Map<string, ShipType>()
  const invalid = new Set<string>()
  for (const placement of fleet) {
    for (const cell of cellsFor(placement)) {
      if (cell.x < 0 || cell.x > 9 || cell.y < 0 || cell.y > 9) {
        invalid.add(key({ x: Math.max(0, Math.min(9, cell.x)), y: Math.max(0, Math.min(9, cell.y)) }))
        continue
      }
      const cellKey = key(cell)
      const otherShip = occupied.get(cellKey)
      if (otherShip) invalid.add(cellKey)
      else occupied.set(cellKey, placement.type)
    }
  }
  return invalid
}
function key(coordinate: Coordinate) { return `${coordinate.x},${coordinate.y}` }
function statusText(status: GameShotStatus) { return ({ NotYourTurn: 'It is not your turn.', GameNotReady: 'The game is not ready.', AlreadyFired: 'You already fired at that coordinate.', OutOfBounds: 'That coordinate is outside the chart.', GameFinished: 'The mission has ended.' } as Record<string, string>)[status] ?? 'The shot was rejected.' }

export default App
