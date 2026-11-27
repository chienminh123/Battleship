import { describe, expect, it } from 'vitest'
import { initialState, joinedState, reduceGameEvent } from '../gameState'
import type { HubState } from '../gameState'
import type { JoinRoomResponse, ShotHistoryItem } from '../types'

const placement: JoinRoomResponse = {
  code: 'ABC234', playerToken: 'seat', player: 'One', isBot: false, phase: 'Placing', isYourTurn: false,
  opponentConnected: true, ownFleetSubmitted: false, opponentFleetSubmitted: false,
  ownBoard: { ships: [], incomingShots: [] }, shotsAgainstOpponent: [], shotsAgainstYou: [],
}
const empty: HubState = { ...initialState, connected: true, player: 'One', phase: 'Playing', isYourTurn: true, ownBoard: { ships: [], incomingShots: [] } }

describe('battle event reducer', () => {
  it('keeps the surrender result after the opponent leaves', () => {
    const finished = reduceGameEvent(empty, { type: 'GameOver', result: { winner: 'Two', opponentFleet: [], reason: 'Surrender' } })
    expect(finished.message).toBe('Bạn đã đầu hàng.')
    const left = reduceGameEvent(finished, { type: 'OpponentLeft' })
    expect(left.opponentConnected).toBe(false)
    expect(left.message).toBe('Bạn đã đầu hàng.')
  })
  it('clears bot level when entering a human room and supports legacy easy snapshots', () => {
    const bot = joinedState(empty, { ...placement, isBot: true, botDifficulty: 'Annihilation' })
    expect(bot.botDifficulty).toBe('Annihilation')
    expect(joinedState(bot, placement).botDifficulty).toBeUndefined()
    expect(joinedState(empty, { ...placement, isBot: true }).botDifficulty).toBe('Easy')
  })

  it('deduplicates shots and returns to the correct placement state after a rematch restore', () => {
    const started = joinedState(empty, { ...placement, phase: 'Playing', ownFleetSubmitted: true, opponentFleetSubmitted: true, isYourTurn: true })
    const shot: ShotHistoryItem = { coordinate: { x: 3, y: 4 }, status: 'Miss' }
    const received = reduceGameEvent(started, { type: 'ShotResult', shot, id: 1 })
    expect(received.shots).toEqual([shot])
    expect(reduceGameEvent(received, { type: 'ShotResult', shot, id: 2 })).toBe(received)
    const placementAgain = joinedState({ ...received, gameOver: { winner: 'One', opponentFleet: [] } }, placement)
    expect(placementAgain.phase).toBe('Placing')
    expect(placementAgain.fleetSubmitted).toBe(false)
    expect(placementAgain.isYourTurn).toBe(false)
    expect(placementAgain.shots).toEqual([])
    expect(placementAgain.gameOver).toBeUndefined()
    expect(placementAgain.liveEvents).toEqual([])
  })

  it('deduplicates a delivered opponent shot and never counts the same hit twice', () => {
    const state: HubState = { ...empty, ownBoard: { incomingShots: [], ships: [{ type: 'Destroyer', cells: [{ x: 2, y: 4 }, { x: 3, y: 4 }], hits: [], isSunk: false }] } }
    const shot: ShotHistoryItem = { coordinate: { x: 2, y: 4 }, status: 'Hit' }
    const received = reduceGameEvent(state, { type: 'IncomingShot', shot, id: 1 })
    expect(received.ownBoard?.ships[0]?.hits).toEqual([shot.coordinate])
    expect(reduceGameEvent(received, { type: 'IncomingShot', shot, id: 2 })).toBe(received)
  })

  it('does not start a shot result for an invalid or repeated target', () => {
    const state = { ...empty, shots: [{ coordinate: { x: 1, y: 1 }, status: 'Miss' as const }] }
    expect(reduceGameEvent(state, { type: 'ShotResult', shot: { coordinate: { x: 1, y: 1 }, status: 'Miss' }, id: 1 })).toBe(state)
  })
})
