import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PlayerPanel } from '../PlayerPanel'
import type { useAccount } from '../useAccount'
import type { Account, Community } from '../accountTypes'
import { copyText } from '../clipboard'

vi.mock('../clipboard', () => ({ copyText: vi.fn() }))
const user: Account = { id: 'me', displayName: 'Minh', playerCode: '111111111111', rating: 1000, rankedGames: 0, rankedWins: 0, rankedLosses: 0, rank: 'Đang xác định' }
const friend = (id: string, status: 'Online' | 'Busy' | 'Offline') => ({ user: { ...user, id, displayName: id, playerCode: id.padEnd(12, '0') }, status, accepted: true, incoming: false })
function options(communityChange: Partial<Community> = {}) {
  const community: Community = { friends: [friend('Offline', 'Offline'), friend('Busy', 'Busy'), friend('Online', 'Online')], invites: [], blocked: [], ...communityChange }
  const account = { session: { user, enabled: true }, community, loading: false, busy: false, error: '', loadProfile: vi.fn(), loadLeaderboard: vi.fn(), action: vi.fn(), clearError: vi.fn() } as unknown as ReturnType<typeof useAccount>
  return { account, connected: true, inRoom: false }
}
const openFriends = () => fireEvent.click(screen.getByRole('button', { name: 'Bạn bè, 1 người online' }))

describe('player code and online friends', () => {
  it('copies the player code and reports clipboard failure without a false success', async () => {
    vi.mocked(copyText).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'))
    render(<PlayerPanel {...options()} />)
    openFriends()
    fireEvent.click(screen.getByRole('button', { name: 'Sao chép mã người chơi' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Đã sao chép mã người chơi.'))
    expect(copyText).toHaveBeenCalledWith(user.playerCode)
    fireEvent.click(screen.getByRole('button', { name: 'Sao chép mã người chơi' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Chưa sao chép được'))
  })

  it('sorts available friends first, filters online and sends the right invitation', () => {
    const props = options()
    const view = render(<PlayerPanel {...props} />)
    openFriends()
    const rows = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(rows.map((row) => within(row).getByRole('strong').textContent)).toEqual(['Online', 'Busy', 'Offline'])
    expect((screen.getByRole('button', { name: 'Mời Busy chơi' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Mời Offline chơi' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Mời Online chơi' }))
    expect(props.account.action).toHaveBeenCalledExactlyOnceWith('invites', { id: 'Online000000', action: 'send' })
    fireEvent.click(screen.getByRole('button', { name: 'Chỉ online' }))
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1)
    view.rerender(<PlayerPanel {...props} account={{ ...props.account, community: { ...props.account.community!, friends: [friend('Online', 'Offline')] } }} />)
    expect(screen.getByText('Chưa có bạn online sẵn sàng chơi.')).toBeTruthy()
  })

  it.each([{ inRoom: true }, { connected: false }])('prevents inviting when unavailable: %j', (change) => {
    render(<PlayerPanel {...options()} {...change} />)
    openFriends()
    expect((screen.getByRole('button', { name: 'Mời Online chơi' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows the pending invitation and prevents a duplicate send', () => {
    render(<PlayerPanel {...options({ invites: [{ id: 'invite', incoming: false, expiresUtc: '2099-01-01T00:00:00Z', other: friend('Online', 'Online').user }] })} />)
    openFriends()
    const invite = screen.getByRole('button', { name: 'Mời Online chơi' }) as HTMLButtonElement
    expect(invite.textContent).toBe('Đã mời')
    expect(invite.disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Hủy mời' })).toBeTruthy()
  })
})
