import { useCallback, useEffect, useRef, useState } from 'react'
import { HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr'
import type {
  BoardView,
  Coordinate,
  CreateRoomResponse,
  FleetPlacementDto,
  FireResponse,
  GameOverMessage,
  GamePhase,
  GameShotStatus,
  JoinRoomResponse,
  PlayerId,
  ShotHistoryItem,
  ShipType,
  SubmitFleetResponse,
} from './types'

type HubState = {
  connected: boolean
  phase: GamePhase
  roomCode: string
  player?: PlayerId
  token?: string
  currentPlayer?: PlayerId
  opponentConnected: boolean
  fleetSubmitted: boolean
  opponentFleetSubmitted: boolean
  isYourTurn: boolean
  ownBoard?: BoardView
  shots: ShotHistoryItem[]
  incomingShots: { coordinate: Coordinate; status: GameShotStatus; sunkShip?: ShipType }[]
  gameOver?: GameOverMessage
  message: string
  error?: string
}

const initialState: HubState = {
  connected: false,
  phase: 'WaitingForOpponent',
  roomCode: '',
  opponentConnected: false,
  fleetSubmitted: false,
  opponentFleetSubmitted: false,
  isYourTurn: false,
  shots: [],
  incomingShots: [],
  message: 'Establishing a secure link…',
}

const roomStorageKey = 'battleship-room'
const tokenStorageKey = 'battleship-player-token'

export function useGameHub() {
  const connectionRef = useRef<ReturnType<typeof HubConnectionBuilder.prototype.build> | null>(null)
  const [state, setState] = useState<HubState>(() => ({
    ...initialState,
    roomCode: localStorage.getItem(roomStorageKey) ?? '',
  }))

  const applyJoin = useCallback((response: JoinRoomResponse) => {
    localStorage.setItem(roomStorageKey, response.code)
    localStorage.setItem(tokenStorageKey, response.playerToken)
    setState((current) => ({
      ...current,
      roomCode: response.code,
      token: response.playerToken,
      player: response.player,
      phase: response.phase,
      currentPlayer: response.currentPlayer,
      isYourTurn: response.isYourTurn,
      opponentConnected: response.opponentConnected,
      fleetSubmitted: response.ownFleetSubmitted,
      opponentFleetSubmitted: response.opponentFleetSubmitted,
      ownBoard: response.ownBoard,
      shots: response.shotsAgainstOpponent ?? [],
      incomingShots: response.shotsAgainstYou ?? [],
      gameOver: response.result,
      message: response.phase === 'Playing' ? 'Fleet locked. Await your firing order.' : response.opponentConnected ? 'Both stations connected. Plot your fleet.' : 'Share the room code with your opponent.',
      error: undefined,
    }))
  }, [])

  useEffect(() => {
    const connection = new HubConnectionBuilder()
      .withUrl(import.meta.env.DEV ? 'http://localhost:8181/hub/game' : '/hub/game')
      .withAutomaticReconnect([0, 1000, 3000, 5000])
      .configureLogging(LogLevel.Warning)
      .build()
    connectionRef.current = connection

    connection.onreconnecting(() => setState((current) => ({ ...current, connected: false, message: 'Signal lost. Reconnecting to your station…' })))
    connection.onreconnected(async () => {
      setState((current) => ({ ...current, connected: true, message: 'Link restored. Rejoining your station…' }))
      const code = localStorage.getItem(roomStorageKey)
      const token = localStorage.getItem(tokenStorageKey)
      if (code && token) {
        try {
          applyJoin(await connection.invoke<JoinRoomResponse>('JoinRoom', code, token))
        } catch {
          setState((current) => ({ ...current, error: 'Your saved room is no longer available.', message: 'Choose a new room to return to the sea.' }))
        }
      }
    })
    connection.onclose(() => setState((current) => ({ ...current, connected: false, message: 'Connection closed. Try reconnecting.' })))

    connection.on('OpponentJoined', () => setState((current) => ({ ...current, phase: 'Placing', opponentConnected: true, message: 'Opponent on station. Plot your fleet.' })))
    connection.on('OpponentReconnected', () => setState((current) => ({ ...current, opponentConnected: true, message: 'Opponent link restored.' })))
    connection.on('OpponentReady', () => setState((current) => ({ ...current, opponentFleetSubmitted: true, message: 'Opponent fleet locked. Submit yours to begin.' })))
    connection.on('OpponentLeft', () => setState((current) => ({ ...current, opponentConnected: false, message: 'Opponent connection lost. Waiting for them to return…' })))
    connection.on('RematchRequested', () => setState((current) => ({ ...current, message: 'Opponent asked for a rematch. Select Rematch to accept.' })))
    connection.on('GameStarted', (payload: { isYourTurn: boolean }) => setState((current) => ({ ...current, phase: 'Playing', isYourTurn: payload.isYourTurn, message: payload.isYourTurn ? 'You have the first firing order.' : 'Opponent has the first firing order.' })))
    connection.on('ShotResult', (payload: ShotHistoryItem & { winner?: PlayerId }) => setState((current) => ({
      ...current,
      shots: [...current.shots, payload],
      isYourTurn: payload.status !== 'Won' ? false : false,
      currentPlayer: payload.status === 'Won' ? current.player : current.player === 'One' ? 'Two' : 'One',
      message: payload.status === 'Won' ? 'Direct hit. All opposing ships are down.' : payload.status === 'Sunk' ? `${payload.sunkShip} sunk. Return fire expected.` : payload.status === 'Hit' ? 'Hit confirmed. Return fire expected.' : 'Shot splashed. Return fire expected.',
    })))
    connection.on('IncomingShot', (payload: { coordinate: Coordinate; status: GameShotStatus; sunkShip?: ShipType }) => setState((current) => ({
      ...current,
      incomingShots: [...current.incomingShots, payload],
      isYourTurn: true,
      currentPlayer: current.player,
      message: payload.status === 'Sunk' ? `Incoming: ${payload.sunkShip} has been sunk.` : payload.status === 'Hit' ? 'Incoming hit. Fire when ready.' : 'Incoming shot missed. Fire when ready.',
    })))
    connection.on('GameOver', (payload: GameOverMessage) => setState((current) => ({ ...current, phase: 'Finished', gameOver: payload, isYourTurn: false, message: payload.winner === current.player ? 'Mission complete.' : 'Your fleet has been defeated.' })))
    connection.on('RematchStarted', async () => {
      const code = localStorage.getItem(roomStorageKey)
      const token = localStorage.getItem(tokenStorageKey)
      if (code && token) applyJoin(await connection.invoke<JoinRoomResponse>('JoinRoom', code, token))
    })

    connection.start().then(async () => {
      setState((current) => ({ ...current, connected: true, message: current.roomCode ? 'Restoring your station…' : 'Link ready. Create or join a room.' }))
      const code = localStorage.getItem(roomStorageKey)
      const token = localStorage.getItem(tokenStorageKey)
      if (code && token) {
        try { applyJoin(await connection.invoke<JoinRoomResponse>('JoinRoom', code, token)) } catch { /* The lobby can recover from an expired room. */ }
      }
    }).catch(() => setState((current) => ({ ...current, error: 'Cannot reach the game server.', message: 'Check the server and try again.' })))

    return () => { connection.stop() }
  }, [applyJoin])

  const invoke = useCallback(async <T,>(method: string, ...args: unknown[]) => {
    const connection = connectionRef.current
    if (!connection || connection.state !== HubConnectionState.Connected) throw new Error('Connection is not ready')
    return connection.invoke<T>(method, ...args)
  }, [])

  const createRoom = useCallback(async () => {
    const result = await invoke<CreateRoomResponse>('CreateRoom')
    localStorage.setItem(roomStorageKey, result.code)
    localStorage.setItem(tokenStorageKey, result.playerToken)
    setState((current) => ({ ...current, roomCode: result.code, token: result.playerToken, player: result.player, phase: 'WaitingForOpponent', opponentConnected: false, fleetSubmitted: false, message: 'Room secured. Share the code with your opponent.', error: undefined }))
  }, [invoke])

  const joinRoom = useCallback(async (code: string) => applyJoin(await invoke<JoinRoomResponse>('JoinRoom', code.trim().toUpperCase(), null)), [applyJoin, invoke])
  const submitFleet = useCallback(async (fleet: FleetPlacementDto[]) => {
    const result = await invoke<SubmitFleetResponse>('SubmitFleet', fleet)
    if (!result.accepted) {
      setState((current) => ({ ...current, error: result.errors?.map((error) => error.code).join(' · ') ?? result.error ?? 'Fleet rejected', message: 'Fleet not locked. Check the plotted cells.' }))
    } else {
      setState((current) => ({ ...current, phase: result.phase, fleetSubmitted: true, message: result.phase === 'Playing' ? 'Fleet locked. Await your firing order.' : 'Fleet locked. Waiting for opponent.' }))
    }
    return result
  }, [invoke])
  const fire = useCallback(async (coordinate: Coordinate) => invoke<FireResponse>('Fire', coordinate.x, coordinate.y), [invoke])
  const rematch = useCallback(async () => {
    await invoke<void>('Rematch')
    setState((current) => ({ ...current, message: 'Rematch request sent. Waiting for your opponent.' }))
  }, [invoke])
  const leaveRoom = useCallback(() => {
    localStorage.removeItem(roomStorageKey)
    localStorage.removeItem(tokenStorageKey)
    window.location.reload()
  }, [])

  return { state, createRoom, joinRoom, submitFleet, fire, rematch, leaveRoom }
}
