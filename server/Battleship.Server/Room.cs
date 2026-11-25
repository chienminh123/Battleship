using Battleship.Core;

namespace Battleship.Server;

public sealed class Room
{
    private readonly Dictionary<PlayerId, PlayerSession> _players = [];
    private readonly Dictionary<PlayerId, IReadOnlyList<FleetPlacement>> _fleets = [];
    private readonly HashSet<PlayerId> _rematchVotes = [];

    public Room(string code, string ownerToken)
    {
        Code = code;
        Game = new Game();
        _players[PlayerId.One] = new PlayerSession(ownerToken);
    }

    public string Code { get; }
    public Game Game { get; private set; }
    public object SyncRoot { get; } = new();
    public DateTime LastActivityUtc { get; private set; } = DateTime.UtcNow;

    public string? GetPlayerToken(PlayerId player) => _players.GetValueOrDefault(player)?.Token;

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

        foreach (var pair in _players)
        {
            if (!string.IsNullOrWhiteSpace(token) && pair.Value.Token == token)
            {
                pair.Value.ConnectionId = connectionId;
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
                Touch();
                return pair.Key;
            }
        }

        return null;
    }

    public string? ConnectionIdFor(PlayerId player) => _players.GetValueOrDefault(player)?.ConnectionId;

    public void RecordFleet(PlayerId player, IReadOnlyList<FleetPlacement> placements) => _fleets[player] = placements.ToArray();

    public bool RequestRematch(PlayerId player)
    {
        if (Game.Phase != GamePhase.Finished) return false;
        _rematchVotes.Add(player);
        if (_rematchVotes.Count < 2) return false;

        Game = new Game();
        Game.JoinOpponent();
        Game.SubmitFleet(PlayerId.One, _fleets[PlayerId.One]);
        Game.SubmitFleet(PlayerId.Two, _fleets[PlayerId.Two]);
        _rematchVotes.Clear();
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
    }
}
