import { useCallback, useEffect, useRef, useState } from 'react'
import { HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr'
import { errorText } from './i18n'
import { initialState, joinedState, mergeChat, reduceGameEvent } from './gameState'
import type { GameEvent, HubState } from './gameState'
import type { BotDifficulty, ChatEnvelope, ChatMessage, Coordinate, CreateRoomResponse, FleetPlacementDto, FireResponse, JoinRoomResponse, ShotHistoryItem, SubmitFleetResponse } from './types'

export type { HubState } from './gameState'
const roomStorageKey = 'battleship-room'
const tokenStorageKey = 'battleship-player-token'
const retryDelays = [1000, 3000, 5000]

export function useGameHub(identityVersion = 0) {
  const connectionRef = useRef<ReturnType<typeof HubConnectionBuilder.prototype.build> | null>(null)
  const readyRef = useRef(false)
  const retryRef = useRef<() => Promise<void>>(async () => {})
  const [state, setState] = useState<HubState>(initialState)
  const eventSequence = useRef(0)
  const chatBuffer = useRef<ChatEnvelope[]>([])
  const identity = useRef(identityVersion)

  const applyJoin = useCallback((response: JoinRoomResponse) => {
    localStorage.setItem(roomStorageKey, response.code)
    localStorage.setItem(tokenStorageKey, response.playerToken)
    readyRef.current = true
    const buffered = chatBuffer.current.filter((item) => item.roomCode === response.code).map((item) => item.message)
    chatBuffer.current = []
    setState((current) => ({ ...joinedState(current, { ...response, chatMessages: mergeChat(response.chatMessages ?? [], buffered) }), identityVersion: identity.current }))
  }, [])

  useEffect(() => {
    let disposed = false, starting = false, generation = 0, retries = 0
    identity.current = identityVersion
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    const connection = new HubConnectionBuilder().withUrl('/hub/game')
      .withAutomaticReconnect([0, 1000, 3000, 5000]).configureLogging(LogLevel.Warning).build()
    connectionRef.current = connection
    readyRef.current = false
    const cancelRetry = () => { clearTimeout(retryTimer); retryTimer = undefined }

    const restore = async () => {
      cancelRetry()
      const request = ++generation
      const code = localStorage.getItem(roomStorageKey)
      const token = localStorage.getItem(tokenStorageKey)
      readyRef.current = false
      if (!code || !token) {
        readyRef.current = true
        setState((current) => ({ ...current, identityVersion, connected: true, restoring: false, error: undefined, message: 'Đã kết nối. Chọn chế độ chơi để bắt đầu.' }))
        return
      }
      setState((current) => ({ ...current, connected: false, restoring: true, error: undefined, message: 'Đang khôi phục trận đấu…' }))
      try {
        const result = await connection.invoke<JoinRoomResponse>('Reconnect', code, token)
        if (disposed || request !== generation) return
        retries = 0
        applyJoin(result)
      } catch (error) {
        if (disposed || request !== generation) return
        const message = error instanceof Error ? error.message : String(error)
        if (/\b(ROOM_NOT_FOUND|INVALID_PLAYER_TOKEN|ACCOUNT_REQUIRED)\b/.test(message)) {
          // A late failure must not erase a session saved by another tab.
          if (localStorage.getItem(roomStorageKey) === code && localStorage.getItem(tokenStorageKey) === token) {
            localStorage.removeItem(roomStorageKey)
            localStorage.removeItem(tokenStorageKey)
          }
          readyRef.current = true
          setState({ ...initialState, identityVersion, connected: true, message: message.includes('ACCOUNT_REQUIRED') ? 'Đăng nhập lại để khôi phục trận của tài khoản.' : 'Phòng cũ đã hết hạn. Hãy tạo trận mới.' })
          return
        }
        setState((current) => ({ ...current, connected: false, restoring: false,
          error: 'Chưa thể khôi phục trận đấu. Phiên của bạn vẫn được giữ; hãy thử kết nối lại.',
          message: 'Chưa khôi phục được trận đấu. Đội tàu và mã khôi phục vẫn được giữ.',
        }))
        if (retries < retryDelays.length && connection.state === HubConnectionState.Connected)
          retryTimer = setTimeout(() => { void restore() }, retryDelays[retries++])
      }
    }
    const start = async () => {
      if (disposed || starting) return
      starting = true
      setState((current) => ({ ...current, connected: false, error: undefined }))
      try { await connection.start(); if (!disposed) await restore() }
      catch {
        if (!disposed) setState((current) => ({ ...current, connected: false, restoring: false, error: 'Không thể kết nối máy chủ game. Hãy thử lại.' }))
      } finally { starting = false }
    }
    retryRef.current = async () => {
      retries = 0; cancelRetry()
      if (connection.state === HubConnectionState.Connected) await restore()
      else if (connection.state === HubConnectionState.Disconnected) await start()
    }
    connection.onreconnecting(() => {
      if (disposed) return
      generation++; cancelRetry(); readyRef.current = false
      if (!disposed) setState((current) => ({ ...current, connected: false, restoring: true, error: undefined, message: 'Mất kết nối. Đang kết nối lại…' }))
    })
    connection.onreconnected(async () => {
      if (!disposed) { retries = 0; await restore() }
    })
    connection.onclose(() => {
      if (disposed) return
      generation++; cancelRetry(); readyRef.current = false
      if (!disposed) setState((current) => ({ ...current, connected: false, restoring: false, error: 'Kết nối đã đóng. Hãy kết nối lại.' }))
    })
    const dispatch = (event: GameEvent) => { if (!disposed) setState((current) => reduceGameEvent(current, event)) }
    connection.on('ChatMessage', (payload: ChatEnvelope) => {
      if (disposed) return
      chatBuffer.current = [...chatBuffer.current, payload].slice(-100)
      dispatch({ type: 'ChatMessage', ...payload })
    })
    connection.on('RoomClosed', (payload: { code: string; message: string }) => {
      if (disposed) return
      if (localStorage.getItem(roomStorageKey) === payload.code) { localStorage.removeItem(roomStorageKey); localStorage.removeItem(tokenStorageKey) }
      setState((current) => current.roomCode === payload.code ? { ...initialState, identityVersion, connected: true, message: payload.message } : current)
    })
    connection.on('SessionExpired', () => {
      if (disposed) return
      localStorage.removeItem(roomStorageKey); localStorage.removeItem(tokenStorageKey)
      setState({ ...initialState, identityVersion, connected: true, message: 'Phiên đăng nhập đã kết thúc. Hãy đăng nhập lại.' })
    })
    for (const type of ['OpponentJoined', 'OpponentReconnected', 'OpponentReady', 'OpponentLeft', 'RematchRequested'] as const)
      connection.on(type, () => dispatch({ type }))
    connection.on('GameStarted', (payload: { isYourTurn: boolean }) => dispatch({ type: 'GameStarted', ...payload }))
    connection.on('ShotResult', (shot: ShotHistoryItem) => dispatch({ type: 'ShotResult', shot, id: ++eventSequence.current }))
    connection.on('IncomingShot', (shot: ShotHistoryItem) => dispatch({ type: 'IncomingShot', shot, id: ++eventSequence.current }))
    connection.on('GameOver', (result) => dispatch({ type: 'GameOver', result }))
    connection.on('RematchStarted', async () => { if (!disposed) await restore() })
    void start()
    return () => { disposed = true; generation++; cancelRetry(); readyRef.current = false; void connection.stop() }
  }, [applyJoin, identityVersion])

  const invoke = useCallback(async <T,>(method: string, ...args: unknown[]) => {
    const connection = connectionRef.current
    if (!readyRef.current || !connection || connection.state !== HubConnectionState.Connected) throw new Error('Kết nối chưa sẵn sàng. Hãy chờ khôi phục trận đấu hoặc thử kết nối lại.')
    try { return await connection.invoke<T>(method, ...args) } catch (error) { throw new Error(errorText(error)) }
  }, [])
  const retryConnection = useCallback(() => retryRef.current(), [])
  const createRoom = useCallback(async () => {
    const result = await invoke<CreateRoomResponse>('CreateRoom')
    localStorage.setItem(roomStorageKey, result.code)
    localStorage.setItem(tokenStorageKey, result.playerToken)
    setState((s) => ({ ...initialState, identityVersion: identity.current, connected: s.connected, roomCode: result.code, token: result.playerToken, player: result.player, message: 'Đã tạo phòng. Chia sẻ mã phòng cho bạn bè.' }))
  }, [invoke])
  const createBotRoom = useCallback(async (difficulty: BotDifficulty = 'Easy') =>
    applyJoin(await invoke<JoinRoomResponse>('CreateBotRoomWithDifficulty', difficulty)), [applyJoin, invoke])
  const joinRoom = useCallback(async (code: string) => applyJoin(await invoke<JoinRoomResponse>('JoinRoom', code.trim().toUpperCase(), null)), [applyJoin, invoke])
  const joinReserved = useCallback(async (code: string, token: string) => applyJoin(await invoke<JoinRoomResponse>('Reconnect', code, token)), [applyJoin, invoke])
  const submitFleet = useCallback(async (fleet: FleetPlacementDto[]) => {
    const result = await invoke<SubmitFleetResponse>('SubmitFleet', fleet)
    if (!result.accepted) throw new Error(result.errors?.map((e) => errorText(e.code)).join(' ') ?? errorText(result.error))
    setState((s) => ({ ...s, phase: result.phase,
      fleetSubmitted: true, ownBoard: result.ownBoard, error: undefined,
      message: s.phase === 'Playing' || result.phase === 'Playing' ? 'Đã khóa đội tàu. Trận đấu bắt đầu!' : 'Đã khóa đội tàu. Đang chờ đối thủ.' }))
    return result
  }, [invoke])
  const fire = useCallback((coordinate: Coordinate) => invoke<FireResponse>('Fire', coordinate.x, coordinate.y), [invoke])
  const sendChat = useCallback(async (requestId: string, content: string) => {
    const roomCode = state.roomCode
    const message = await invoke<ChatMessage>('SendChat', requestId, content)
    setState((current) => current.roomCode === roomCode ? { ...current, chatMessages: mergeChat(current.chatMessages, [message]) } : current)
    return message
  }, [invoke, state.roomCode])
  const rematch = useCallback(async () => {
    await invoke<void>('Rematch')
    setState((current) => current.phase === 'Finished' ? { ...current, message: 'Đã gửi yêu cầu chơi lại. Đang chờ đối thủ đồng ý.' } : current)
  }, [invoke])
  const leaveRoom = useCallback(async () => {
    await invoke<void>('LeaveRoom')
    localStorage.removeItem(roomStorageKey); localStorage.removeItem(tokenStorageKey)
    chatBuffer.current = []
    setState({ ...initialState, identityVersion: identity.current, connected: true, message: 'Đã rời phòng.' })
  }, [invoke])
  const surrender = useCallback(() => invoke<void>('Surrender'), [invoke])
  return { state, createRoom, createBotRoom, joinRoom, joinReserved, submitFleet, fire, rematch, leaveRoom, retryConnection, sendChat, surrender }
}
