import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BattleEvent } from '../battlePresentation'

const sounds = vi.hoisted(() => ({ shot: vi.fn() }))
vi.mock('../battleSound', () => ({ battleSound: { shot: sounds.shot } }))
import { useBattleTimeline } from '../useBattleTimeline'

const miss: BattleEvent = { id: 1, board: 'enemy', shot: { coordinate: { x: 2, y: 3 }, status: 'Miss' } }
const sink: BattleEvent = { id: 2, board: 'own', shot: { coordinate: { x: 1, y: 4 }, status: 'Sunk', sunkShip: 'Destroyer' } }

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('ordered battle effects', () => {
  it('plays consecutive effects in server order and holds a sinking result longer', () => {
    const { result, rerender } = renderHook(({ events }) => useBattleTimeline(events), { initialProps: { events: [miss, sink] } })
    expect(result.current.presenting).toBe(true)
    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.activeEvent).toBe(miss)
    expect(sounds.shot).toHaveBeenCalledTimes(1)
    act(() => { vi.advanceTimersByTime(1049) })
    expect(result.current.activeEvent).toBe(miss)
    act(() => { vi.advanceTimersByTime(1) })
    expect(result.current.activeEvent).toBeUndefined()
    rerender({ events: [miss, sink] })
    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.activeEvent).toBe(sink)
    act(() => { vi.advanceTimersByTime(2099) })
    expect(result.current.activeEvent).toBe(sink)
    act(() => { vi.advanceTimersByTime(1) })
    expect(result.current.presenting).toBe(false)
    expect(sounds.shot).toHaveBeenCalledTimes(2)
  })

  it('keeps each result on screen longer on single-board layouts, except the winning shot', () => {
    const won: BattleEvent = { id: 3, board: 'enemy', shot: { coordinate: { x: 0, y: 0 }, status: 'Won' } }
    const { result } = renderHook(({ events }) => useBattleTimeline(events, 900), { initialProps: { events: [miss, sink, won] } })
    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.activeEvent).toBe(miss)
    act(() => { vi.advanceTimersByTime(1050) })
    expect(result.current.activeEvent).toBeUndefined()
    expect(result.current.heldEvent).toBe(miss)
    act(() => { vi.advanceTimersByTime(899) })
    expect(result.current.heldEvent).toBe(miss)
    act(() => { vi.advanceTimersByTime(1) })
    expect(result.current.heldEvent).toBeUndefined()
    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.activeEvent).toBe(sink)
    act(() => { vi.advanceTimersByTime(2100 + 900) })
    expect(result.current.heldEvent).toBeUndefined()
    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.activeEvent).toBe(won)
    act(() => { vi.advanceTimersByTime(2100) })
    expect(result.current.heldEvent).toBeUndefined()
    expect(result.current.presenting).toBe(false)
  })
})
