import { useEffect, useRef, useState } from 'react'
import { useDismissOutside } from './useDismissOutside'
import type { useAccount } from './useAccount'
import { modeNames } from './accountTypes'
import { botDifficultyNames } from './i18n'
import { copyText } from './clipboard'
import type { BotDifficulty } from './types'
import './PlayerPanel.css'

type Props = { account: ReturnType<typeof useAccount>; inRoom: boolean; connected: boolean }

export function Countdown({ until }: { until?: string | null }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  if (!until) return null
  return <span role="timer">{Math.max(0, Math.ceil((new Date(until).getTime() - now) / 1000))} giây</span>
}

export function PlayerPanel(props: Props) {
  return <PlayerPanelContent key={props.account.session.user?.id ?? 'guest'} {...props} />
}

function PlayerPanelContent({ account, inRoom, connected }: Props) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'profile' | 'friends' | 'ranked'>('profile')
  const [onlineOnly, setOnlineOnly] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')
  const [copying, setCopying] = useState(false)
  const [register, setRegister] = useState(false)
  const [userName, setUserName] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [friendCode, setFriendCode] = useState('')
  const [newName, setNewName] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const { session, community, profile, busy, error, loadProfile, loadLeaderboard } = account
  const user = session.user
  const userId = user?.id
  const onlineCount = community?.friends.filter((friend) => friend.accepted && friend.status === 'Online').length ?? 0
  const friends = [...(community?.friends ?? [])].filter((friend) => !onlineOnly || friend.accepted && friend.status === 'Online')
    .sort((a, b) => {
      const priority = (friend: typeof a) => !friend.accepted ? 3 : friend.status === 'Online' ? 0 : friend.status === 'Busy' ? 1 : 2
      return priority(a) - priority(b) || a.user.displayName.localeCompare(b.user.displayName, 'vi')
    })
  const unavailable = busy || inRoom || !connected || Boolean(community?.queue || community?.pairing || community?.activeRoom)
  const copyPlayerCode = async () => {
    if (!user || copying) return
    setCopying(true); setCopyStatus('')
    try { await copyText(user.playerCode); setCopyStatus('Đã sao chép mã người chơi.') }
    catch { setCopyStatus('Chưa sao chép được. Hãy chọn mã bên trên để sao chép thủ công.') }
    finally { setCopying(false) }
  }
  const waiting = (community?.friends.filter((friend) => !friend.accepted && friend.incoming).length ?? 0) +
    (community?.invites.filter((invite) => invite.incoming).length ?? 0)

  useEffect(() => {
    if (!open || !userId) return
    if (tab === 'profile') void loadProfile()
    if (tab === 'ranked') void loadLeaderboard()
  }, [open, userId, tab, loadProfile, loadLeaderboard])

  const close = () => { setOpen(false); setPassword(''); setCurrentPassword(''); setNewPassword('') }
  const menu = useRef<HTMLDivElement>(null)
  useDismissOutside(menu, open, close)
  return <div ref={menu} className="player-menu" onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); close() } }}>
    <button className="account-toggle" type="button" aria-label={`Tài khoản${waiting ? `, ${waiting} lời mời` : ''}`} aria-expanded={open} aria-controls="player-panel" onClick={() => setOpen((current) => !current)}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></svg>
      <span>{user ? user.displayName : 'Tài khoản'}</span>{waiting > 0 && <b>{waiting}</b>}
    </button>
    {user && <button className="friends-toggle" type="button" aria-label={`Bạn bè, ${onlineCount} người online`}
      aria-expanded={open && tab === 'friends'} aria-controls="player-panel" onClick={() => { setTab('friends'); setOpen(true) }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="9" cy="7" r="3" /><path d="M2 21v-3a7 7 0 0 1 14 0v3M16 4a3 3 0 0 1 0 6m2 4a6 6 0 0 1 4 6" /></svg>
      <span>Bạn bè</span><b>{onlineCount}</b>
    </button>}
    {open && <section className="player-panel" id="player-panel" aria-label="Tài khoản và bạn bè">
      <header className="player-panel-header"><h2>{user ? user.displayName : 'Tài khoản người chơi'}</h2><button type="button" onClick={close} aria-label="Đóng tài khoản">Đóng</button></header>
      {error && <p className="player-error" role="alert">{error}<button type="button" onClick={account.clearError} aria-label="Đóng lỗi">×</button></p>}
      {account.loading ? <p role="status">Đang tải tài khoản…</p> : !session.enabled ? <p className="form-note">Chưa tải được dịch vụ tài khoản. Bạn vẫn có thể chơi khách và đấu máy; tải lại trang để thử lại.</p>
        : !user ? <>
          <p className="form-note">Lưu thành tích, kết bạn và tham gia đấu hạng. Bạn vẫn có thể đóng bảng này để chơi khách.</p>
          {inRoom ? <p className="ready-note">Hãy rời phòng hiện tại trước khi đăng nhập.</p> : <form className="account-form" onSubmit={(event) => { event.preventDefault(); void account.authenticate(register ? 'register' : 'login', userName, password, displayName) }}>
            <label>Tên đăng nhập<input autoComplete="username" value={userName} onChange={(event) => setUserName(event.target.value)} minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" required /></label>
            {register && <label>Tên hiển thị<input autoComplete="nickname" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={32} required /></label>}
            <label>Mật khẩu<input type="password" autoComplete={register ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={register ? 10 : undefined} maxLength={128} required /></label>
            {register && <p className="form-note">Mật khẩu từ 10 ký tự. Phiên bản này chưa có khôi phục mật khẩu qua email.</p>}
            <button className="primary-action" type="submit" disabled={busy}>{busy ? 'Đang xử lý…' : register ? 'Tạo tài khoản' : 'Đăng nhập'}</button>
            <button className="text-action" type="button" disabled={busy} onClick={() => { setRegister((current) => !current); setPassword('') }}>{register ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký'}</button>
          </form>}
        </> : <>
          <div className="player-code-row"><p className="player-code">Mã người chơi <strong>{user.playerCode}</strong></p>
            <button className="copy-player-code" type="button" aria-label="Sao chép mã người chơi" disabled={copying} onClick={() => void copyPlayerCode()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V3H3v13h5" /></svg><span>Sao chép</span>
            </button></div>
          {copyStatus && <p className="copy-player-status" role="status">{copyStatus}</p>}
          <nav className="player-tabs" aria-label="Mục tài khoản">
            <button type="button" aria-pressed={tab === 'profile'} onClick={() => setTab('profile')}>Hồ sơ</button>
            <button type="button" aria-pressed={tab === 'friends'} onClick={() => setTab('friends')}>Bạn bè{waiting ? ` (${waiting})` : ''}</button>
            <button type="button" aria-pressed={tab === 'ranked'} onClick={() => setTab('ranked')}>Xếp hạng</button>
          </nav>
          {tab === 'profile' && <div className="profile-content">
            <p className="rank-line">{user.rank} · <strong>{user.rating} Elo</strong>{user.rankedGames < 10 && ` · ${user.rankedGames}/10 trận xác định`}</p>
            <h3>Thành tích theo chế độ</h3>
            {!profile?.stats.length ? <p className="form-note">Chưa có trận hoàn tất. Trận bị hủy không tính thắng/thua.</p> : <ul className="player-list">{profile.stats.map((stats) => <li key={`${stats.mode}:${stats.botDifficulty}`}>
              <div><strong>{modeNames[stats.mode]}{stats.botDifficulty ? ` · ${botDifficultyNames[stats.botDifficulty as BotDifficulty] ?? stats.botDifficulty}` : ''}</strong>
                <p>{stats.wins} thắng · {stats.losses} thua · {Math.round(100 * stats.wins / stats.played)}% thắng</p></div>
            </li>)}</ul>}
            <h3>Lịch sử trận</h3>
            {!profile?.history.length ? <p className="form-note">Các trận mới của tài khoản sẽ hiện ở đây.</p> : <><table className="match-history"><thead><tr><th>Ngày / Chế độ</th><th>Đối thủ</th><th>Kết quả</th></tr></thead><tbody>{profile.history.map((match) => <tr key={match.id}>
              <td><time dateTime={match.createdUtc}>{new Date(match.createdUtc).toLocaleDateString('vi-VN')}</time><small>{modeNames[match.mode]}</small></td><td className="history-opponent">{match.opponentName ?? (match.mode === 'Bot' ? 'Máy' : 'Người chơi khách')}</td><td>{match.state === 'Finished' ? (match.oneId === user.id ? match.winner === 'One' : match.winner === 'Two') ? 'Thắng' : 'Thua' : match.state === 'Interrupted' ? 'Gián đoạn' : match.state === 'Cancelled' ? 'Đã hủy' : 'Chưa kết thúc'}</td>
            </tr>)}</tbody></table><div className="player-pagination"><button disabled={busy || profile.page === 0} onClick={() => void loadProfile(profile.page - 1)}>Trước</button><span>Trang {profile.page + 1}</span><button disabled={busy || !profile.hasMore} onClick={() => void loadProfile(profile.page + 1)}>Sau</button></div></>}
            <details className="account-options"><summary>Đổi tên và mật khẩu</summary>
              <form className="account-form" onSubmit={(event) => { event.preventDefault(); void account.updateName(newName) }}><label>Tên hiển thị mới<input value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={32} required /></label><button disabled={busy}>Lưu tên</button></form>
              {!inRoom && <form className="account-form" onSubmit={(event) => { event.preventDefault(); void account.changePassword(currentPassword, newPassword); setCurrentPassword(''); setNewPassword('') }}>
                <label>Mật khẩu hiện tại<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} maxLength={128} required /></label>
                <label>Mật khẩu mới<input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={10} maxLength={128} required /></label><button disabled={busy}>Đổi mật khẩu</button>
              </form>}
            </details>
            <button className="text-action" disabled={busy || inRoom} onClick={() => void account.logout()}>Đăng xuất{inRoom ? ' · rời phòng trước' : ''}</button>
          </div>}
          {tab === 'friends' && <div>
            <form className="account-form" onSubmit={(event) => { event.preventDefault(); void account.action('friends', { playerCode: friendCode.toUpperCase(), action: 'request' }) }}>
              <label>Mã người chơi muốn kết bạn<input value={friendCode} onChange={(event) => setFriendCode(event.target.value.toUpperCase())} maxLength={12} minLength={12} required /></label><button disabled={busy}>Gửi lời kết bạn</button>
            </form>
            {!community ? <p role="status">Đang tải danh sách…</p> : <>
              {community.invites.length > 0 && <><h3>Lời mời chơi</h3><ul className="player-list">{community.invites.map((invite) => <li key={invite.id}><div><strong>{invite.other.displayName}</strong><p>{invite.incoming ? 'Mời bạn chơi giao hữu' : 'Đang chờ trả lời'} · <Countdown until={invite.expiresUtc} /></p></div><div className="player-row-actions">
                {invite.incoming && <button disabled={busy || inRoom || !connected} onClick={() => void account.action('invites', { id: invite.id, action: 'accept' })}>Chấp nhận</button>}
                <button disabled={busy} onClick={() => void account.action('invites', { id: invite.id, action: 'decline' })}>{invite.incoming ? 'Từ chối' : 'Hủy mời'}</button></div></li>)}</ul></>}
              <div className="friends-heading"><h3>Bạn bè · {onlineCount} online</h3>
                <button type="button" aria-pressed={onlineOnly} onClick={() => setOnlineOnly(!onlineOnly)}>Chỉ online</button></div>
              {community.friends.length === 0 && <p className="form-note">Dùng mã người chơi để thêm bạn đầu tiên.</p>}
              {onlineOnly && community.friends.length > 0 && friends.length === 0 && <p className="form-note">Chưa có bạn online sẵn sàng chơi.</p>}
              <ul className="player-list friends-list">{friends.map((friend) => <li key={friend.user.id}>
                <div><strong>{friend.user.displayName}</strong><p className={`friend-presence ${friend.accepted ? `presence-${friend.status.toLowerCase()}` : ''}`}>{friend.accepted ? friend.status === 'Online' ? 'Online · Sẵn sàng chơi' : friend.status === 'Busy' ? 'Đang đấu / tìm trận' : 'Offline' : friend.incoming ? 'Muốn kết bạn với bạn' : 'Đã gửi lời kết bạn'}</p><small>{friend.user.playerCode}</small></div>
                <div className="player-row-actions">{friend.accepted ? <button className="invite-friend" aria-label={`Mời ${friend.user.displayName} chơi`} disabled={unavailable || friend.status !== 'Online' || community.invites.some((invite) => invite.other.id === friend.user.id)} onClick={() => void account.action('invites', { id: friend.user.playerCode, action: 'send' })}>{community.invites.some((invite) => invite.other.id === friend.user.id && !invite.incoming) ? 'Đã mời' : 'Mời chơi'}</button>
                  : friend.incoming && <button disabled={busy} onClick={() => void account.action('friends', { playerCode: friend.user.playerCode, action: 'accept' })}>Đồng ý</button>}
                  <details className="friend-options"><summary aria-label={`Tùy chọn với ${friend.user.displayName}`}>Thêm</summary><div>
                    <button disabled={busy} onClick={() => void account.action('friends', { playerCode: friend.user.playerCode, action: 'remove' })}>{friend.accepted ? 'Xóa bạn' : friend.incoming ? 'Từ chối' : 'Hủy'}</button>
                    <button disabled={busy} onClick={() => void account.action('friends', { playerCode: friend.user.playerCode, action: 'block' })}>Chặn</button>
                  </div></details>
                </div></li>)}</ul>
              {community.blocked.length > 0 && <details><summary>Người đã chặn</summary><ul className="player-list">{community.blocked.map((blocked) => <li key={blocked.playerCode}><span>{blocked.displayName}</span><button disabled={busy} onClick={() => void account.action('friends', { playerCode: blocked.playerCode, action: 'unblock' })}>Bỏ chặn</button></li>)}</ul></details>}
              {inRoom && <p className="form-note">Rời phòng hiện tại để nhận lời mời hoặc mời bạn vào trận mới.</p>}
            </>}
          </div>}
          {tab === 'ranked' && <div>
            <p className="rank-line">{user.rank} · <strong>{user.rating} Elo</strong></p>
            <p className="form-note">Chỉ các trận ghép ở đây tính điểm. Đấu máy, phòng mã và chơi lại giao hữu không cộng Elo.</p>
            {community?.pairing ? <div className="matchmaking-state"><h3>Đã tìm được đối thủ</h3><p>{community.pairing.opponent.displayName} · {community.pairing.opponent.rating} Elo</p><p>Xác nhận trong <Countdown until={community.pairing.expiresUtc} /></p>
              <button className="primary-action" disabled={busy || community.pairing.accepted || inRoom} onClick={() => void account.action('queue', { action: 'accept', pairingId: community.pairing?.id })}>{community.pairing.accepted ? 'Đang chờ đối thủ xác nhận…' : 'Sẵn sàng vào trận'}</button>
              <button className="text-action" disabled={busy} onClick={() => void account.action('queue', { action: 'cancel' })}>Từ chối</button></div>
              : community?.queue ? <div className="matchmaking-state" role="status"><p>Đang tìm đối thủ gần {community.queue.rating} Elo…</p><p className="form-note">Khoảng điểm mở rộng dần sau 30 và 60 giây.</p><button className="secondary-action" disabled={busy} onClick={() => void account.action('queue', { action: 'cancel' })}>Hủy tìm trận</button></div>
                : <button className="primary-action ranked-start" disabled={busy || inRoom || !connected || !community} onClick={() => void account.action('queue', { action: 'join' })}>{inRoom ? 'Rời phòng để tìm trận mới' : 'Tìm trận xếp hạng'}</button>}
            <h3>Bảng xếp hạng</h3>
            {!account.leaderboard?.users.length ? <p className="form-note">Chưa có người chơi hoàn tất 10 trận xác định hạng.</p> : <><ol className="leaderboard-list" start={account.leaderboard.page * 20 + 1}>{account.leaderboard.users.map((player) => <li key={player.id}><span>{player.displayName}<small>{player.rank} · {player.rankedWins}/{player.rankedGames} trận thắng</small></span><strong>{player.rating}</strong></li>)}</ol>
              <div className="player-pagination"><button disabled={busy || account.leaderboard.page === 0} onClick={() => void loadLeaderboard(account.leaderboard!.page - 1)}>Trước</button><span>Trang {account.leaderboard.page + 1}</span><button disabled={busy || !account.leaderboard.hasMore} onClick={() => void loadLeaderboard(account.leaderboard!.page + 1)}>Sau</button></div></>}
          </div>}
        </>}
    </section>}
  </div>
}
