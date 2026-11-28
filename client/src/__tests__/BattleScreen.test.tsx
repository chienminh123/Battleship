import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BattleScreen } from '../screens/BattleScreen'
import { initialState } from '../gameState'
import type { BattleEvent } from '../battlePresentation'

vi.mock('../Board3D', () => ({ OceanBoard3D: () => null }))
const options = { busy: false, threeDimensional: false, quality: 'low' as const, autoSwitch: true, onAutoSwitch: vi.fn(), onFallback: vi.fn(), onFire: vi.fn() }
const playing = { ...initialState, connected: true, opponentConnected: true, phase: 'Playing' as const, player: 'One' as const, isYourTurn: true }
const shot: BattleEvent = { id: 1, board: 'enemy', shot: { coordinate: { x: 0, y: 0 }, status: 'Miss' } }
const enemyTab = () => screen.getByRole('button', { name: 'Ngắm bắn đối thủ' }).getAttribute('aria-pressed')

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('automatic board switching', () => {
  it('stays on the target board while a fired shot is queued, then follows the effect and the turn', () => {
    const view = render(<BattleScreen {...options} state={playing} presenting={false} />)
    act(() => { vi.advanceTimersByTime(0) })
    expect(enemyTab()).toBe('true')
    // The turn flips in the same update that queues the effect, before the effect starts.
    const fired = { ...playing, isYourTurn: false, shots: [shot.shot], liveEvents: [shot] }
    view.rerender(<BattleScreen {...options} state={fired} presenting />)
    act(() => { vi.advanceTimersByTime(0) })
    expect(enemyTab()).toBe('true')
    view.rerender(<BattleScreen {...options} state={fired} presenting activeEvent={shot} />)
    act(() => { vi.advanceTimersByTime(0) })
    expect(enemyTab()).toBe('true')
    view.rerender(<BattleScreen {...options} state={fired} presenting heldEvent={shot} />)
    act(() => { vi.advanceTimersByTime(0) })
    expect(enemyTab()).toBe('true')
    view.rerender(<BattleScreen {...options} state={fired} presenting={false} />)
    act(() => { vi.advanceTimersByTime(0) })
    expect(enemyTab()).toBe('false')
  })
})
