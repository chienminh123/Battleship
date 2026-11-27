import { shipNames } from './i18n'
import { sameCoordinate } from './types'
import type { BattleEvent } from './battlePresentation'
import type { BoardView, BotDifficulty, ChatMessage, GameOverMessage, GamePhase, JoinRoomResponse, PlayerId, ShotHistoryItem } from './types'

export type HubState = {
  connected: boolean; restoring: boolean; isBot: boolean; phase: GamePhase; roomCode: string
  botDifficulty?: BotDifficulty
  chatMessages: ChatMessage[]
  identityVersion?: number; matchId?: string; mode?: 'Bot' | 'Friendly' | 'Ranked'
  turnDeadlineUtc?: string | null; placementDeadlineUtc?: string | null
  player?: PlayerId; token?: string; currentPlayer?: PlayerId
  opponentConnected: boolean; fleetSubmitted: boolean; opponentFleetSubmitted: boolean
  isYourTurn: boolean; ownBoard?: BoardView; shots: ShotHistoryItem[]
  incomingShots: ShotHistoryItem[]; gameOver?: GameOverMessage; message: string; error?: string
  liveEvents: BattleEvent[]
}

export const initialState: HubState = {
  connected: false, restoring: false, isBot: false, phase: 'WaitingForOpponent', roomCode: '', chatMessages: [],
  opponentConnected: false, fleetSubmitted: false, opponentFleetSubmitted: false,
  isYourTurn: false, shots: [], incomingShots: [], message: 'Đang kết nối đến máy chủ…', liveEvents: [],
}

export function joinedState(current: HubState, response: JoinRoomResponse): HubState {
  return {
    ...current, connected: true, restoring: false, roomCode: response.code, token: response.playerToken,
    player: response.player, isBot: response.isBot, phase: response.phase, currentPlayer: response.currentPlayer,
    botDifficulty: response.isBot ? response.botDifficulty ?? 'Easy' : undefined,
    matchId: response.matchId, mode: response.mode, turnDeadlineUtc: response.turnDeadlineUtc, placementDeadlineUtc: response.placementDeadlineUtc,
    chatMessages: response.isBot ? [] : mergeChat(
      current.roomCode === response.code ? current.chatMessages : [], response.chatMessages ?? []),
    isYourTurn: response.isYourTurn, opponentConnected: response.opponentConnected,
    fleetSubmitted: response.ownFleetSubmitted, opponentFleetSubmitted: response.opponentFleetSubmitted,
    ownBoard: response.ownBoard, shots: response.shotsAgainstOpponent ?? [],
    incomingShots: response.shotsAgainstYou ?? [], gameOver: response.result, liveEvents: [], error: undefined,
    message: response.phase === 'Finished' ? 'Trận đấu đã kết thúc. Bạn có thể chơi lại hoặc trở về sảnh.'
      : response.phase === 'Playing' ? 'Đã khôi phục trận đấu.'
        : response.phase === 'WaitingForOpponent' ? 'Đang chờ đối thủ vào phòng…' : 'Hãy xếp đội tàu và sẵn sàng chiến đấu.',
  }
}

export type GameEvent =
  | { type: 'ChatMessage'; roomCode: string; message: ChatMessage }
  | { type: 'OpponentJoined' | 'OpponentReconnected' | 'OpponentReady' | 'OpponentLeft' | 'RematchRequested' }
  | { type: 'GameStarted'; isYourTurn: boolean; turnDeadlineUtc?: string | null }
  | { type: 'ShotResult' | 'IncomingShot'; shot: ShotHistoryItem & { turnDeadlineUtc?: string | null }; id: number }
  | { type: 'GameOver'; result: GameOverMessage }

