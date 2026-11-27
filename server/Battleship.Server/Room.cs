using Battleship.Core;
using Battleship.Server.Data;

namespace Battleship.Server;

public sealed class Room
{
    private readonly Dictionary<PlayerId, PlayerSession> _players = [];
    private readonly HashSet<PlayerId> _rematchVotes = [];

    public Room(string code, string ownerToken)
    {
        Code = code;
        Game = new Game();
        _players[PlayerId.One] = new PlayerSession(ownerToken);
    }

    public string Code { get; }
    public Game Game { get; private set; }
    public bool HasBot { get; private set; }
    public RoomChat Chat { get; } = new();
    public int RoundNumber { get; private set; } = 1;
    public string MatchId { get; private set; } = Guid.NewGuid().ToString("N");
    public MatchMode Mode { get; internal set; } = MatchMode.Friendly;
    public DateTime CreatedUtc { get; private set; } = DateTime.UtcNow;
    public DateTime? StartedUtc { get; private set; }
    public DateTime? FinishedUtc { get; set; }
    public string? FinishReason { get; set; }
    public bool ResultRecorded { get; set; }
    public DateTime? TurnDeadlineUtc { get; set; }
    public DateTime? PlacementDeadlineUtc { get; set; }
    public DateTime? ReservationDeadlineUtc { get; set; }
    private readonly Dictionary<PlayerId, DateTime> _disconnected = [];
    public DateTime? DisconnectedAt(PlayerId player) => _disconnected.TryGetValue(player, out var value) ? value : null;
    public BotDifficulty? BotDifficulty { get; private set; }
    public object SyncRoot { get; } = new();
    public DateTime LastActivityUtc { get; private set; } = DateTime.UtcNow;

    public string? GetPlayerToken(PlayerId player) => _players.GetValueOrDefault(player)?.Token;
    public string? AccountIdFor(PlayerId player) => _players.GetValueOrDefault(player)?.AccountId;
    public void AssignAccount(PlayerId player, string? accountId) => _players[player].AccountId = accountId;

    public void ReserveOpponent(string accountId)
    {
        if (HasTwoPlayers) throw new InvalidOperationException("Room is full.");
        _players[PlayerId.Two] = new PlayerSession(Guid.NewGuid().ToString("N")) { AccountId = accountId };
        Game.JoinOpponent();
    }

    public void NoteTurn()
    {
        if (Game.Phase == GamePhase.Playing)
        {
            StartedUtc ??= DateTime.UtcNow;
            if (Mode == MatchMode.Ranked) TurnDeadlineUtc = DateTime.UtcNow.AddSeconds(90);
        }
        else if (Game.Phase == GamePhase.Finished) { FinishedUtc ??= DateTime.UtcNow; FinishReason ??= "FleetSunk"; }
    }

    public MatchRecord Snapshot() => new()
    {
        Id = MatchId, RoomCode = Code, Mode = Mode, OneId = AccountIdFor(PlayerId.One), TwoId = AccountIdFor(PlayerId.Two),
        BotDifficulty = BotDifficulty, Winner = Game.Winner, Reason = FinishReason,
        CreatedUtc = CreatedUtc, StartedUtc = StartedUtc, FinishedUtc = FinishedUtc,
        State = Game.Phase == GamePhase.Finished ? MatchState.Finished : Game.Phase == GamePhase.Playing ? MatchState.Playing : MatchState.Waiting,
    };

    public bool TryResolveConnection(string connectionId, out PlayerId player)
    {
        foreach (var pair in _players)
        {
            if (pair.Value.ConnectionId == connectionId)
            {
                player = pair.Key;
                return true;
            }
        }

        player = default;
        return false;
    }

