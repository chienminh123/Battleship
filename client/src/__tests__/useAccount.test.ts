import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAccount } from '../useAccount'
import type { Account, Community, Profile } from '../accountTypes'

const one: Account = { id: 'one', displayName: 'One', playerCode: '111111111111', rating: 1000, rankedGames: 0, rankedWins: 0, rankedLosses: 0, rank: 'Đang xác định' }
const two: Account = { ...one, id: 'two', displayName: 'Two', playerCode: '222222222222' }
const community: Community = { friends: [], invites: [], blocked: [] }
const profile = (user: Account): Profile => ({ user, history: [], stats: [], page: 0, hasMore: false })
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
let current: Account | null
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  current = one
  fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/session') return json({ enabled: true, user: current, csrfToken: 'csrf' })
    if (url === '/api/community') return json(community)
    if (url.startsWith('/api/profile')) return json(profile(current!))
    return json({})
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

async function ready() {
  const hook = renderHook(() => useAccount())
  await waitFor(() => expect(hook.result.current.community).toEqual(community))
  return hook
}

describe('account identity and response races', () => {
  it('rejects an action after another tab switches account and discards the old profile response', async () => {
    const { result } = await ready()
    let resolve!: (response: Response) => void
    const pending = new Promise<Response>((done) => { resolve = done })
    fetchMock.mockImplementationOnce(() => pending)
    let loading!: Promise<Profile | undefined>
    act(() => { loading = result.current.refreshProfile() })
    const version = result.current.identityVersion
    current = two
    await act(async () => { await result.current.action('queue', { action: 'join' }) })
    expect(result.current.session.user?.id).toBe('two')
    expect(result.current.identityVersion).toBeGreaterThan(version)
    expect(result.current.error).toContain('đã đổi')
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/community/queue')).toBe(false)
    await act(async () => { resolve(json(profile(one))); await loading })
    expect(result.current.profile).toBeUndefined()
    expect(result.current.session.user?.id).toBe('two')
  })

  it('detects logout while polling and invalidates the game identity', async () => {
    const { result } = await ready()
    const version = result.current.identityVersion
    current = null
    await act(async () => { await result.current.refreshCommunity() })
    expect(result.current.session.user).toBeNull()
    expect(result.current.community).toBeUndefined()
    expect(result.current.identityVersion).toBeGreaterThan(version)
  })

  it('shows a recoverable message when a write is rate limited', async () => {
    const { result } = await ready()
    fetchMock.mockImplementation(async (url: string) => url === '/api/session'
      ? json({ enabled: true, user: one, csrfToken: 'csrf' }) : json({}, 429))
    await act(async () => { await result.current.action('queue', { action: 'join' }) })
    expect(result.current.error).toContain('chờ một phút')
    expect(result.current.busy).toBe(false)
    expect(result.current.session.user?.id).toBe('one')
  })
})
