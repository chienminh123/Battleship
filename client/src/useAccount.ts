import { useCallback, useEffect, useRef, useState } from 'react'
import type { Account, Community, Profile, Session } from './accountTypes'
import { communityErrors } from './accountTypes'

export function useAccount() {
  const [session, setSession] = useState<Session>({ enabled: false })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [identityVersion, setIdentityVersion] = useState(0)
  const [community, setCommunity] = useState<Community>()
  const [profile, setProfile] = useState<Profile>()
  const [leaderboard, setLeaderboard] = useState<{ users: Account[]; page: number; hasMore: boolean }>()
  const sessionRef = useRef(session)
  const generation = useRef(0)

  const refreshSession = useCallback(async () => {
    const response = await fetch('/api/session', { credentials: 'same-origin', cache: 'no-store' })
    if (!response.ok) throw new Error('Chưa tải được tài khoản. Hãy thử lại.')
    const current = await response.json() as Session
    if (current.user?.id !== sessionRef.current.user?.id) {
      generation.current++
      setCommunity(undefined); setProfile(undefined); setLeaderboard(undefined)
      setIdentityVersion((value) => value + 1)
    }
    sessionRef.current = current
    setSession(current)
    return current
  }, [])

  useEffect(() => {
    let disposed = false
    const load = async () => {
      try { await refreshSession() }
      catch { if (!disposed) setSession({ enabled: false }) }
      finally { if (!disposed) setLoading(false) }
    }
    void load()
    return () => { disposed = true }
  }, [refreshSession])

  const request = useCallback(async <T,>(path: string, body?: unknown): Promise<T> => {
    const beforeId = sessionRef.current.user?.id
    const current = body === undefined ? sessionRef.current : await refreshSession()
    if (body !== undefined && current.user?.id !== beforeId) {
      throw new Error('Tài khoản trong trình duyệt đã đổi. Hãy kiểm tra lại rồi thao tác.')
    }
    const version = generation.current
    const response = await fetch(`/api/${path}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': current.csrfToken ?? '' },
      body: body === undefined ? undefined : JSON.stringify(body) })
    if (!response.ok) {
      if (response.status === 401 && version === generation.current && sessionRef.current.user) {
        generation.current++
        setCommunity(undefined); setProfile(undefined); setLeaderboard(undefined)
        sessionRef.current = { ...sessionRef.current, user: null }
        setSession(sessionRef.current); setIdentityVersion((value) => value + 1)
      }
      if (response.status === 429) throw new Error('Bạn thao tác quá nhanh. Hãy chờ một phút rồi thử lại.')
      const payload = await response.json().catch(() => ({})) as { code?: string; message?: string }
      throw new Error((payload.code && communityErrors[payload.code]) || payload.message || (response.status === 401 ? 'Hãy đăng nhập lại.' : 'Chưa thực hiện được. Hãy thử lại.'))
    }
    const text = await response.text()
    return (text ? JSON.parse(text) : undefined) as T
  }, [refreshSession])

  const refreshCommunity = useCallback(async () => {
    const beforeId = sessionRef.current.user?.id
    if (!beforeId) return
    const current = await refreshSession()
    if (current.user?.id !== beforeId) return
    const version = generation.current
    const data = await request<Community>('community')
    if (version === generation.current) setCommunity(data)
  }, [request, refreshSession])
  const refreshProfile = useCallback(async (page = 0) => {
    if (!sessionRef.current.user) return
    const version = generation.current
    const data = await request<Profile>(`profile?page=${page}`)
    if (version !== generation.current) return
    setProfile(data)
    sessionRef.current = { ...sessionRef.current, user: data.user }
    setSession((current) => ({ ...current, user: data.user }))
    return data
  }, [request])

  const accountId = session.user?.id
  useEffect(() => {
    if (!accountId) return
    let disposed = false, timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try { if (!disposed) await refreshCommunity() } catch (error) { if (!disposed) setError(error instanceof Error ? error.message : 'Mất kết nối danh sách bạn bè.') }
      finally { if (!disposed) timer = setTimeout(() => { void poll() }, 2500) }
    }
    void poll()
    return () => { disposed = true; clearTimeout(timer) }
  }, [accountId, refreshCommunity])

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await action() }
    catch (error) { setError(error instanceof Error ? error.message : 'Chưa thực hiện được. Hãy thử lại.') }
    finally { setBusy(false) }
  }, [])
  const authenticate = useCallback((mode: 'login' | 'register', userName: string, password: string, displayName = '') => run(async () => {
    await request(`account/${mode}`, { userName, password, displayName })
    generation.current++
    await refreshSession()
    await refreshProfile()
  }), [request, run, refreshSession, refreshProfile])
  const logout = useCallback(() => run(async () => {
    await request('account/logout', {})
    generation.current++; setCommunity(undefined); setProfile(undefined)
    await refreshSession()
  }), [request, run, refreshSession])
  const action = useCallback((kind: 'friends' | 'invites' | 'queue', payload: unknown) => run(async () => {
    await request(`community/${kind}`, payload); await refreshCommunity()
  }), [request, run, refreshCommunity])
  const updateName = useCallback((displayName: string) => run(async () => {
    await request('account/profile', { displayName }); await refreshSession(); await refreshProfile()
  }), [run, request, refreshSession, refreshProfile])
  const changePassword = useCallback((currentPassword: string, newPassword: string) => run(async () => {
    await request('account/password', { currentPassword, newPassword }); await refreshSession(); setIdentityVersion((value) => value + 1)
  }), [run, request, refreshSession])
  const loadLeaderboard = useCallback((page = 0) => run(async () => {
    const version = generation.current
    const data = await request<{ users: Account[]; page: number; hasMore: boolean }>(`leaderboard?page=${page}`)
    if (version === generation.current) setLeaderboard(data)
  }), [run, request])
  const loadProfile = useCallback((page = 0) => run(async () => { await refreshProfile(page) }), [run, refreshProfile])

  return { session, loading, busy, error, identityVersion, community, profile, leaderboard, authenticate, logout, action,
    updateName, changePassword, refreshProfile, loadProfile, loadLeaderboard, refreshCommunity, clearError: () => setError('') }
}
