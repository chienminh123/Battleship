import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { useGameHub } from './useGameHub'
import { RoomChat } from './RoomChat'
import { PlayerPanel, Countdown } from './PlayerPanel'
import { useAccount } from './useAccount'
import { GameSettings } from './GameSettings'
import { MatchExitDialog } from './MatchExitDialog'
import { useGamePreferences } from './useGamePreferences'
import { battleSound } from './battleSound'
import { useBattleTimeline } from './useBattleTimeline'
import { copyText } from './clipboard'
import { randomFleet, savedFleet } from './fleetPlacement'
import { makeDefaultFleet } from './types'
import { botDifficultyNames, shotNames } from './i18n'
import type { FleetPlacement, ShipType } from './types'
import { Lobby } from './screens/Lobby'
import { PlacementScreen } from './screens/PlacementScreen'
import { BattleScreen } from './screens/BattleScreen'
import { GameOverScreen } from './screens/GameOverScreen'

// Extra time the result stays on screen before the boards switch.
const SWITCH_DELAY_MS = 900

function App() {
  const account = useAccount()
  const { state, createRoom, createBotRoom, joinRoom, joinReserved, submitFleet, fire, rematch, leaveRoom, retryConnection, sendChat, surrender } = useGameHub(account.identityVersion)
  const enteringRoom = useRef('')
  const leftRoom = useRef('')
  const activeRoom = account.community?.activeRoom
  const refreshProfile = account.refreshProfile
  const accountId = account.session.user?.id
  useEffect(() => {
    const room = activeRoom
    if (!room || state.roomCode || !state.connected || state.identityVersion !== account.identityVersion || enteringRoom.current === room.code || leftRoom.current === room.code) return
    enteringRoom.current = room.code
    void joinReserved(room.code, room.playerToken).finally(() => { enteringRoom.current = '' }).catch(() => {})
  }, [activeRoom, account.identityVersion, state.roomCode, state.connected, state.identityVersion, joinReserved])
  useEffect(() => {
    if (state.phase !== 'Finished' || !accountId) return
    let disposed = false, timer: ReturnType<typeof setTimeout>
    const refresh = async () => {
      try {
        const profile = await refreshProfile()
        if (profile?.history.some((match) => match.id === state.matchId && match.state === 'Finished')) return
      } catch { /* The server retries result persistence with the same match ID. */ }
      if (!disposed) timer = setTimeout(() => { void refresh() }, 2500)
    }
    void refresh()
    return () => { disposed = true; clearTimeout(timer) }
  }, [state.phase, state.matchId, accountId, refreshProfile])
  const { preferences, update: updatePreferences } = useGamePreferences()
  // Linger on each result instead of swapping boards the instant the effect ends.
  const [autoSwitch, setAutoSwitch] = useState(true)
  const { activeEvent, heldEvent, presenting } = useBattleTimeline(state.liveEvents, autoSwitch ? SWITCH_DELAY_MS : 0)
  const showResult = state.phase === 'Finished' && !presenting
  useEffect(() => {
    battleSound.configure(preferences)
    const visibility = () => battleSound.visibility()
    document.addEventListener('visibilitychange', visibility)
    return () => document.removeEventListener('visibilitychange', visibility)
  }, [preferences])
  useEffect(() => {
    if (showResult && state.gameOver && state.liveEvents.length) battleSound.result(state.gameOver.winner === state.player)
    return () => battleSound.cancel()
  }, [showResult, state.gameOver, state.player, state.liveEvents.length])
  const [joinCode, setJoinCode] = useState('')
  const [fleets, setFleets] = useState<Record<string, FleetPlacement[]>>({})
  const [selectedShip, setSelectedShip] = useState<ShipType>('Carrier')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const actionPending = useRef(false)
  const [exitRequest, setExitRequest] = useState<{ surrender: boolean; room: string; phase: string } | null>(null)
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
        && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)
        && !(event.target instanceof HTMLSelectElement) && !(event.target instanceof HTMLElement && event.target.isContentEditable)) { event.preventDefault(); rotate() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rotate, state.phase, state.fleetSubmitted])
  useEffect(() => {
    if (fleetKey && state.phase === 'Placing' && !state.fleetSubmitted) localStorage.setItem(fleetKey, JSON.stringify(fleet))
  }, [fleetKey, fleet, state.phase, state.fleetSubmitted])

  const run = async (action: () => Promise<unknown>, success?: string) => {
    if (actionPending.current) return
    actionPending.current = true
    setBusy(true); setNotice('')
    try { await action(); if (success) setNotice(success) }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Không thể thực hiện. Hãy thử lại.') }
    finally { actionPending.current = false; setBusy(false) }
  }
  const leaveCurrentRoom = async () => {
    leftRoom.current = state.roomCode
    try { await leaveRoom() }
    catch (error) { leftRoom.current = ''; throw error }
    // Leaving has succeeded; a profile refresh failure must not undo it.
    await account.refreshCommunity().catch(() => {})
  }
  const copyRoomCode = async () => {
    try {
      await copyText(state.roomCode)
      setNotice('Đã sao chép mã phòng.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Không thể sao chép mã phòng. Hãy chọn mã và sao chép thủ công.')
    }
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
        <span>{state.connected ? 'ĐÃ KẾT NỐI' : state.restoring ? 'ĐANG KHÔI PHỤC' : 'ĐANG KẾT NỐI'}</span>
        {hasRoom && <><span className="meta-divider" /><span className="room-code-meta">{state.isBot ? 'ĐẤU VỚI MÁY' : <>PHÒNG {state.roomCode}<CopyRoomButton onCopy={copyRoomCode} compact /></>}</span>
          <button className="mode-button" aria-label="Chuyển giao diện bàn cờ" aria-pressed={threeDimensional} onClick={() => setBoardMode(!threeDimensional)}><span className="mode-long">{threeDimensional ? '3D / 2D' : '2D / 3D'}</span><span className="mode-short" aria-hidden="true">{threeDimensional ? '3D' : '2D'}</span></button>
          {state.phase === 'Playing' && <button className="leave-button" disabled={busy || !state.connected} onClick={() => setExitRequest({ surrender: true, room: state.roomCode, phase: state.phase })}>Đầu hàng</button>}
          <button className="leave-button" disabled={busy || !state.connected} onClick={() => setExitRequest({ surrender: false, room: state.roomCode, phase: state.phase })}>Rời trận</button></>}
        <PlayerPanel account={account} inRoom={hasRoom} connected={state.connected && state.identityVersion === account.identityVersion} />
        <GameSettings preferences={preferences} onChange={updatePreferences} />
      </div>
    </header>
    <div className="page-grid">
      <aside className="side-rail"><p className="rail-copy">Hai hạm đội.<br />Một đại dương.</p><div className="rail-rule" /><p className="form-note">Giấu đội tàu.<br />Chọn tọa độ.<br />Đánh chìm đối thủ.</p></aside>
      <section className="workspace">
        {hasRoom && state.isBot && <p className="bot-match-note">Đấu với máy · {botDifficultyNames[state.botDifficulty ?? 'Easy']}</p>}
        {hasRoom && state.mode === 'Ranked' && <div className="ranked-match-note"><strong>Trận xếp hạng · Tính Elo</strong><span>{state.phase === 'Placing' ? 'Thời gian xếp tàu: ' : state.phase === 'Playing' ? 'Thời gian lượt: ' : 'Trận đã kết thúc'}{state.phase !== 'Finished' && <Countdown until={state.phase === 'Placing' ? state.placementDeadlineUtc : state.turnDeadlineUtc} />}</span></div>}
        {state.error && <div className="alert-bar" role="alert">{state.error}<button onClick={() => void retryConnection()}>Kết nối lại</button></div>}
        {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Đóng thông báo">×</button></div>}
        {!hasRoom && <Lobby connected={state.connected && state.identityVersion === account.identityVersion} busy={busy} joinCode={joinCode} setJoinCode={setJoinCode}
          threeDimensional={threeDimensional} quality={preferences.quality} onBoardMode={setBoardMode} onCreate={() => run(createRoom)} onBot={(difficulty) => run(() => createBotRoom(difficulty))} onJoin={() => run(() => joinRoom(joinCode))} />}
        {hasRoom && state.phase === 'WaitingForOpponent' && <div className="waiting-view">
          <h1>Phòng đã sẵn sàng.<br /><em>Mời bạn cùng chơi.</em></h1>
          <p className="hero-lede">Gửi mã sáu ký tự này cho bạn bè. Đối thủ vào phòng là có thể bắt đầu xếp tàu.</p>
          <div className="room-code"><span>{state.roomCode}</span><CopyRoomButton onCopy={copyRoomCode} /></div>
          <p className="waiting-note" role="status">Đang chờ đối thủ vào phòng…</p>
          <button className="text-action" onClick={() => void run(leaveCurrentRoom)}>Trở về sảnh</button>
        </div>}
        {hasRoom && state.phase === 'Placing' && <PlacementScreen fleet={fleet} selected={selectedShip} onSelect={setSelectedShip}
          onPlace={(cell) => updateFleet((current) => current.map((ship) => ship.type === selectedShip ? { ...ship, start: cell } : ship))}
          onRotate={rotate} onRandom={() => updateFleet(randomFleet)} onSubmit={() => run(() => submitFleet(fleet))}
          submitted={state.fleetSubmitted} opponentReady={state.opponentFleetSubmitted} busy={busy || !state.connected} threeDimensional={threeDimensional} quality={preferences.quality} onFallback={useTwoDimensionalFallback} />}
        {hasRoom && (state.phase === 'Playing' || (state.phase === 'Finished' && !showResult)) && <BattleScreen state={state} busy={busy} activeEvent={activeEvent} heldEvent={heldEvent} autoSwitch={autoSwitch} onAutoSwitch={setAutoSwitch} presenting={presenting} quality={preferences.quality} threeDimensional={threeDimensional} onFallback={useTwoDimensionalFallback} onFire={(cell) => run(async () => {
          const result = await fire(cell); if (!result.accepted) throw new Error(shotNames[result.status])
        })} />}
        {hasRoom && showResult && <GameOverScreen state={state} profile={account.profile} busy={busy || !state.connected} quality={preferences.quality} threeDimensional={threeDimensional} onFallback={useTwoDimensionalFallback} onRematch={() => run(rematch)} onLeave={() => void run(leaveCurrentRoom)} />}
      </section>
    </div>
    {hasRoom && !state.isBot && state.player && <RoomChat key={`${state.roomCode}:${state.player}`} roomCode={state.roomCode} player={state.player}
      messages={state.chatMessages} connected={state.connected} opponentConnected={state.opponentConnected} onSend={sendChat} />}
    {exitRequest && exitRequest.room === state.roomCode && exitRequest.phase === state.phase && state.connected && !busy && <MatchExitDialog
      surrender={exitRequest.surrender} playing={state.phase === 'Playing'} onCancel={() => setExitRequest(null)}
      onConfirm={() => { setExitRequest(null); void run(exitRequest.surrender ? surrender : leaveCurrentRoom) }} />}
  </main>
}

function CopyRoomButton({ onCopy, compact = false }: { onCopy: () => void; compact?: boolean }) {
  return <button type="button" className={`copy-room-button${compact ? ' copy-room-button-compact' : ''}`}
    aria-label="Sao chép mã phòng" title="Sao chép mã phòng" onClick={onCopy}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
    </svg>{!compact && <span>Sao chép</span>}
  </button>
}

export default App
