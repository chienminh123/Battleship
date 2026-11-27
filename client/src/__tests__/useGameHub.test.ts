import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JoinRoomResponse } from '../types'

const mock = vi.hoisted(() => ({
  events: new Map<string, (...args: unknown[]) => unknown>(),
  lifecycle: {} as Record<string, (...args: unknown[]) => unknown>,
  connection: {
    state: 'Disconnected', start: vi.fn(), stop: vi.fn(), invoke: vi.fn(),
    on: vi.fn(), onreconnecting: vi.fn(), onreconnected: vi.fn(), onclose: vi.fn(),
  },
}))
vi.mock('@microsoft/signalr', () => ({
  HubConnectionState: { Connected: 'Connected', Disconnected: 'Disconnected' },
  LogLevel: { Warning: 3 },
  HubConnectionBuilder: class {
    withUrl() { return this }
    withAutomaticReconnect() { return this }
    configureLogging() { return this }
    build() { return mock.connection }
  },
}))
import { useGameHub } from '../useGameHub'

const snapshot = (changes: Partial<JoinRoomResponse> = {}): JoinRoomResponse => ({
  code: 'ABC234', playerToken: 'saved-token', player: 'One', isBot: false,
  phase: 'Playing', currentPlayer: 'One', isYourTurn: true, opponentConnected: true,
  ownFleetSubmitted: true, opponentFleetSubmitted: true,
  ownBoard: { ships: [], incomingShots: [] }, shotsAgainstOpponent: [], shotsAgainstYou: [], ...changes,
})
function saveSession() {
  localStorage.setItem('battleship-room', 'ABC234')
  localStorage.setItem('battleship-player-token', 'saved-token')
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  mock.events.clear()
  mock.lifecycle = {}
  mock.connection.state = 'Disconnected'
  mock.connection.start.mockReset().mockImplementation(async () => { mock.connection.state = 'Connected' })
  mock.connection.stop.mockReset().mockImplementation(async () => { mock.connection.state = 'Disconnected' })
  mock.connection.invoke.mockReset().mockResolvedValue(snapshot())
  mock.connection.on.mockImplementation((name, callback) => mock.events.set(name, callback))
  for (const name of ['reconnecting', 'reconnected', 'close']) {
    const key = `on${name}` as 'onreconnecting' | 'onreconnected' | 'onclose'
    mock.connection[key].mockImplementation((callback) => { mock.lifecycle[name] = callback })
  }
})

