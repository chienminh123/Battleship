export type Account = {
  id: string; displayName: string; playerCode: string; rating: number; rankedGames: number
  rankedWins: number; rankedLosses: number; rank: string
}
export type Session = { enabled: boolean; csrfToken?: string | null; user?: Account | null }
export type Community = {
  friends: { user: Account; accepted: boolean; incoming: boolean; status: 'Online' | 'Busy' | 'Offline' }[]
  invites: { id: string; expiresUtc: string; incoming: boolean; other: Account }[]
  activeRoom?: { code: string; playerToken: string } | null
  queue?: { enteredUtc: string; rating: number } | null
  pairing?: { id: string; expiresUtc: string; accepted: boolean; opponent: Account } | null
  blocked: { displayName: string; playerCode: string }[]
}
export type MatchMode = 'Bot' | 'Friendly' | 'Ranked'
export type MatchHistory = {
  opponentName?: string
  id: string; roomCode: string; mode: MatchMode; state: 'Waiting' | 'Playing' | 'Finished' | 'Cancelled' | 'Interrupted'
  oneId?: string | null; twoId?: string | null; winner?: 'One' | 'Two' | null
  createdUtc: string; finishedUtc?: string | null; reason?: string | null
}
export type Profile = {
  user: Account; history: MatchHistory[]; page: number; hasMore: boolean
  ratingChanges?: { matchId: string; before: number; after: number }[]
  stats: { mode: MatchMode; botDifficulty?: string | null; played: number; wins: number; losses: number }[]
}
export const modeNames: Record<MatchMode, string> = { Bot: 'Đấu máy', Friendly: 'Giao hữu', Ranked: 'Xếp hạng' }

export const communityErrors: Record<string, string> = {
  ACCOUNT_BUSY: 'Bạn hoặc người kia đang ở một phòng hay đang tìm trận. Hãy rời phòng trước.',
  ACCOUNT_REQUIRED: 'Hãy đăng nhập lại để khôi phục đúng ghế của bạn.',
  PLAYER_NOT_FOUND: 'Không tìm thấy mã người chơi này.', SELF_ACTION: 'Không thể thực hiện với chính mình.',
  PLAYER_BLOCKED: 'Không thể kết nối với người chơi này.', REQUEST_EXPIRED: 'Lời kết bạn không còn hiệu lực.',
  FRIEND_LIMIT: 'Danh sách đã đạt giới hạn 100 bạn và lời mời kết bạn.', NOT_FRIENDS: 'Hai người cần là bạn bè trước khi mời chơi.',
  PLAYER_OFFLINE: 'Người chơi đang offline.', INVITE_PENDING: 'Bạn đang có lời mời chưa xử lý.',
  INVITE_EXPIRED: 'Lời mời đã hết hạn hoặc được xử lý.', CONNECTION_REQUIRED: 'Hãy chờ kết nối game sẵn sàng.',
  QUEUE_COOLDOWN: 'Hãy chờ 15 giây trước khi tìm lại.', PAIRING_EXPIRED: 'Lượt ghép này đã hết hạn.',
  INVALID_ACTION: 'Thao tác không hợp lệ.',
}
