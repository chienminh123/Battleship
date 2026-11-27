import type { BotDifficulty, GameShotStatus, ShipType } from './types'

export const botDifficultyNames: Record<BotDifficulty, string> = {
  Easy: 'Dễ', Hard: 'Khó', Annihilation: 'Hủy diệt',
}



export const shipNames: Record<ShipType, string> = {
  Carrier: 'Tàu sân bay', Battleship: 'Thiết giáp hạm', Cruiser: 'Tuần dương hạm',
  Submarine: 'Tàu ngầm', Destroyer: 'Khu trục hạm',
}

export const shotNames: Record<GameShotStatus, string> = {
  Miss: 'Trượt', Hit: 'Trúng tàu', Sunk: 'Chìm tàu', Won: 'Chiến thắng',
  NotYourTurn: 'Chưa đến lượt bạn.', GameNotReady: 'Trận đấu chưa bắt đầu.',
  GameFinished: 'Trận đấu đã kết thúc.', OutOfBounds: 'Ô nằm ngoài bản đồ.',
  AlreadyFired: 'Bạn đã bắn ô này rồi. Hãy chọn ô khác.',
}

const errors: Record<string, string> = {
  ROOM_NOT_FOUND: 'Phòng không còn tồn tại. Hãy tạo phòng mới hoặc kiểm tra mã phòng.',
  ROOM_FULL: 'Phòng đã đủ người hoặc mã khôi phục không hợp lệ.',
  NOT_IN_ROOM: 'Bạn chưa ở trong phòng. Hãy vào lại phòng.',
  ALREADY_IN_ROOM: 'Bạn đang ở trong một phòng. Hãy rời trận trước khi vào phòng khác.',
  INVALID_PLAYER_TOKEN: 'Mã khôi phục không còn hợp lệ. Hãy vào lại phòng.',
  INVALID_BOT_DIFFICULTY: 'Mức độ máy không hợp lệ. Hãy chọn lại mức chơi.',
  ROOM_CREATE_RATE_LIMITED: 'Bạn tạo phòng quá nhanh. Hãy chờ một phút rồi thử lại.',
  ACCOUNT_REQUIRED: 'Hãy đăng nhập lại để khôi phục đúng ghế của bạn.',
  ACCOUNT_BUSY: 'Tài khoản đang ở phòng khác hoặc đang tìm trận. Hãy trở về phòng đó trước.',
  RESULT_PENDING: 'Kết quả đang được ghi nhận. Hãy chờ một chút rồi thử lại.',
  TURN_EXPIRED: 'Đã hết thời gian lượt. Máy chủ đang xác nhận kết quả.',
  PLACEMENT_EXPIRED: 'Đã hết thời gian xếp tàu. Trận không tính điểm.',
  GAME_NOT_PLAYING: 'Trận đấu chưa bắt đầu hoặc đã kết thúc.',
  CHAT_EMPTY: 'Hãy nhập nội dung tin nhắn.', CHAT_TOO_LONG: 'Mỗi tin tối đa 300 ký tự và không chứa ký tự điều khiển.',
  CHAT_RATE_LIMITED: 'Bạn gửi quá nhanh. Chờ vài giây rồi thử lại.',
  CHAT_UNAVAILABLE: 'Chat chỉ có trong phòng chơi với người khác.',
  CHAT_INVALID_REQUEST: 'Không thể gửi tin này. Hãy tạo tin mới.',
  CHAT_REQUEST_CONFLICT: 'Tin đã gửi có nội dung khác. Hãy gửi bằng một tin mới.',
  FleetAlreadyPlaced: 'Bạn đã khóa đội tàu.', MissingShip: 'Đội tàu còn thiếu tàu.',
  DuplicateShip: 'Mỗi loại tàu chỉ được đặt một lần.', UnknownShip: 'Loại tàu không hợp lệ.',
  InvalidOrientation: 'Hướng tàu không hợp lệ.', OutOfBounds: 'Tàu nằm ngoài bản đồ.',
  Overlap: 'Các tàu đang chồng lên nhau. Hãy di chuyển ô được đánh dấu đỏ.',
  InvalidFleetCount: 'Cần đủ năm tàu để bắt đầu.', WrongPhase: 'Không thể đặt tàu ở bước này.',
  FleetAlreadySubmitted: 'Bạn đã khóa đội tàu.',
}

export function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return Object.entries(errors).find(([code]) => message.includes(code))?.[1]
    ?? 'Không thể thực hiện thao tác. Kiểm tra kết nối và thử lại.'
}
