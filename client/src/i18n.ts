import type { GameShotStatus, ShipType } from './types'

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
  ROOM_CREATE_RATE_LIMITED: 'Bạn tạo phòng quá nhanh. Hãy chờ một phút rồi thử lại.',
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
