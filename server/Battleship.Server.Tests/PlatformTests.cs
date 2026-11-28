using System.Security.Claims;
using System.Text.Json;
using Battleship.Core;
using Battleship.Server.Data;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Battleship.Server.Tests;

public sealed class PlatformTests
{
    private sealed class Clock : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = DateTimeOffset.UtcNow;
        public override DateTimeOffset GetUtcNow() => Now;
    }
    private sealed class Fixture : IDisposable
    {
        private readonly ServiceProvider _provider;
        private readonly string _path;
        public Clock Clock { get; } = new();
        public IRoomStore Rooms { get; }
        public PlayerPlatform Platform { get; }
        public Fixture()
        {
            var directory = Path.GetFullPath(Path.Combine("artifacts", "platform-tests"));
            Directory.CreateDirectory(directory);
            _path = Path.Combine(directory, Guid.NewGuid().ToString("N") + ".db");
            _provider = new ServiceCollection().AddLogging().AddDbContext<AppDb>(options => options.UseSqlite($"Data Source={_path};Pooling=False"))
                .AddSingleton<IRoomStore, InMemoryRoomStore>().AddSingleton<TimeProvider>(Clock).AddSingleton<PlayerPlatform>().BuildServiceProvider();
            using (var scope = _provider.CreateScope()) scope.ServiceProvider.GetRequiredService<AppDb>().Database.Migrate();
            Rooms = _provider.GetRequiredService<IRoomStore>();
            Platform = _provider.GetRequiredService<PlayerPlatform>();
        }
        public T Db<T>(Func<AppDb, T> read)
        {
            using var scope = _provider.CreateScope();
            return read(scope.ServiceProvider.GetRequiredService<AppDb>());
        }
        public (Account User, ClaimsPrincipal Principal) User(string name)
        {
            var user = new Account { Id = Guid.NewGuid().ToString("N"), UserName = name, NormalizedUserName = name.ToUpperInvariant(),
                DisplayName = name, PlayerCode = Guid.NewGuid().ToString("N")[..12].ToUpperInvariant(), SecurityStamp = Guid.NewGuid().ToString("N") };
            var session = new AccountSession { AccountId = user.Id, SecurityStamp = user.SecurityStamp, ExpiresUtc = Clock.Now.UtcDateTime.AddDays(1) };
            Db(db => { db.Users.Add(user); db.Sessions.Add(session); db.SaveChanges(); return 0; });
            var principal = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim(ClaimTypes.NameIdentifier, user.Id), new Claim(AccountApi.SessionClaim, session.Id) }, "Test"));
            Platform.Connected(principal, name);
            return (user, principal);
        }
        public JsonElement Community(string id) => JsonSerializer.SerializeToElement(Platform.Community(id), new JsonSerializerOptions(JsonSerializerDefaults.Web));
        public void Dispose() { _provider.Dispose(); File.Delete(_path); }
    }

    [Fact]
    public void History_resolves_opponent_from_either_seat_and_keeps_bot_and_guest_matches()
    {
        using var fixture = new Fixture();
        var (one, _) = fixture.User("Minh"); var (two, _) = fixture.User("Lan");
        fixture.Db(db => {
            db.Matches.AddRange(
                new MatchRecord { Id = "one", RoomCode = "ABC234", OneId = one.Id, TwoId = two.Id, Mode = MatchMode.Friendly },
                new MatchRecord { Id = "two", RoomCode = "DEF234", OneId = two.Id, TwoId = one.Id, Mode = MatchMode.Ranked },
                new MatchRecord { Id = "guest", RoomCode = "GHI234", OneId = one.Id, Mode = MatchMode.Friendly },
                new MatchRecord { Id = "bot", RoomCode = "JKL234", OneId = one.Id, Mode = MatchMode.Bot },
                new MatchRecord { Id = "private", RoomCode = "MNO234", OneId = two.Id, Mode = MatchMode.Bot });
            db.SaveChanges(); return 0;
        });
        var history = fixture.Db(db => MatchHistoryQuery.ForPlayer(db, one.Id, 0).ToArray());
        Assert.Equal(4, history.Length);
        Assert.Equal("Lan", history.Single(match => match.Id == "one").OpponentName);
        Assert.Equal("Lan", history.Single(match => match.Id == "two").OpponentName);
        Assert.Equal("Máy", history.Single(match => match.Id == "bot").OpponentName);
        Assert.Equal("Người chơi khách", history.Single(match => match.Id == "guest").OpponentName);
        Assert.Empty(fixture.Db(db => MatchHistoryQuery.ForPlayer(db, one.Id, 1).ToArray()));
    }

    [Theory]
    [InlineData(1000, 1000, true, 16)]
    [InlineData(1000, 1000, false, -16)]
    public void Elo_has_the_expected_symmetric_change(int one, int two, bool won, int expected)
    {
        Assert.Equal(expected, RatingMath.Delta(one, two, won));
        Assert.Equal(0, RatingMath.Delta(one, two, won) + RatingMath.Delta(two, one, !won));
        Assert.True(RatingMath.Delta(800, 1400, true) > RatingMath.Delta(1400, 800, true));
    }

    [Fact]
    public void Friend_requests_cross_once_and_blocking_revokes_the_relationship()
    {
        using var fixture = new Fixture();
        var (one, _) = fixture.User("one"); var (two, _) = fixture.User("two");
        Parallel.Invoke(() => fixture.Platform.Friend(one.Id, new(two.PlayerCode, "request")),
            () => fixture.Platform.Friend(two.Id, new(one.PlayerCode, "request")));
        Assert.True(fixture.Db(db => db.Friends.Single().Accepted));
        fixture.Platform.Friend(one.Id, new(two.PlayerCode, "block"));
        Assert.Equal(0, fixture.Db(db => db.Friends.Count()));
        Assert.Equal("PLAYER_BLOCKED", Assert.Throws<HubException>(() => fixture.Platform.Friend(two.Id, new(one.PlayerCode, "request"))).Message);
    }

    [Fact]
    public void Invitation_acceptance_is_idempotent_reserves_both_seats_and_rejects_outsiders()
    {
        using var fixture = new Fixture();
        var (one, _) = fixture.User("one"); var (two, _) = fixture.User("two"); var (other, _) = fixture.User("other");
        fixture.Platform.Friend(one.Id, new(two.PlayerCode, "request"));
        fixture.Platform.Friend(two.Id, new(one.PlayerCode, "accept"));
        fixture.Platform.Invite(one.Id, new(two.PlayerCode, "send"));
        var invitation = fixture.Db(db => db.Invites.Single().Id);
        Assert.Throws<HubException>(() => fixture.Platform.Invite(other.Id, new(invitation, "accept")));
        Parallel.Invoke(() => fixture.Platform.Invite(two.Id, new(invitation, "accept")), () => fixture.Platform.Invite(two.Id, new(invitation, "accept")));
        var room = Assert.Single(fixture.Rooms.Rooms);
        Assert.Equal(one.Id, room.AccountIdFor(PlayerId.One)); Assert.Equal(two.Id, room.AccountIdFor(PlayerId.Two));
        Assert.False(room.TryJoin(null, "intruder", out _, out _, out _));
        Assert.Equal(room.Code, fixture.Community(one.Id).GetProperty("activeRoom").GetProperty("code").GetString());
    }

    [Fact]
    public void Expired_invitation_creates_no_room()
    {
        using var fixture = new Fixture();
        var (one, _) = fixture.User("one"); var (two, _) = fixture.User("two");
        fixture.Platform.Friend(one.Id, new(two.PlayerCode, "request")); fixture.Platform.Friend(two.Id, new(one.PlayerCode, "accept"));
        fixture.Platform.Invite(one.Id, new(two.PlayerCode, "send"));
        var id = fixture.Db(db => db.Invites.Single().Id);
        fixture.Clock.Now += TimeSpan.FromSeconds(31);
        Assert.Equal("INVITE_EXPIRED", Assert.Throws<HubException>(() => fixture.Platform.Invite(two.Id, new(id, "accept"))).Message);
        Assert.Empty(fixture.Rooms.Rooms);
    }

    [Fact]
    public void Ranked_result_and_both_ratings_commit_only_once()
    {
        using var fixture = new Fixture();
        var (one, _) = fixture.User("one"); var (two, _) = fixture.User("two");
        MatchRecord Snapshot() => new() { Id = "rated-match", RoomCode = "ABC234", OneId = one.Id, TwoId = two.Id,
            Mode = MatchMode.Ranked, State = MatchState.Finished, Winner = PlayerId.One, CreatedUtc = fixture.Clock.Now.UtcDateTime, FinishedUtc = fixture.Clock.Now.UtcDateTime };
        Parallel.Invoke(() => fixture.Platform.Record(Snapshot()), () => fixture.Platform.Record(Snapshot()));
        fixture.Platform.Record(Snapshot());
        Assert.Equal(1, fixture.Db(db => db.Matches.Count())); Assert.Equal(2, fixture.Db(db => db.RatingChanges.Count()));
        Assert.Equal(1016, fixture.Db(db => db.Users.Single(user => user.Id == one.Id).Rating));
        Assert.Equal(984, fixture.Db(db => db.Users.Single(user => user.Id == two.Id).Rating));
        Assert.Equal(2, fixture.Db(db => db.Users.Sum(user => user.RankedGames)));
    }

    [Theory]
    [InlineData(MatchMode.Friendly, MatchState.Finished)]
    [InlineData(MatchMode.Bot, MatchState.Finished)]
    [InlineData(MatchMode.Ranked, MatchState.Cancelled)]
    [InlineData(MatchMode.Ranked, MatchState.Interrupted)]
    public void Other_modes_and_unfinished_results_do_not_change_Elo(MatchMode mode, MatchState state)
    {
        using var fixture = new Fixture();
        var (one, _) = fixture.User("one"); var (two, _) = fixture.User("two");
        fixture.Platform.Record(new() { Id = "non-rated", RoomCode = "ABC234", OneId = one.Id, TwoId = two.Id, Mode = mode, State = state,
            Winner = PlayerId.One, CreatedUtc = fixture.Clock.Now.UtcDateTime });
        Assert.Equal(0, fixture.Db(db => db.RatingChanges.Count()));
        Assert.Equal(0, fixture.Db(db => db.Users.Sum(user => user.RankedGames)));
    }

    [Fact]
    public void Pairing_confirmation_places_one_ranked_room_and_expired_turn_forfeits_once()
    {
        using var fixture = new Fixture();
        var (one, _) = fixture.User("one"); var (two, _) = fixture.User("two");
        fixture.Platform.Queue(one.Id, new("join")); fixture.Platform.Queue(one.Id, new("join")); fixture.Platform.Queue(two.Id, new("join"));
        fixture.Platform.Tick();
        var pairing = fixture.Community(one.Id).GetProperty("pairing").GetProperty("id").GetString()!;
        fixture.Platform.Queue(one.Id, new("accept", pairing)); fixture.Platform.Queue(two.Id, new("accept", pairing));
        var room = Assert.Single(fixture.Rooms.Rooms);
        Assert.Equal(MatchMode.Ranked, room.Mode);
        var fleet = ShipRules.Fleet.Select((ship, y) => new FleetPlacement(ship.Key, new Coordinate(0, y), Orientation.Horizontal)).ToArray();
        room.Game.SubmitFleet(PlayerId.One, fleet); room.Game.SubmitFleet(PlayerId.Two, fleet); room.NoteTurn();
        Assert.True(room.TryJoin(room.GetPlayerToken(PlayerId.One), "ranked-one", out _, out _, out _));
        Assert.True(room.TryJoin(room.GetPlayerToken(PlayerId.Two), "ranked-two", out _, out _, out _));
        room.TurnDeadlineUtc = fixture.Clock.Now.UtcDateTime.AddSeconds(-1);
        var notices = fixture.Platform.Tick(); fixture.Platform.Tick();
        Assert.Equal(2, notices.Count(notice => notice.Method == "GameOver"));
        Assert.All(notices.Where(notice => notice.Method == "GameOver"), notice =>
            Assert.Equal("Timeout", Assert.IsType<GameOverMessage>(notice.Payload).Reason));
        Assert.Equal(GamePhase.Finished, room.Game.Phase); Assert.Equal(PlayerId.Two, room.Game.Winner);
        Assert.Equal(2, fixture.Db(db => db.RatingChanges.Count()));
        Assert.Equal(2, fixture.Db(db => db.Users.Sum(user => user.RankedGames)));
        Assert.False(room.RequestRematch(PlayerId.One)); Assert.True(room.RequestRematch(PlayerId.Two));
        Assert.Equal(MatchMode.Friendly, room.Mode);
    }

    [Fact]
    public void Expired_placement_is_cancelled_without_rating()
    {
        using var fixture = new Fixture();
        var (one, _) = fixture.User("one"); var (two, _) = fixture.User("two");
        fixture.Platform.Queue(one.Id, new("join")); fixture.Platform.Queue(two.Id, new("join")); fixture.Platform.Tick();
        var pairing = fixture.Community(one.Id).GetProperty("pairing").GetProperty("id").GetString()!;
        fixture.Platform.Queue(one.Id, new("accept", pairing)); fixture.Platform.Queue(two.Id, new("accept", pairing));
        fixture.Clock.Now += TimeSpan.FromSeconds(121); fixture.Platform.Tick();
        Assert.Empty(fixture.Rooms.Rooms);
        Assert.Equal(MatchState.Cancelled, fixture.Db(db => db.Matches.Single().State));
        Assert.Equal(0, fixture.Db(db => db.RatingChanges.Count()));
    }

    [Fact]
    public async Task Tokens_for_account_seats_require_the_same_authenticated_account()
    {
        using var fixture = new Fixture();
        var (one, principal) = fixture.User("one"); var (_, intruderPrincipal) = fixture.User("other");
        var owner = HubTestSupport.Hub(fixture.Rooms, "owner", fixture.Platform, principal);
        await owner.OnConnectedAsync();
        var room = await owner.CreateRoom();
        var intruder = HubTestSupport.Hub(fixture.Rooms, "other", fixture.Platform, intruderPrincipal);
        Assert.Equal("ACCOUNT_REQUIRED", (await Assert.ThrowsAsync<HubException>(() => intruder.Reconnect(room.Code, room.PlayerToken))).Message);
        Assert.Equal(one.Id, fixture.Db(db => db.Matches.Single().OneId));
        fixture.Db(db => { db.Sessions.RemoveRange(db.Sessions.Where(session => session.AccountId == one.Id)); return db.SaveChanges(); });
        Assert.Null(fixture.Platform.CurrentId(principal));
        Assert.Equal("ACCOUNT_REQUIRED", (await Assert.ThrowsAsync<HubException>(() => owner.GetChatHistory())).Message);
        fixture.Platform.RevokeExpiredConnections();
        Assert.True(fixture.Rooms.TryGet(room.Code, out var stored));
        Assert.Null(stored.ConnectionIdFor(PlayerId.One));
    }

    [Fact]
    public void Timestamp_kind_survives_SQLite_roundtrip()
    {
        using var fixture = new Fixture();
        var (one, _) = fixture.User("one");
        var expires = fixture.Db(db => db.Sessions.AsNoTracking().Single(session => session.AccountId == one.Id).ExpiresUtc);
        Assert.Equal(DateTimeKind.Utc, expires.Kind);
    }
}
