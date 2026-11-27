using Battleship.Core;
using Battleship.Server.Data;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Battleship.Server;

public sealed record QueueEntry(string AccountId, int Rating, DateTime EnteredUtc);
public sealed class Pairing(string one, string two, DateTime expiresUtc)
{
    public string Id { get; } = Guid.NewGuid().ToString("N");
    public string One { get; } = one;
    public string Two { get; } = two;
    public DateTime ExpiresUtc { get; } = expiresUtc;
    public HashSet<string> Accepted { get; } = [];
}
public sealed record PlatformNotice(string Connection, string Method, object Payload);
public sealed record FriendAction(string PlayerCode, string Action);
public sealed record InviteAction(string Id, string Action);
public sealed record QueueAction(string Action, string? PairingId = null);

public sealed partial class PlayerPlatform
{
    private readonly Dictionary<string, QueueEntry> _queue = [];
    private readonly Dictionary<string, Pairing> _pairings = [];
    private readonly Dictionary<string, DateTime> _cooldowns = [];

    public object Community(string id)
    {
        lock (Gate)
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDb>();
            var relations = db.Friends.AsNoTracking().Where(friend => friend.FirstId == id || friend.SecondId == id).ToArray();
            var ids = relations.Select(friend => friend.FirstId == id ? friend.SecondId : friend.FirstId).ToArray();
            var users = db.Users.AsNoTracking().Where(user => ids.Contains(user.Id)).ToDictionary(user => user.Id);
            var friends = relations.Where(friend => users.ContainsKey(friend.FirstId == id ? friend.SecondId : friend.FirstId)).Select(friend =>
            {
                var otherId = friend.FirstId == id ? friend.SecondId : friend.FirstId;
                return new { user = AccountApi.View(users[otherId]), friend.Accepted, incoming = friend.RequestedBy != id,
                    status = !_connections.ContainsKey(otherId) ? "Offline" : BusyRoom(otherId) is not null || _queue.ContainsKey(otherId) || _pairings.Values.Any(pair => pair.One == otherId || pair.Two == otherId) ? "Busy" : "Online" };
            }).ToArray();
            var now = clock.GetUtcNow().UtcDateTime;
            var pendingInvites = db.Invites.AsNoTracking().Where(invite => invite.State == InviteState.Pending && invite.ExpiresUtc > now &&
                (invite.SenderId == id || invite.RecipientId == id)).ToArray();
            var inviteIds = pendingInvites.SelectMany(invite => new[] { invite.SenderId, invite.RecipientId }).Distinct().ToArray();
            var inviteUsers = db.Users.AsNoTracking().Where(user => inviteIds.Contains(user.Id)).ToDictionary(user => user.Id);
            var invites = pendingInvites.Select(invite => new { invite.Id, invite.ExpiresUtc, incoming = invite.RecipientId == id,
                other = AccountApi.View(inviteUsers[invite.SenderId == id ? invite.RecipientId : invite.SenderId]) }).ToArray();
            var pairing = _pairings.Values.FirstOrDefault(pair => pair.One == id || pair.Two == id);
            var other = pairing is null ? null : db.Users.AsNoTracking().Single(user => user.Id == (pairing.One == id ? pairing.Two : pairing.One));
            var active = BusyRoom(id);
            object? activeRoom = null;
            if (active is not null)
                lock (active.SyncRoot)
                {
                    var player = active.AccountIdFor(PlayerId.One) == id ? PlayerId.One : PlayerId.Two;
                    activeRoom = new { code = active.Code, playerToken = active.GetPlayerToken(player) };
                }
            return new { friends, invites, activeRoom,
                queue = _queue.TryGetValue(id, out var entry) ? new { entry.EnteredUtc, entry.Rating } : null,
                pairing = pairing is null ? null : new { pairing.Id, pairing.ExpiresUtc, accepted = pairing.Accepted.Contains(id), opponent = AccountApi.View(other!) },
                blocked = db.Blocks.Where(block => block.AccountId == id).Join(db.Users, block => block.BlockedId, user => user.Id,
                    (_, user) => new { user.DisplayName, user.PlayerCode }).ToArray() };
        }
    }

    public void Friend(string id, FriendAction action)
    {
        lock (Gate)
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDb>();
            var code = action.PlayerCode?.Trim().ToUpperInvariant();
            var peer = db.Users.SingleOrDefault(user => user.PlayerCode == code) ?? throw new HubException("PLAYER_NOT_FOUND");
            if (peer.Id == id) throw new HubException("SELF_ACTION");
            var first = string.CompareOrdinal(id, peer.Id) < 0 ? id : peer.Id;
            var second = first == id ? peer.Id : id;
            var relation = db.Friends.Find(first, second);
            if (action.Action == "block")
            {
                if (!db.Blocks.Any(block => block.AccountId == id && block.BlockedId == peer.Id)) db.Blocks.Add(new() { AccountId = id, BlockedId = peer.Id });
                if (relation is not null) db.Friends.Remove(relation);
                foreach (var invite in db.Invites.Where(invite => invite.State == InviteState.Pending &&
                    (invite.SenderId == id && invite.RecipientId == peer.Id || invite.SenderId == peer.Id && invite.RecipientId == id))) invite.State = InviteState.Declined;
            }
            else if (action.Action == "unblock") db.Blocks.RemoveRange(db.Blocks.Where(block => block.AccountId == id && block.BlockedId == peer.Id));
            else if (action.Action == "remove") { if (relation is not null) db.Friends.Remove(relation); }
            else if (action.Action is "request" or "accept")
            {
                if (Blocked(db, id, peer.Id)) throw new HubException("PLAYER_BLOCKED");
                if (relation is null)
                {
                    if (action.Action != "request") throw new HubException("REQUEST_EXPIRED");
                    if (db.Friends.Count(friend => friend.FirstId == id || friend.SecondId == id) >= 100) throw new HubException("FRIEND_LIMIT");
                    db.Friends.Add(new() { FirstId = first, SecondId = second, RequestedBy = id });
                }
                else if (relation.RequestedBy != id) relation.Accepted = true;
                else if (action.Action == "accept" && !relation.Accepted) throw new HubException("REQUEST_EXPIRED");
            }
            else throw new HubException("INVALID_ACTION");
            db.SaveChanges();
        }
    }

    public void Invite(string id, InviteAction action)
    {
        lock (Gate)
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDb>();
            var now = clock.GetUtcNow().UtcDateTime;
            if (action.Action == "send")
            {
                var peer = db.Users.SingleOrDefault(user => user.PlayerCode == action.Id) ?? throw new HubException("PLAYER_NOT_FOUND");
                var first = string.CompareOrdinal(id, peer.Id) < 0 ? id : peer.Id;
                var second = first == id ? peer.Id : id;
                if (Blocked(db, id, peer.Id) || db.Friends.Find(first, second)?.Accepted != true) throw new HubException("NOT_FRIENDS");
                CheckAvailable(id); CheckAvailable(peer.Id);
                if (!_connections.ContainsKey(peer.Id)) throw new HubException("PLAYER_OFFLINE");
                if (db.Invites.Any(invite => invite.State == InviteState.Pending && invite.ExpiresUtc > now && (invite.SenderId == id || invite.RecipientId == id)))
                    throw new HubException("INVITE_PENDING");
                db.Invites.Add(new() { SenderId = id, RecipientId = peer.Id, ExpiresUtc = now.AddSeconds(30) });
            }
            else
            {
                var invite = db.Invites.Find(action.Id) ?? throw new HubException("INVITE_EXPIRED");
                if (invite.RecipientId != id && !(action.Action == "decline" && invite.SenderId == id)) throw new HubException("INVITE_EXPIRED");
                if (action.Action == "accept" && invite.State == InviteState.Accepted) return;
                if (invite.State != InviteState.Pending || invite.ExpiresUtc <= now) throw new HubException("INVITE_EXPIRED");
                if (action.Action == "decline") invite.State = InviteState.Declined;
                else if (action.Action == "accept")
                {
                    CheckAvailable(id); CheckAvailable(invite.SenderId);
                    var first = string.CompareOrdinal(id, invite.SenderId) < 0 ? id : invite.SenderId;
                    var second = first == id ? invite.SenderId : id;
                    if (Blocked(db, id, invite.SenderId) || db.Friends.Find(first, second)?.Accepted != true) throw new HubException("NOT_FRIENDS");
                    var room = rooms.Create();
                    room.AssignAccount(PlayerId.One, invite.SenderId);
                    room.ReserveOpponent(id);
                    room.ReservationDeadlineUtc = now.AddSeconds(30);
                    invite.RoomCode = room.Code;
                    invite.State = InviteState.Accepted;
                    try { db.SaveChanges(); Track(room); }
                    catch { rooms.TryRemove(room.Code, out _); throw; }
                    return;
                }
                else throw new HubException("INVALID_ACTION");
            }
            db.SaveChanges();
        }
    }

    public void Queue(string id, QueueAction action)
    {
        lock (Gate)
        {
            var now = clock.GetUtcNow().UtcDateTime;
            if (action.Action == "cancel")
            {
                _queue.Remove(id);
                var pair = _pairings.Values.FirstOrDefault(value => value.One == id || value.Two == id);
                if (pair is not null) CancelPair(pair, id, now);
                return;
            }
            if (action.Action == "join")
            {
                if (_queue.ContainsKey(id) || _pairings.Values.Any(value => value.One == id || value.Two == id)) return;
                CheckAvailable(id);
                if (!_connections.ContainsKey(id)) throw new HubException("CONNECTION_REQUIRED");
                if (_cooldowns.GetValueOrDefault(id) > now) throw new HubException("QUEUE_COOLDOWN");
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDb>();
                _queue[id] = new(id, db.Users.Single(user => user.Id == id).Rating, now);
                return;
            }
            if (action.Action == "accept")
            {
                if (!_pairings.TryGetValue(action.PairingId ?? "", out var pair) || (pair.One != id && pair.Two != id) || pair.ExpiresUtc <= now)
                    throw new HubException("PAIRING_EXPIRED");
                pair.Accepted.Add(id);
                if (pair.Accepted.Count < 2) return;
                _pairings.Remove(pair.Id);
                var room = rooms.Create();
                var first = Random.Shared.Next(2) == 0 ? pair.One : pair.Two;
                room.AssignAccount(PlayerId.One, first);
                room.ReserveOpponent(first == pair.One ? pair.Two : pair.One);
                room.Mode = MatchMode.Ranked;
                room.PlacementDeadlineUtc = now.AddSeconds(120);
                try { Track(room); }
                catch { rooms.TryRemove(room.Code, out _); throw; }
                return;
            }
            throw new HubException("INVALID_ACTION");
        }
    }

    private void CancelPair(Pairing pair, string? decliningId, DateTime now)
    {
        _pairings.Remove(pair.Id);
        foreach (var id in new[] { pair.One, pair.Two })
        {
            if (id == decliningId || decliningId is null && !pair.Accepted.Contains(id)) { _cooldowns[id] = now.AddSeconds(15); continue; }
            if (!_connections.ContainsKey(id)) continue;
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDb>();
            var user = db.Users.Find(id);
            if (user is not null) _queue[id] = new(id, user.Rating, now);
        }
    }

    private static bool Blocked(AppDb db, string one, string two) => db.Blocks.Any(block =>
        block.AccountId == one && block.BlockedId == two || block.AccountId == two && block.BlockedId == one);

    public IReadOnlyList<PlatformNotice> Tick()
    {
        var notices = RevokeExpiredConnections().ToList();
        lock (Gate)
        {
            var now = clock.GetUtcNow().UtcDateTime;
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDb>();
            foreach (var pair in _pairings.Values.Where(pair => pair.ExpiresUtc <= now).ToArray()) CancelPair(pair, null, now);
            foreach (var id in _queue.Keys.Where(id => !_connections.ContainsKey(id)).ToArray()) _queue.Remove(id);
            var entries = _queue.Values.OrderBy(entry => entry.EnteredUtc).ToArray();
            foreach (var entry in entries)
            {
                if (!_queue.ContainsKey(entry.AccountId)) continue;
                var wait = (now - entry.EnteredUtc).TotalSeconds;
                var range = wait >= 60 ? 400 : wait >= 30 ? 200 : 100;
                var peer = entries.Where(other => other.AccountId != entry.AccountId && _queue.ContainsKey(other.AccountId) &&
                    Math.Abs(other.Rating - entry.Rating) <= range).OrderBy(other => Math.Abs(other.Rating - entry.Rating)).FirstOrDefault(other =>
                    !Blocked(db, entry.AccountId, other.AccountId) && db.Matches.Count(match => match.Mode == MatchMode.Ranked && match.State == MatchState.Finished &&
                    match.FinishedUtc > now.AddHours(-24) && (match.OneId == entry.AccountId && match.TwoId == other.AccountId || match.OneId == other.AccountId && match.TwoId == entry.AccountId)) < 3);
                if (peer is null) continue;
                _queue.Remove(entry.AccountId); _queue.Remove(peer.AccountId);
                var pair = new Pairing(entry.AccountId, peer.AccountId, now.AddSeconds(15));
                _pairings[pair.Id] = pair;
            }
            foreach (var room in rooms.Rooms)
            {
                MatchRecord? snapshot = null;
                lock (room.SyncRoot)
                {
                    var expiredReservation = room.ReservationDeadlineUtc <= now;
                    if (room.Game.Phase != GamePhase.Finished && (expiredReservation || room.Mode == MatchMode.Ranked && room.Game.Phase == GamePhase.Placing && room.PlacementDeadlineUtc <= now))
                    {
                        if (!rooms.TryRemove(room.Code, out _)) continue;
                        snapshot = room.Snapshot(); snapshot.State = MatchState.Cancelled; snapshot.Reason = "PlacementTimeout"; snapshot.FinishedUtc = now;
                        foreach (var player in Enum.GetValues<PlayerId>())
                            if (room.ConnectionIdFor(player) is { } connection) notices.Add(new(connection, "RoomClosed", new { room.Code, message = "Hết thời gian vào phòng hoặc xếp tàu. Trận không tính điểm." }));
                    }
                    else if (room.Mode == MatchMode.Ranked && room.Game.Phase == GamePhase.Playing)
                    {
                        PlayerId? loser = room.TurnDeadlineUtc <= now ? room.Game.CurrentPlayer : null;
                        loser ??= Enum.GetValues<PlayerId>().Cast<PlayerId?>().FirstOrDefault(player => room.DisconnectedAt(player!.Value) is { } offline && offline.AddSeconds(90) <= now);
                        if (loser is not null && room.Game.Forfeit(loser.Value))
                        {
                            room.FinishReason = "Timeout"; room.FinishedUtc = now;
                            snapshot = room.Snapshot();
                            foreach (var player in Enum.GetValues<PlayerId>())
                                if (room.ConnectionIdFor(player) is { } connection) notices.Add(new(connection, "GameOver", new GameOverMessage(room.Game.Winner!.Value, room.Game.GetOpponentFleet(player), room.FinishReason)));
                        }
                    }
                }
                if (snapshot is null)
                    lock (room.SyncRoot)
                        if (room.Game.Phase == GamePhase.Finished && !room.ResultRecorded)
                        {
                            snapshot = room.Snapshot();
                            foreach (var player in Enum.GetValues<PlayerId>())
                                if (room.ConnectionIdFor(player) is { } connection) notices.Add(new(connection, "GameOver", new GameOverMessage(room.Game.Winner!.Value, room.Game.GetOpponentFleet(player), room.FinishReason)));
                        }
                if (snapshot is not null)
                {
                    Record(snapshot);
                    lock (room.SyncRoot) if (room.MatchId == snapshot.Id) room.ResultRecorded = true;
                }
            }
            return notices;
        }
    }
}