export function reduceGameEvent(state: HubState, event: GameEvent): HubState {
  switch (event.type) {
    case 'ChatMessage': return state.roomCode !== event.roomCode || state.isBot ? state
      : { ...state, chatMessages: mergeChat(state.chatMessages, [event.message]) }
    case 'OpponentJoined': return { ...state, phase: state.phase === 'WaitingForOpponent' ? 'Placing' : state.phase, opponentConnected: true, message: 'Đối thủ đã vào phòng. Hãy xếp đội tàu.' }
    case 'OpponentReconnected': return { ...state, opponentConnected: true, message: 'Đối thủ đã kết nối lại.' }
    case 'OpponentReady': return { ...state, opponentFleetSubmitted: true, message: 'Đối thủ đã khóa tàu.' }
    case 'OpponentLeft': return { ...state, opponentConnected: false, message: state.phase === 'Finished' ? state.message : 'Đối thủ mất kết nối. Đang chờ họ quay lại…' }
    case 'RematchRequested': return { ...state, message: 'Đối thủ muốn chơi lại. Chọn Chơi lại để đồng ý.' }
    case 'GameStarted': return { ...state, phase: 'Playing', turnDeadlineUtc: event.turnDeadlineUtc, isYourTurn: event.isYourTurn, currentPlayer: event.isYourTurn ? state.player : state.player === 'One' ? 'Two' : 'One', message: event.isYourTurn ? 'Bạn bắn trước. Chọn một ô trên biển đối thủ.' : 'Đối thủ bắn trước. Theo dõi đội tàu của bạn.' }
    case 'GameOver': return { ...state, phase: 'Finished', gameOver: event.result, isYourTurn: false,
      message: event.result.reason === 'Surrender' ? event.result.winner === state.player ? 'Đối thủ đã đầu hàng.' : 'Bạn đã đầu hàng.'
        : event.result.reason === 'LeftMatch' ? event.result.winner === state.player ? 'Đối thủ đã rời trận.' : 'Bạn đã rời trận.'
          : event.result.reason === 'Timeout' ? 'Trận kết thúc do hết thời gian.'
            : event.result.winner === state.player ? 'Bạn đã chiến thắng!' : 'Đội tàu của bạn đã bị đánh chìm.' }
    case 'ShotResult': {
      if (state.shots.some((previous) => sameCoordinate(previous.coordinate, event.shot.coordinate))) return state
      return {
        ...state, shots: [...state.shots, event.shot], isYourTurn: false, turnDeadlineUtc: event.shot.turnDeadlineUtc,
        liveEvents: [...state.liveEvents, { id: event.id, board: 'enemy', shot: event.shot }],
        currentPlayer: state.player === 'One' ? 'Two' : 'One',
        message: event.shot.status === 'Won' ? 'Bạn đã đánh chìm toàn bộ tàu đối thủ!'
          : event.shot.status === 'Sunk' ? `${event.shot.sunkShip ? shipNames[event.shot.sunkShip] : 'Tàu đối thủ'} đã chìm!`
            : event.shot.status === 'Hit' ? 'Bắn trúng tàu! Đến lượt đối thủ.' : 'Bắn trượt. Đến lượt đối thủ.',
      }
    }
    case 'IncomingShot': {
      if (state.incomingShots.some((previous) => sameCoordinate(previous.coordinate, event.shot.coordinate))) return state
      return {
        ...state, incomingShots: [...state.incomingShots, event.shot], isYourTurn: true, currentPlayer: state.player, turnDeadlineUtc: event.shot.turnDeadlineUtc,
        liveEvents: [...state.liveEvents, { id: event.id, board: 'own', shot: event.shot }],
        ownBoard: state.ownBoard ? {
          incomingShots: [...state.ownBoard.incomingShots, event.shot.coordinate],
          ships: state.ownBoard.ships.map((ship) => ship.cells.some((cell) => sameCoordinate(cell, event.shot.coordinate))
            ? { ...ship, hits: [...ship.hits, event.shot.coordinate], isSunk: ship.hits.length + 1 === ship.cells.length } : ship),
        } : undefined,
        message: event.shot.status === 'Sunk' ? `${event.shot.sunkShip ? shipNames[event.shot.sunkShip] : 'Tàu của bạn'} đã bị đánh chìm!`
          : event.shot.status === 'Hit' ? 'Đối thủ bắn trúng tàu của bạn.' : 'Đối thủ bắn trượt!',
      }
    }
  }
}

export function mergeChat(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map([...current, ...incoming].map((message) => [message.id, message]))
  return [...byId.values()].sort((a, b) => a.id - b.id).slice(-100)
}
