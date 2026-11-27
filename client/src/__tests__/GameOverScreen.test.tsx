import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GameOverScreen } from '../screens/GameOverScreen'
import { initialState } from '../gameState'
import type { Profile } from '../accountTypes'

vi.mock('../Board3D', () => ({ OceanBoard3D: () => null }))
const options = { busy: false, threeDimensional: false, quality: 'low' as const, onFallback: vi.fn(), onRematch: vi.fn(), onLeave: vi.fn() }
const state = { ...initialState, phase: 'Finished' as const, player: 'One' as const, mode: 'Ranked' as const, matchId: 'match', gameOver: { winner: 'Two' as const, opponentFleet: [], reason: 'Surrender' } }

describe('authoritative match results', () => {
  it('explains a surrender without claiming that the fleet was sunk and waits for persisted Elo', () => {
    const view = render(<GameOverScreen {...options} state={state} />)
    expect(screen.getByText('Bạn đã đầu hàng hoặc rời trận.')).toBeTruthy()
    expect(screen.queryByText(/Đối thủ đã đánh chìm toàn bộ/)).toBeNull()
    expect(screen.getByText('Đang ghi nhận kết quả xếp hạng…')).toBeTruthy()
    const profile: Profile = { user: { id: 'one', displayName: 'One', playerCode: '111111111111', rating: 984, rankedGames: 1, rankedWins: 0, rankedLosses: 1, rank: 'Đang xác định' }, history: [], stats: [], page: 0, hasMore: false,
      ratingChanges: [{ matchId: 'other', before: 2000, after: 2016 }, { matchId: 'match', before: 1000, after: 984 }] }
    view.rerender(<GameOverScreen {...options} state={state} profile={profile} />)
    expect(screen.getByText('1000 → 984 Elo (-16)')).toBeTruthy()
    expect(screen.queryByText('Đang ghi nhận kết quả xếp hạng…')).toBeNull()
  })
  it('explains timeout and omits Elo from a friendly rematch', () => {
    render(<GameOverScreen {...options} state={{ ...state, mode: 'Friendly', gameOver: { ...state.gameOver, reason: 'Timeout' } }} />)
    expect(screen.getByText(/hết thời gian lượt hoặc kết nối/)).toBeTruthy()
    expect(screen.queryByText(/Elo/)).toBeNull()
  })
})
