import { describe, expect, it } from 'vitest'
import { initialState, joinedState, mergeChat, reduceGameEvent } from '../gameState'
import type { ChatMessage, JoinRoomResponse } from '../types'

const message = (id: number): ChatMessage => ({ id, sender: 'Two', content: `message ${id}`, sentAt: '2026-11-27T00:00:00Z', round: 1, isSystem: false })
const snapshot: JoinRoomResponse = {
  code: 'ABC234', playerToken: 'token', player: 'One', isBot: false, phase: 'Placing', isYourTurn: false,
  opponentConnected: true, ownFleetSubmitted: false, opponentFleetSubmitted: false,
  ownBoard: { ships: [], incomingShots: [] }, shotsAgainstOpponent: [], shotsAgainstYou: [], chatMessages: [message(1)],
}

describe('chat history', () => {
  it('sorts and deduplicates receipts and retains only the most recent 100', () => {
    const merged = mergeChat(Array.from({ length: 110 }, (_, i) => message(i + 1)), [message(109), message(111)])
    expect(merged).toHaveLength(100)
    expect(merged[0].id).toBe(12)
    expect(merged.at(-1)?.id).toBe(111)
  })
  it('merges a restore snapshot with a newer live event without losing it', () => {
    const current = { ...initialState, roomCode: 'ABC234', chatMessages: [message(2)] }
    expect(joinedState(current, snapshot).chatMessages.map((item) => item.id)).toEqual([1, 2])
  })
  it('does not mix rooms or accept bot chat', () => {
    const event = { type: 'ChatMessage' as const, roomCode: 'OTHER1', message: message(1) }
    expect(reduceGameEvent(initialState, event)).toBe(initialState)
    expect(joinedState({ ...initialState, roomCode: 'OTHER1', chatMessages: [message(9)] }, snapshot).chatMessages).toEqual([message(1)])
    expect(joinedState(initialState, { ...snapshot, isBot: true }).chatMessages).toEqual([])
  })
  it('deduplicates a delivered message and its invocation response', () => {
    const current = joinedState(initialState, snapshot)
    const next = reduceGameEvent(current, { type: 'ChatMessage', roomCode: 'ABC234', message: message(1) })
    expect(next.chatMessages).toHaveLength(1)
  })
})
