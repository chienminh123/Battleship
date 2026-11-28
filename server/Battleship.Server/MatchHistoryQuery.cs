using Battleship.Core;
using Battleship.Server.Data;
using Microsoft.EntityFrameworkCore;

namespace Battleship.Server;

public sealed record MatchHistoryEntry(string Id, string RoomCode, MatchMode Mode, MatchState State,
    string? OneId, string? TwoId, BotDifficulty? BotDifficulty, PlayerId? Winner, string? Reason,
    DateTime CreatedUtc, DateTime? StartedUtc, DateTime? FinishedUtc, string OpponentName);

public static class MatchHistoryQuery
{
    public static IQueryable<MatchHistoryEntry> ForPlayer(AppDb db, string playerId, int page) =>
        from match in db.Matches.AsNoTracking()
            .Where(match => match.OneId == playerId || match.TwoId == playerId)
            .OrderByDescending(match => match.CreatedUtc).ThenBy(match => match.Id).Skip(page * 20).Take(20)
        join opponent in db.Users.AsNoTracking() on (match.OneId == playerId ? match.TwoId : match.OneId) equals opponent.Id into opponents
        from opponent in opponents.DefaultIfEmpty()
        select new MatchHistoryEntry(match.Id, match.RoomCode, match.Mode, match.State, match.OneId, match.TwoId,
            match.BotDifficulty, match.Winner, match.Reason, match.CreatedUtc, match.StartedUtc, match.FinishedUtc,
            match.Mode == MatchMode.Bot ? "Máy" : opponent == null ? "Người chơi khách" : opponent.DisplayName);
}