describe('session recovery', () => {
  it('keeps the seat on a failed leave and clears it only after the server accepts', async () => {
    saveSession()
    const { result } = renderHook(() => useGameHub())
    await waitFor(() => expect(result.current.state.phase).toBe('Playing'))
    mock.connection.invoke.mockRejectedValueOnce(new Error('offline'))
    await act(async () => { await expect(result.current.leaveRoom()).rejects.toThrow() })
    expect(localStorage.getItem('battleship-room')).toBe('ABC234')
    expect(result.current.state.phase).toBe('Playing')
    mock.connection.invoke.mockResolvedValueOnce(undefined)
    await act(async () => { await result.current.leaveRoom() })
    expect(localStorage.getItem('battleship-room')).toBeNull()
    expect(result.current.state.roomCode).toBe('')
    expect(result.current.state.gameOver).toBeUndefined()
  })
  it('keeps chat received while a reconnect snapshot is still in flight', async () => {
    saveSession()
    const pending = deferred<JoinRoomResponse>()
    mock.connection.invoke.mockReturnValue(pending.promise)
    const { result } = renderHook(() => useGameHub())
    await waitFor(() => expect(mock.events.has('ChatMessage')).toBe(true))
    const message = { id: 2, sender: 'Two' as const, content: 'arrived during restore', sentAt: '2026-11-27T00:00:00Z', round: 1, isSystem: false }
    act(() => { mock.events.get('ChatMessage')?.({ roomCode: 'ABC234', message }) })
    await act(async () => { pending.resolve(snapshot({ chatMessages: [{ ...message, id: 1, content: 'earlier' }] })); await pending.promise })
    expect(result.current.state.chatMessages.map((item) => item.id)).toEqual([1, 2])
    act(() => { mock.events.get('ChatMessage')?.({ roomCode: 'ABC234', message }) })
    expect(result.current.state.chatMessages).toHaveLength(2)
  })

  it.each(['Easy', 'Hard', 'Annihilation'] as const)('sends and restores the selected bot level: %s', async (difficulty) => {
    const { result } = renderHook(() => useGameHub())
    await waitFor(() => expect(result.current.state.connected).toBe(true))
    mock.connection.invoke.mockResolvedValue(snapshot({ isBot: true, botDifficulty: difficulty, phase: 'Placing' }))
    await act(async () => { await result.current.createBotRoom(difficulty) })
    expect(mock.connection.invoke).toHaveBeenCalledWith('CreateBotRoomWithDifficulty', difficulty)
    expect(result.current.state.botDifficulty).toBe(difficulty)
    act(() => { mock.lifecycle.reconnecting() })
    await act(async () => { await mock.lifecycle.reconnected() })
    expect(mock.connection.invoke).toHaveBeenLastCalledWith('Reconnect', 'ABC234', 'saved-token')
    expect(result.current.state.botDifficulty).toBe(difficulty)
    mock.connection.invoke.mockResolvedValue(snapshot({ isBot: true, botDifficulty: difficulty, phase: 'Placing', ownFleetSubmitted: false }))
    await act(async () => { await mock.events.get('RematchStarted')?.() })
    expect(result.current.state.botDifficulty).toBe(difficulty)
    expect(result.current.state.fleetSubmitted).toBe(false)
  })

  it('keeps actions disabled until the saved seat has actually been restored', async () => {
    saveSession()
    const pending = deferred<JoinRoomResponse>()
    mock.connection.invoke.mockReturnValue(pending.promise)
    const { result } = renderHook(() => useGameHub())
    await waitFor(() => expect(mock.connection.invoke).toHaveBeenCalled())
    expect(result.current.state.connected).toBe(false)
    await expect(result.current.fire({ x: 0, y: 0 })).rejects.toThrow()
    expect(mock.connection.invoke.mock.calls.some(([method]) => method === 'Fire')).toBe(false)
    await act(async () => { pending.resolve(snapshot()); await pending.promise })
    expect(result.current.state.connected).toBe(true)
    expect(result.current.state.roomCode).toBe('ABC234')
  })

  it('retains the token on a timeout and allows retry without reloading', async () => {
    saveSession()
    mock.connection.invoke.mockRejectedValueOnce(new Error('network timeout')).mockResolvedValue(snapshot())
    const { result } = renderHook(() => useGameHub())
    await waitFor(() => expect(result.current.state.error).toBeTruthy())
    expect(localStorage.getItem('battleship-player-token')).toBe('saved-token')
    expect(localStorage.getItem('battleship-room')).toBe('ABC234')
    expect(result.current.state.connected).toBe(false)
    await act(async () => { await result.current.retryConnection() })
    expect(result.current.state.connected).toBe(true)
    expect(result.current.state.phase).toBe('Playing')
    expect(result.current.state.error).toBeUndefined()
  })

  it.each(['ROOM_NOT_FOUND', 'INVALID_PLAYER_TOKEN'])('clears a definitively invalid session: %s', async (code) => {
    saveSession()
    mock.connection.invoke.mockRejectedValue(new Error(code))
    const { result } = renderHook(() => useGameHub())
    await waitFor(() => expect(localStorage.getItem('battleship-player-token')).toBeNull())
    expect(result.current.state.roomCode).toBe('')
    expect(result.current.state.connected).toBe(true)
  })

  it('can retry a failed initial connection and clears the previous error', async () => {
    mock.connection.start.mockRejectedValueOnce(new Error('offline'))
    const { result } = renderHook(() => useGameHub())
    await waitFor(() => expect(result.current.state.error).toBeTruthy())
    await act(async () => { await result.current.retryConnection() })
    expect(result.current.state.connected).toBe(true)
    expect(result.current.state.error).toBeUndefined()
  })

  it('does not replay historical effects after a transport reconnect', async () => {
    saveSession()
    const { result } = renderHook(() => useGameHub())
    await waitFor(() => expect(result.current.state.connected).toBe(true))
    act(() => { mock.lifecycle.reconnecting() })
    mock.connection.invoke.mockResolvedValue(snapshot({ shotsAgainstOpponent: [{ coordinate: { x: 3, y: 4 }, status: 'Miss' }] }))
    await act(async () => { await mock.lifecycle.reconnected() })
    expect(result.current.state.shots).toHaveLength(1)
    expect(result.current.state.liveEvents).toHaveLength(0)
    expect(result.current.state.connected).toBe(true)
  })

  it('restores a rematch into placement and clears the previous result and shot history', async () => {
    saveSession()
    mock.connection.invoke.mockResolvedValue(snapshot({ phase: 'Finished', result: { winner: 'One', opponentFleet: [] }, shotsAgainstOpponent: [{ coordinate: { x: 0, y: 0 }, status: 'Won' }] }))
    const { result } = renderHook(() => useGameHub())
    await waitFor(() => expect(result.current.state.phase).toBe('Finished'))
    mock.connection.invoke.mockResolvedValue(snapshot({ phase: 'Placing', currentPlayer: undefined, isYourTurn: false, ownFleetSubmitted: false, opponentFleetSubmitted: false }))
    await act(async () => { await mock.events.get('RematchStarted')?.() })
    expect(result.current.state.phase).toBe('Placing')
    expect(result.current.state.gameOver).toBeUndefined()
    expect(result.current.state.shots).toHaveLength(0)
    expect(result.current.state.liveEvents).toHaveLength(0)
    expect(result.current.state.fleetSubmitted).toBe(false)
  })
})
