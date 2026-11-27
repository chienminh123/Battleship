using System.Security.Claims;
using Battleship.Core;
using Battleship.Server.Data;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Battleship.Server;

public static class RatingMath
{
    public static int Delta(int one, int two, bool oneWon) => (int)Math.Round(
        32 * ((oneWon ? 1 : 0) - 1 / (1 + Math.Pow(10, (two - one) / 400.0))), MidpointRounding.AwayFromZero);
}

public sealed partial class PlayerPlatform(IServiceScopeFactory scopes, IRoomStore rooms, TimeProvider clock)
{
    public object Gate { get; } = new();
    private readonly Dictionary<string, HashSet<string>> _connections = [];
    private readonly Dictionary<string, string> _connectionAccounts = [];
    private readonly Dictionary<string, ClaimsPrincipal> _principals = [];

    public string? CurrentId(ClaimsPrincipal? principal)
    {
        var id = principal?.FindFirstValue(ClaimTypes.NameIdentifier);
        var sessionId = principal?.FindFirstValue(AccountApi.SessionClaim);
        if (id is null || sessionId is null) return null;
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDb>();
        var session = db.Sessions.AsNoTracking().SingleOrDefault(value => value.Id == sessionId && value.AccountId == id);
        if (session is null || session.ExpiresUtc <= clock.GetUtcNow().UtcDateTime) return null;
        return db.Users.AsNoTracking().Any(user => user.Id == id && user.SecurityStamp == session.SecurityStamp) ? id : null;
    }

    public void Connected(ClaimsPrincipal? principal, string connection)
    {
        var id = CurrentId(principal);
        if (id is null) return;
        lock (Gate)
        {
            if (!_connections.TryGetValue(id, out var connections)) _connections[id] = connections = [];
            connections.Add(connection);
            _connectionAccounts[connection] = id;
            _principals[connection] = principal!;
        }
    }

    public void Disconnected(string connection)
    {
        lock (Gate)
        {
            if (!_connectionAccounts.Remove(connection, out var id)) return;
            _principals.Remove(connection);
            if (_connections.TryGetValue(id, out var connections))
            {
                connections.Remove(connection);
                if (connections.Count == 0) _connections.Remove(id);
            }
        }
    }

    public Room? BusyRoom(string id, string? except = null)
    {
        foreach (var room in rooms.Rooms)
        {
            if (room.Code == except) continue;
            lock (room.SyncRoot)
                if (Enum.GetValues<PlayerId>().Any(player => room.AccountIdFor(player) == id) && room.Game.Phase != GamePhase.Finished)
                    return room;
        }
        return null;
    }

    public void CheckAvailable(string? id, string? exceptRoom = null)
    {
        if (id is not null && (BusyRoom(id, exceptRoom) is not null || _queue.ContainsKey(id) || _pairings.Values.Any(pair => pair.One == id || pair.Two == id)))
            throw new HubException("ACCOUNT_BUSY");
    }

    public void CheckJoin(Room room, string? token, string? accountId)
    {
        CheckAvailable(accountId, room.Code);
        foreach (var player in Enum.GetValues<PlayerId>())
        {
            var assigned = room.AccountIdFor(player);
            if (!string.IsNullOrWhiteSpace(token) && room.GetPlayerToken(player) == token && assigned is not null && assigned != accountId)
                throw new HubException("ACCOUNT_REQUIRED");
            if (string.IsNullOrWhiteSpace(token) && assigned is not null && assigned == accountId)
                throw new HubException("ALREADY_IN_ROOM");
        }
    }

    public IReadOnlyList<PlatformNotice> RevokeExpiredConnections()
    {
        var notices = new List<PlatformNotice>();
        lock (Gate)
        {
            foreach (var pair in _principals.ToArray())
            {
                if (CurrentId(pair.Value) is not null) continue;
                Disconnected(pair.Key);
                foreach (var room in rooms.Rooms)
                    lock (room.SyncRoot) room.UnbindConnection(pair.Key);
                notices.Add(new(pair.Key, "SessionExpired", new { message = "Phiên đăng nhập đã kết thúc. Hãy đăng nhập lại." }));
            }
        }
        return notices;
    }

    public void Record(MatchRecord snapshot)
    {
        if (snapshot.OneId is null && snapshot.TwoId is null) return;
        lock (Gate)
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDb>();
            using var transaction = db.Database.BeginTransaction();
            var existing = db.Matches.Find(snapshot.Id);
            if (existing?.State is MatchState.Finished or MatchState.Interrupted or MatchState.Cancelled) return;
            if (existing is null) db.Matches.Add(snapshot);
            else db.Entry(existing).CurrentValues.SetValues(snapshot);
            if (snapshot.State == MatchState.Finished && snapshot.Mode == MatchMode.Ranked &&
                snapshot.OneId is { } oneId && snapshot.TwoId is { } twoId && snapshot.Winner is { } winner)
            {
                var one = db.Users.Single(user => user.Id == oneId);
                var two = db.Users.Single(user => user.Id == twoId);
                var delta = RatingMath.Delta(one.Rating, two.Rating, winner == PlayerId.One);
                db.RatingChanges.AddRange(new RatingChange { MatchId = snapshot.Id, AccountId = oneId, Before = one.Rating, After = one.Rating + delta },
                    new RatingChange { MatchId = snapshot.Id, AccountId = twoId, Before = two.Rating, After = two.Rating - delta });
                one.Rating += delta; two.Rating -= delta;
                one.RankedGames++; two.RankedGames++;
                if (winner == PlayerId.One) { one.RankedWins++; two.RankedLosses++; }
                else { two.RankedWins++; one.RankedLosses++; }
            }
            db.SaveChanges();
            transaction.Commit();
        }
    }

    public void Track(Room room)
    {
        MatchRecord snapshot;
        lock (room.SyncRoot) snapshot = room.Snapshot();
        Record(snapshot);
        lock (room.SyncRoot) if (room.MatchId == snapshot.Id && snapshot.State == MatchState.Finished) room.ResultRecorded = true;
    }
}
