import { useCallback, useEffect, useRef, useState } from 'react'
import { HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr'
import { errorText, shipNames } from './i18n'
import type { BoardView, Coordinate, CreateRoomResponse, FleetPlacementDto, FireResponse, GameOverMessage, GamePhase, JoinRoomResponse, PlayerId, ShotHistoryItem, SubmitFleetResponse } from './types'

export type HubState = {
  connected: boolean; isBot: boolean; phase: GamePhase; roomCode: string
  player?: PlayerId; token?: string; currentPlayer?: PlayerId
  opponentConnected: boolean; fleetSubmitted: boolean; opponentFleetSubmitted: boolean
  isYourTurn: boolean; ownBoard?: BoardView; shots: ShotHistoryItem[]
  incomingShots: ShotHistoryItem[]; gameOver?: GameOverMessage; message: string; error?: string
}
const initialState: HubState = {
  connected: false, isBot: false, phase: 'WaitingForOpponent', roomCode: '',
  opponentConnected: false, fleetSubmitted: false, opponentFleetSubmitted: false,
  isYourTurn: false, shots: [], incomingShots: [], message: 'Đang kết nối đến máy chủ…',
}
const roomStorageKey = 'battleship-room'
const tokenStorageKey = 'battleship-player-token'

export function useGameHub() {
  const connectionRef = useRef<ReturnType<typeof HubConnectionBuilder.prototype.build> | null>(null)
  const [state, setState] = useState<HubState>(initialState)

  const applyJoin = useCallback((response: JoinRoomResponse) => {
    localStorage.setItem(roomStorageKey, response.code)
    localStorage.setItem(tokenStorageKey, response.playerToken)
    setState((current) => ({
      ...current, roomCode: response.code, token: response.playerToken, player: response.player,
      isBot: response.isBot, phase: response.phase, currentPlayer: response.currentPlayer,
      isYourTurn: response.isYourTurn, opponentConnected: response.opponentConnected,
      fleetSubmitted: response.ownFleetSubmitted, opponentFleetSubmitted: response.opponentFleetSubmitted,
      ownBoard: response.ownBoard, shots: response.shotsAgainstOpponent ?? [],
      incomingShots: response.shotsAgainstYou ?? [], gameOver: response.result,
      message: response.phase === 'Finished' ? 'Trận đấu đã kết thúc. Bạn có thể chơi lại hoặc trở về sảnh.'
        : response.phase === 'Playing' ? 'Đã khôi phục trận đấu.' : 'Hãy xếp đội tàu và sẵn sàng chiến đấu.', error: undefined,
    }))
  }, [])

  useEffect(() => {
    let disposed = false
    const connection = new HubConnectionBuilder().withUrl('/hub/game')
      .withAutomaticReconnect([0, 1000, 3000, 5000]).configureLogging(LogLevel.Warning).build()
    connectionRef.current = connection

    const restore = async () => {
      const code = localStorage.getItem(roomStorageKey)
      const token = localStorage.getItem(tokenStorageKey)
      if (code && token) {
        try { const result = await connection.invoke<JoinRoomResponse>('JoinRoom', code, token); if (!disposed) applyJoin(result) }
        catch {
          if (disposed) return
          localStorage.removeItem(roomStorageKey)
          localStorage.removeItem(tokenStorageKey)
          setState({ ...initialState, connected: true, message: 'Phòng cũ đã hết hạn. Hãy tạo trận mới.' })
        }
      }
    }
    connection.onreconnecting(() => setState((current) => ({ ...current, connected: false, message: 'Mất kết nối. Đang kết nối lại…' })))
    connection.onreconnected(async () => {
      setState((current) => ({ ...current, connected: true, message: 'Đang khôi phục trận đấu…' }))
      await restore()
    })
    connection.onclose(() => { if (!disposed) setState((current) => ({ ...current, connected: false, error: 'Kết nối đã đóng. Hãy kết nối lại.' })) })
    connection.on('OpponentJoined', () => setState((s) => ({ ...s, phase: 'Placing', opponentConnected: true, message: 'Đối thủ đã vào phòng. Hãy xếp đội tàu.' })))
    connection.on('OpponentReconnected', () => setState((s) => ({ ...s, opponentConnected: true, message: 'Đối thủ đã kết nối lại.' })))
    connection.on('OpponentReady', () => setState((s) => ({ ...s, opponentFleetSubmitted: true, message: 'Đối thủ đã khóa tàu.' })))
    connection.on('OpponentLeft', () => setState((s) => ({ ...s, opponentConnected: false, message: 'Đối thủ mất kết nối. Đang chờ họ quay lại…' })))
    connection.on('RematchRequested', () => setState((s) => ({ ...s, message: 'Đối thủ muốn chơi lại. Chọn Chơi lại để đồng ý.' })))
    connection.on('GameStarted', (payload: { isYourTurn: boolean }) => setState((s) => ({ ...s, phase: 'Playing', isYourTurn: payload.isYourTurn, message: payload.isYourTurn ? 'Bạn bắn trước. Chọn một ô trên biển đối thủ.' : 'Đối thủ bắn trước. Theo dõi đội tàu của bạn.' })))
    connection.on('ShotResult', (shot: ShotHistoryItem) => setState((s) => ({
      ...s, shots: [...s.shots, shot], isYourTurn: false,
      currentPlayer: s.player === 'One' ? 'Two' : 'One',
      message: shot.status === 'Won' ? 'Bạn đã đánh chìm toàn bộ tàu đối thủ!'
        : shot.status === 'Sunk' ? `${shot.sunkShip ? shipNames[shot.sunkShip] : 'Tàu đối thủ'} đã chìm!`
          : shot.status === 'Hit' ? 'Bắn trúng tàu! Đến lượt đối thủ.' : 'Bắn trượt. Đến lượt đối thủ.',
    })))
    connection.on('IncomingShot', (shot: ShotHistoryItem) => setState((s) => ({
      ...s, incomingShots: [...s.incomingShots, shot], isYourTurn: true, currentPlayer: s.player,
      ownBoard: s.ownBoard ? {
        incomingShots: [...s.ownBoard.incomingShots, shot.coordinate],
        ships: s.ownBoard.ships.map((ship) => ship.cells.some((cell) => cell.x === shot.coordinate.x && cell.y === shot.coordinate.y)
          ? { ...ship, hits: [...ship.hits, shot.coordinate], isSunk: ship.hits.length + 1 === ship.cells.length } : ship),
      } : undefined,
      message: shot.status === 'Sunk' ? `${shot.sunkShip ? shipNames[shot.sunkShip] : 'Tàu của bạn'} đã bị đánh chìm!`
        : shot.status === 'Hit' ? 'Đối thủ bắn trúng tàu của bạn.' : 'Đối thủ bắn trượt!',
    })))
    connection.on('GameOver', (gameOver: GameOverMessage) => setState((s) => ({ ...s, phase: 'Finished', gameOver, isYourTurn: false, message: gameOver.winner === s.player ? 'Bạn đã chiến thắng!' : 'Đội tàu của bạn đã bị đánh chìm.' })))
    connection.on('RematchStarted', restore)
    connection.start().then(async () => {
      if (disposed) return
      setState((s) => ({ ...s, connected: true, message: 'Đã kết nối. Chọn chế độ chơi để bắt đầu.' }))
      await restore()
    }).catch(() => { if (!disposed) setState((s) => ({ ...s, error: 'Không thể kết nối máy chủ game. Hãy thử lại.' })) })
    return () => { disposed = true; void connection.stop() }
  }, [applyJoin])

  const invoke = useCallback(async <T,>(method: string, ...args: unknown[]) => {
    const connection = connectionRef.current
    if (!connection || connection.state !== HubConnectionState.Connected) throw new Error('Kết nối chưa sẵn sàng. Hãy chờ hoặc tải lại trang.')
    try { return await connection.invoke<T>(method, ...args) } catch (error) { throw new Error(errorText(error)) }
  }, [])
  const createRoom = useCallback(async () => {
    const result = await invoke<CreateRoomResponse>('CreateRoom')
    localStorage.setItem(roomStorageKey, result.code)
    localStorage.setItem(tokenStorageKey, result.playerToken)
    setState((s) => ({ ...initialState, connected: s.connected, roomCode: result.code, token: result.playerToken, player: result.player, message: 'Đã tạo phòng. Chia sẻ mã phòng cho bạn bè.' }))
  }, [invoke])
  const createBotRoom = useCallback(async () => applyJoin(await invoke<JoinRoomResponse>('CreateBotRoom')), [applyJoin, invoke])
  const joinRoom = useCallback(async (code: string) => applyJoin(await invoke<JoinRoomResponse>('JoinRoom', code.trim().toUpperCase(), null)), [applyJoin, invoke])
  const submitFleet = useCallback(async (fleet: FleetPlacementDto[]) => {
    const result = await invoke<SubmitFleetResponse>('SubmitFleet', fleet)
    if (!result.accepted) throw new Error(result.errors?.map((e) => errorText(e.code)).join(' ') ?? errorText(result.error))
    setState((s) => ({ ...s, phase: result.phase, fleetSubmitted: true, ownBoard: result.ownBoard, error: undefined, message: result.phase === 'Playing' ? 'Đã khóa đội tàu. Trận đấu bắt đầu!' : 'Đã khóa đội tàu. Đang chờ đối thủ.' }))
    return result
  }, [invoke])
  const fire = useCallback((coordinate: Coordinate) => invoke<FireResponse>('Fire', coordinate.x, coordinate.y), [invoke])
  const rematch = useCallback(async () => {
    await invoke<void>('Rematch')
    // Fetch the current board after votes resolve, including immediate bot rematches.
    const code = localStorage.getItem(roomStorageKey)
    const token = localStorage.getItem(tokenStorageKey)
    if (code && token) {
      const result = await invoke<JoinRoomResponse>('JoinRoom', code, token)
      applyJoin(result)
      if (result.phase === 'Finished') setState((s) => ({ ...s, message: 'Đã gửi yêu cầu chơi lại. Đang chờ đối thủ đồng ý.' }))
    }
  }, [invoke, applyJoin])
  const leaveRoom = useCallback(() => {
    localStorage.removeItem(roomStorageKey); localStorage.removeItem(tokenStorageKey); window.location.reload()
  }, [])
  return { state, createRoom, createBotRoom, joinRoom, submitFleet, fire, rematch, leaveRoom }
}