    public bool TryJoin(string? token, string connectionId, out PlayerId player, out string playerToken, out bool reconnect)
    {
        Touch();
        reconnect = false;

        if (TryResolveConnection(connectionId, out var boundPlayer) && token != GetPlayerToken(boundPlayer))
        {
            player = default;
            playerToken = string.Empty;
            return false;
        }

        foreach (var pair in _players)
        {
            if (!string.IsNullOrWhiteSpace(token) && pair.Value.Token == token)
            {
                pair.Value.ConnectionId = connectionId;
                _disconnected.Remove(pair.Key);
                if (HasTwoPlayers && HasAnyConnection && _players.Values.All(value => value.ConnectionId is not null)) ReservationDeadlineUtc = null;
                player = pair.Key;
                playerToken = pair.Value.Token;
                reconnect = true;
                return true;
            }
        }

        // A token that does not match a seat cannot claim a new seat. This keeps
        // reconnect tokens bound to their original player and prevents accidental
        // replacement of a disconnected player.
        if (!string.IsNullOrWhiteSpace(token))
        {
            player = default;
            playerToken = string.Empty;
            return false;
        }

        if (_players.ContainsKey(PlayerId.Two))
        {
            player = default;
            playerToken = string.Empty;
            return false;
        }

        player = PlayerId.Two;
        playerToken = string.IsNullOrWhiteSpace(token) ? Guid.NewGuid().ToString("N") : token;
        _players[player] = new PlayerSession(playerToken) { ConnectionId = connectionId };
        Game.JoinOpponent();
        return true;
    }

    public void BindConnection(PlayerId player, string connectionId)
    {
        if (_players.TryGetValue(player, out var session))
        {
            session.ConnectionId = connectionId;
            Touch();
        }
    }

    public PlayerId? UnbindConnection(string connectionId)
    {
        foreach (var pair in _players)
        {
            if (pair.Value.ConnectionId == connectionId)
            {
                pair.Value.ConnectionId = null;
                _disconnected.TryAdd(pair.Key, DateTime.UtcNow);
                Touch();
                return pair.Key;
            }
        }

        return null;
    }

    public string? ConnectionIdFor(PlayerId player) => _players.GetValueOrDefault(player)?.ConnectionId;

    public void AddBot(BotDifficulty difficulty = Battleship.Core.BotDifficulty.Easy)
    {
        if (!Enum.IsDefined(difficulty)) throw new ArgumentOutOfRangeException(nameof(difficulty));
        if (HasTwoPlayers) throw new InvalidOperationException("Room is full.");
        HasBot = true;
        Mode = MatchMode.Bot;
        BotDifficulty = difficulty;
        _players[PlayerId.Two] = new PlayerSession(Guid.NewGuid().ToString("N"));
        Game.JoinOpponent();
        var fleet = RandomOpponent.CreateFleet();
        Game.SubmitFleet(PlayerId.Two, fleet);
    }

    public bool RequestRematch(PlayerId player)
    {
        if (Game.Phase != GamePhase.Finished) return false;
        _rematchVotes.Add(player);
        if (HasBot) _rematchVotes.Add(PlayerId.Two);
        if (_rematchVotes.Count < 2) return false;

        Game = new Game();
        MatchId = Guid.NewGuid().ToString("N");
        CreatedUtc = DateTime.UtcNow;
        StartedUtc = FinishedUtc = TurnDeadlineUtc = PlacementDeadlineUtc = ReservationDeadlineUtc = null;
        FinishReason = null;
        ResultRecorded = false;
        if (Mode == MatchMode.Ranked) Mode = MatchMode.Friendly;
        Game.JoinOpponent();
        // Previously revealed human fleets must never be locked into a new game.
        if (HasBot) Game.SubmitFleet(PlayerId.Two, RandomOpponent.CreateFleet());
        _rematchVotes.Clear();
        RoundNumber++;
        if (!HasBot) Chat.StartRound(RoundNumber);
        Touch();
        return true;
    }

    public bool HasTwoPlayers => _players.ContainsKey(PlayerId.One) && _players.ContainsKey(PlayerId.Two);
    public bool HasAnyConnection => _players.Values.Any(session => session.ConnectionId is not null);

    public void Touch() => LastActivityUtc = DateTime.UtcNow;

    private sealed class PlayerSession(string token)
    {
        public string Token { get; } = token;
        public string? ConnectionId { get; set; }
        public string? AccountId { get; set; }
    }
}