public sealed class PlatformWorker(PlayerPlatform platform, IHubContext<GameHub> hub, ILogger<PlatformWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1));
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
                try
                {
                    var notices = platform.Tick();
                    await Task.WhenAll(notices.Select(notice => hub.Clients.Client(notice.Connection).SendAsync(notice.Method, notice.Payload, stoppingToken)));
                }
                catch (Exception error) when (!stoppingToken.IsCancellationRequested) { logger.LogError(error, "Platform timer failed"); }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
    }
}

public static class CommunityApi
{
    public static void MapCommunity(this WebApplication app)
    {
        var api = AccountApi.SecureGroup(app);
        api.AddEndpointFilter(async (invocation, next) =>
        {
            var context = invocation.HttpContext;
            var db = context.RequestServices.GetRequiredService<AppDb>();
            var user = await AccountApi.CurrentUser(context, db);
            if (user is null) return Results.Unauthorized();
            context.Items["account-id"] = user.Id;
            try { return await next(invocation); }
            catch (HubException error) { return AccountApi.Error(error.Message, error.Message); }
        });
        api.MapGet("/community", (HttpContext context, PlayerPlatform platform) => Results.Ok(platform.Community((string)context.Items["account-id"]!)));
        api.MapPost("/community/friends", (FriendAction action, HttpContext context, PlayerPlatform platform) => { platform.Friend((string)context.Items["account-id"]!, action); return Results.Ok(); }).RequireRateLimiting("social-writes");
        api.MapPost("/community/invites", (InviteAction action, HttpContext context, PlayerPlatform platform) => { platform.Invite((string)context.Items["account-id"]!, action); return Results.Ok(); }).RequireRateLimiting("social-writes");
        api.MapPost("/community/queue", (QueueAction action, HttpContext context, PlayerPlatform platform) => { platform.Queue((string)context.Items["account-id"]!, action); return Results.Ok(); }).RequireRateLimiting("social-writes");
        api.MapGet("/leaderboard", async (AppDb db, int page = 0) =>
        {
            page = Math.Clamp(page, 0, 10000);
            var users = await db.Users.AsNoTracking().Where(user => user.RankedGames >= 10).OrderByDescending(user => user.Rating).ThenBy(user => user.Id).Skip(page * 20).Take(21).ToArrayAsync();
            return Results.Ok(new { users = users.Take(20).Select(AccountApi.View), page, hasMore = users.Length > 20 });
        });
    }
}
