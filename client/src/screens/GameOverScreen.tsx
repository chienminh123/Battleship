import { BoardGrid, ShotMark } from '../BoardGrid'
import { OceanBoard3D } from '../Board3D'
import { cellKey } from '../coordinates'
import { shotStatus, sunkCellKeys } from '../battlePresentation'
import { botDifficultyNames } from '../i18n'
import type { GraphicsQuality } from '../battlePresentation'
import type { HubState } from '../useGameHub'
import type { Profile } from '../accountTypes'

export function GameOverScreen({ state, busy, threeDimensional, quality, onFallback, onRematch, onLeave, profile }: { state: HubState; busy: boolean; threeDimensional: boolean; quality: GraphicsQuality; onFallback: () => void; onRematch: () => void; onLeave: () => void; profile?: Profile }) {
  const won = state.gameOver?.winner === state.player
  const opponent = state.gameOver?.opponentFleet ?? []
  const reason = state.gameOver?.reason
  const fleetSunk = !reason || reason === 'FleetSunk'
  const rating = profile?.ratingChanges?.find((change) => change.matchId === state.matchId)
  return <div className="game-view game-over-view">
    <h1>{won ? 'Bạn đã chiến thắng!' : 'Hạm đội đã thất thủ.'}</h1>
    <p className="hero-lede">{fleetSunk ? won ? 'Bạn đã đánh chìm toàn bộ năm tàu đối thủ. Đại dương thuộc về bạn!' : 'Đối thủ đã đánh chìm toàn bộ tàu của bạn. Thử lại với một cách bố trí khác nhé.' : reason === 'Timeout' ? 'Trận đấu kết thúc vì một người chơi hết thời gian lượt hoặc kết nối.' : won ? 'Đối thủ đã đầu hàng hoặc rời trận.' : 'Bạn đã đầu hàng hoặc rời trận.'}</p>
    <p className="result-summary">{state.shots.length} phát bắn · {state.isBot ? `Đấu với máy · ${botDifficultyNames[state.botDifficulty ?? 'Easy']}` : `Phòng ${state.roomCode}`}</p>
    {state.gameOver?.reason && <p className="form-note">{state.gameOver.reason === 'Timeout' ? 'Trận kết thúc do hết thời gian.' : state.gameOver.reason === 'Surrender' ? 'Trận kết thúc do đầu hàng.' : state.gameOver.reason === 'LeftMatch' ? 'Đối thủ đã rời trận.' : ''}</p>}
    {state.mode === 'Ranked' && <>
      <p className="rank-line" role="status">{rating ? `${rating.before} → ${rating.after} Elo (${rating.after >= rating.before ? '+' : ''}${rating.after - rating.before})` : 'Đang ghi nhận kết quả xếp hạng…'}</p>
      <p className="form-note">Chơi lại trong phòng này là giao hữu và không cộng Elo.</p>
    </>}
    <div className="game-over-actions"><button className="primary-action" disabled={busy || (!state.isBot && !state.opponentConnected)} onClick={onRematch}>{busy ? 'Đang chuẩn bị…' : state.isBot ? 'Chơi lại với máy' : 'Yêu cầu chơi lại'}</button><button className="secondary-action" disabled={busy} onClick={onLeave}>Trở về sảnh</button></div>
    <p className="board-hint" role="status">{state.message}</p>
    <div className="final-boards"><div><h2>Đội tàu đối thủ được tiết lộ</h2>{threeDimensional
      ? <OceanBoard3D label="Đội tàu đối thủ được tiết lộ sau trận đấu" quality={quality} showWrecks ships={opponent} shots={state.shots} onUnavailable={onFallback} />
      : <BoardGrid ariaLabel="Vị trí đội tàu đối thủ sau trận đấu" ships={opponent} cell={(cell) => {
        const shot = state.shots.find((item) => cellKey(item.coordinate) === cellKey(cell))
        const status = shotStatus(shot, sunkCellKeys(state.shots, opponent))
        return <div className={`grid-cell own-cell ${status ? `shot-${status.toLowerCase()}` : ''}`}>{status && <ShotMark status={status} />}</div>
      }} />}</div><div><h2>Đội tàu của bạn</h2>{threeDimensional
      ? <OceanBoard3D label="Đội tàu của bạn sau trận đấu" quality={quality} showWrecks ships={state.ownBoard?.ships} shots={state.incomingShots} onUnavailable={onFallback} />
      : <BoardGrid ariaLabel="Đội tàu của bạn sau trận đấu" ships={state.ownBoard?.ships} cell={(cell) => {
        const shot = state.incomingShots.find((s) => cellKey(s.coordinate) === cellKey(cell))
        const status = shotStatus(shot, sunkCellKeys(state.incomingShots, state.ownBoard?.ships))
        return <div className={`grid-cell own-cell ${status ? `shot-${status.toLowerCase()}` : ''}`}>{status && <ShotMark status={status} />}
      </div> }} />}</div></div>
  </div>
}
