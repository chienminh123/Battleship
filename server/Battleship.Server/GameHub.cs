using Battleship.Core;
using Battleship.Server.Data;
using Microsoft.AspNetCore.SignalR;

namespace Battleship.Server;

public sealed class GameHub(IRoomStore rooms, ILogger<GameHub> logger, PlayerPlatform? platform = null) : Hub
{
    private const string RoomKey = "battleship-room";
    private const string PlayerKey = "battleship-player";

    public Task<CreateRoomResponse> CreateRoom()
    {
        lock (platform?.Gate ?? rooms)
        {
        EnsureRoomBinding();
        var accountId = platform?.CurrentId(Context.User);
        platform?.CheckAvailable(accountId);
        var room = rooms.Create();
        room.AssignAccount(PlayerId.One, accountId);
        var playerToken = room.GetPlayerToken(PlayerId.One)!;
        room.BindConnection(PlayerId.One, Context.ConnectionId);
        Context.Items[RoomKey] = room.Code;
        Context.Items[PlayerKey] = PlayerId.One;
        logger.LogInformation("Room {RoomCode} created", room.Code);
        platform?.Track(room);
        return Task.FromResult(new CreateRoomResponse(room.Code, playerToken, PlayerId.One));
        }
    }

    public async Task<JoinRoomResponse> JoinRoom(string code, string? playerToken = null)
    {
        Room room;
        bool sameBinding;
        PlayerId player;
        string token;
        bool reconnect;
        string? opponentConnection;
        lock (platform?.Gate ?? rooms)
        {
            sameBinding = EnsureRoomBinding(code, playerToken);
            if (!rooms.TryGet(code, out room!)) throw new HubException("ROOM_NOT_FOUND");
            var accountId = platform?.CurrentId(Context.User);
            platform?.CheckJoin(room, playerToken, accountId);
            lock (room.SyncRoot)
            {
            if (room.TryResolveConnection(Context.ConnectionId, out var occupied) && room.GetPlayerToken(occupied) != playerToken)
                throw new HubException("ALREADY_IN_ROOM");
            if (!room.TryJoin(playerToken, Context.ConnectionId, out player, out token, out reconnect))
                throw new HubException(string.IsNullOrWhiteSpace(playerToken) ? "ROOM_FULL" : "INVALID_PLAYER_TOKEN");
            if (!reconnect) room.AssignAccount(player, accountId);

            Context.Items[RoomKey] = room.Code;
            Context.Items[PlayerKey] = player;
            opponentConnection = room.ConnectionIdFor(player == PlayerId.One ? PlayerId.Two : PlayerId.One);
            }
            platform?.Track(room);
        }

        if (opponentConnection is not null && !sameBinding)
        {
            if (reconnect)
                await Clients.Client(opponentConnection).SendAsync("OpponentReconnected", new OpponentReconnectedMessage(player));
            else
                await Clients.Client(opponentConnection).SendAsync("OpponentJoined", new OpponentJoinedMessage(player));
        }

        return BuildJoinResponse(room, player, token);
    }

    // Keep the original zero-argument endpoint working for existing clients.
    public Task<JoinRoomResponse> CreateBotRoom() => CreateBotRoomWithDifficulty(BotDifficulty.Easy);

    public async Task<JoinRoomResponse> CreateBotRoomWithDifficulty(BotDifficulty difficulty)
    {
        if (!Enum.IsDefined(difficulty)) throw new HubException("INVALID_BOT_DIFFICULTY");
        var created = await CreateRoom();
        var (room, player) = ResolveSession();
        lock (room.SyncRoot) room.AddBot(difficulty);
        platform?.Track(room);
        return BuildJoinResponse(room, player, created.PlayerToken);
    }

    public async Task<SubmitFleetResponse> SubmitFleet(IReadOnlyCollection<FleetPlacementDto?>? placements)
    {
        var (room, player) = ResolveSession();
        FleetSubmissionResult result;
        string? opponentConnection;
        lock (room.SyncRoot)
        {
            room.Touch();
            if (room.Mode == MatchMode.Ranked && room.Game.Phase == GamePhase.Placing && room.PlacementDeadlineUtc <= DateTime.UtcNow)
                throw new HubException("PLACEMENT_EXPIRED");
            if (placements is null || placements.Count != ShipRules.Fleet.Count || placements.Any(item => item is null))
                return new SubmitFleetResponse(false, room.Game.Phase, "InvalidFleetCount");

            var corePlacements = placements.Select(item => new FleetPlacement(item!.Type, item.Start, item.Orientation)).ToArray();
            result = room.Game.SubmitFleet(player, corePlacements);
            if (result.Accepted) room.NoteTurn();
            opponentConnection = room.ConnectionIdFor(player == PlayerId.One ? PlayerId.Two : PlayerId.One);
        }

        if (!result.Accepted)
        {
            return new SubmitFleetResponse(false, result.Phase, result.Error?.ToString(), result.FleetErrors);
        }
        platform?.Track(room);

        if (result.Phase == GamePhase.Placing && opponentConnection is not null)
            await Clients.Client(opponentConnection).SendAsync("OpponentReady", new OpponentJoinedMessage(player));

        if (result.Phase == GamePhase.Playing)
        {
            PlayerId? currentPlayer;
            string? currentConnection;
            string? otherConnection;
            lock (room.SyncRoot)
            {
                currentPlayer = room.Game.CurrentPlayer;
                currentConnection = currentPlayer is null ? null : room.ConnectionIdFor(currentPlayer.Value);
                otherConnection = currentPlayer is null ? null : room.ConnectionIdFor(currentPlayer.Value == PlayerId.One ? PlayerId.Two : PlayerId.One);
            }
            if (currentConnection is not null)
                await Clients.Client(currentConnection).SendAsync("GameStarted", new GameStartedMessage(true, room.TurnDeadlineUtc));
            if (otherConnection is not null)
                await Clients.Client(otherConnection).SendAsync("GameStarted", new GameStartedMessage(false, room.TurnDeadlineUtc));
        }

        lock (room.SyncRoot)
            return new SubmitFleetResponse(true, result.Phase, OwnBoard: room.Game.GetOwnBoard(player));
    }

    public async Task<FireResponse> Fire(int x, int y)
    {
        var (room, player) = ResolveSession();
        GameShotResult result;
        Game game;
        MatchRecord snapshot;
        string? opponentConnection;
        lock (room.SyncRoot)
        {
            room.Touch();
            game = room.Game;
            if (room.Mode == MatchMode.Ranked && game.Phase == GamePhase.Playing && room.TurnDeadlineUtc <= DateTime.UtcNow)
                throw new HubException("TURN_EXPIRED");
            result = game.Fire(player, new Coordinate(x, y));
            if (result.Accepted) room.NoteTurn();
            snapshot = room.Snapshot();
            opponentConnection = room.ConnectionIdFor(player == PlayerId.One ? PlayerId.Two : PlayerId.One);
        }

        if (!result.Accepted)
            return ToFireResponse(result);

        platform?.Record(snapshot);
        if (snapshot.State == MatchState.Finished) lock (room.SyncRoot) if (room.MatchId == snapshot.Id) room.ResultRecorded = true;

        await Clients.Caller.SendAsync("ShotResult", new ShotResultMessage(result.Status, result.Coordinate, result.SunkShip, result.Winner, result.SunkCells, room.TurnDeadlineUtc));
        if (opponentConnection is not null)
        {
            await Clients.Client(opponentConnection).SendAsync("IncomingShot",
                new IncomingShotMessage(result.Coordinate,
                    result.Status == GameShotStatus.Won ? GameShotStatus.Sunk : result.Status,
                    result.SunkShip, room.TurnDeadlineUtc));
        }

        if (result.Status == GameShotStatus.Won)
        {
            IReadOnlyList<ShipView> callerOpponentFleet;
            IReadOnlyList<ShipView> otherOpponentFleet;
            lock (room.SyncRoot)
            {
                callerOpponentFleet = room.Game.GetOpponentFleet(player);
                otherOpponentFleet = room.Game.GetOpponentFleet(player == PlayerId.One ? PlayerId.Two : PlayerId.One);
            }
            await Clients.Caller.SendAsync("GameOver", new GameOverMessage(player, callerOpponentFleet));
            if (opponentConnection is not null)
            {
                await Clients.Client(opponentConnection).SendAsync("GameOver", new GameOverMessage(player, otherOpponentFleet));
            }
        }

        if (room.HasBot && result.Status != GameShotStatus.Won)
        {
            // Give the player time to see their own fleet before the return shot.
            // Do not hold the room lock while waiting; reconnects remain possible.
            await Task.Delay(1600);
            GameShotResult botShot;
            string? humanConnection;
            IReadOnlyList<ShipView>? revealedFleet = null;
            lock (room.SyncRoot)
            {
                if (!ReferenceEquals(room.Game, game) || room.Game.Phase != GamePhase.Playing || room.Game.CurrentPlayer != PlayerId.Two)
                    return ToFireResponse(result);
                botShot = room.Game.Fire(PlayerId.Two, BotOpponent.ChooseTarget(
                    room.Game.GetShotHistory(PlayerId.Two), room.BotDifficulty ?? BotDifficulty.Easy));
                room.NoteTurn();
                room.Touch();
                humanConnection = room.ConnectionIdFor(PlayerId.One);
                if (botShot.Status == GameShotStatus.Won)
                    revealedFleet = room.Game.GetOpponentFleet(PlayerId.One);
            }
            platform?.Track(room);
            if (humanConnection is not null)
            {
                await Clients.Client(humanConnection).SendAsync("IncomingShot", new IncomingShotMessage(
                    botShot.Coordinate, botShot.Status == GameShotStatus.Won ? GameShotStatus.Sunk : botShot.Status, botShot.SunkShip));
                if (revealedFleet is not null)
                    await Clients.Client(humanConnection).SendAsync("GameOver", new GameOverMessage(PlayerId.Two, revealedFleet));
            }
        }

        return ToFireResponse(result);
    }

    public Task<JoinRoomResponse> Reconnect(string code, string playerToken) => JoinRoom(code, playerToken);

    public override Task OnConnectedAsync()
    {
        platform?.Connected(Context.User, Context.ConnectionId);
        return base.OnConnectedAsync();
    }

    public async Task Surrender()
    {
        var (room, player) = ResolveSession();
        lock (room.SyncRoot)
        {
            if (room.Mode == MatchMode.Ranked && room.TurnDeadlineUtc <= DateTime.UtcNow) throw new HubException("TURN_EXPIRED");
            if (!room.Game.Forfeit(player)) throw new HubException("GAME_NOT_PLAYING");
            room.FinishReason = "Surrender";
            room.NoteTurn();
        }
        platform?.Track(room);
        foreach (var recipient in Enum.GetValues<PlayerId>())
        {
            string? connection;
            GameOverMessage result;
            lock (room.SyncRoot) { connection = room.ConnectionIdFor(recipient); result = new(room.Game.Winner!.Value, room.Game.GetOpponentFleet(recipient), room.FinishReason); }
            if (connection is not null) await Clients.Client(connection).SendAsync("GameOver", result);
        }
    }

    public async Task LeaveRoom()
    {
        var (room, player) = ResolveSession();
        string? opponent;
        bool closed;
        bool forfeited;
        MatchRecord snapshot;
        lock (room.SyncRoot)
        {
            opponent = room.ConnectionIdFor(player == PlayerId.One ? PlayerId.Two : PlayerId.One);
            closed = room.Game.Phase is GamePhase.WaitingForOpponent or GamePhase.Placing;
            forfeited = room.Game.Forfeit(player);
            if (forfeited) { room.FinishReason = "LeftMatch"; room.NoteTurn(); }
            snapshot = room.Snapshot();
            if (closed) { snapshot.State = MatchState.Cancelled; snapshot.Reason = "PlayerLeft"; rooms.TryRemove(room.Code, out _); }
            room.UnbindConnection(Context.ConnectionId);
        }
        platform?.Record(snapshot);
        Context.Items.Remove(RoomKey); Context.Items.Remove(PlayerKey);
        if (snapshot.State == MatchState.Finished) lock (room.SyncRoot) room.ResultRecorded = true;
        if (opponent is not null)
        {
            if (closed) await Clients.Client(opponent).SendAsync("RoomClosed", new { code = room.Code, message = "Đối thủ đã rời phòng. Trận chưa bắt đầu nên không tính kết quả." });
            else
            {
                if (forfeited) await Clients.Client(opponent).SendAsync("GameOver", new GameOverMessage(snapshot.Winner!.Value,
                    room.Game.GetOpponentFleet(player == PlayerId.One ? PlayerId.Two : PlayerId.One), "LeftMatch"));
                await Clients.Client(opponent).SendAsync("OpponentLeft", new OpponentLeftMessage(player));
            }
        }
    }

    public Task<IReadOnlyList<ChatMessage>> GetChatHistory()
    {
        var (room, player) = ResolveSession();
        lock (room.SyncRoot)
        {
            EnsureChatAccess(room, player);
            return Task.FromResult(room.Chat.History);
        }
    }

    public async Task<ChatMessage> SendChat(string clientMessageId, string content)
    {
        var (room, player) = ResolveSession();
        ChatMessage message;
        string[] recipients;
        lock (room.SyncRoot)
        {
            EnsureChatAccess(room, player);
            message = room.Chat.Send(player, clientMessageId, content, room.RoundNumber);
            room.Touch();
            recipients = Enum.GetValues<PlayerId>().Select(room.ConnectionIdFor).OfType<string>().Distinct().ToArray();
        }
        // Direct seat delivery avoids leaving a previous connection in a room group.
        await Task.WhenAll(recipients.Select(id => Clients.Client(id).SendAsync("ChatMessage", new { roomCode = room.Code, message })));
        return message;
    }

    private void EnsureChatAccess(Room room, PlayerId player)
    {
        if (!room.TryResolveConnection(Context.ConnectionId, out var current) || current != player)
            throw new HubException("NOT_IN_ROOM");
        if (room.HasBot) throw new HubException("CHAT_UNAVAILABLE");
    }

    public async Task Rematch()
    {
        var (room, player) = ResolveSession();
        string? opponentConnection;
        bool started;
        lock (room.SyncRoot)
        {
            if (room.Mode == MatchMode.Ranked && room.Game.Phase == GamePhase.Finished && !room.ResultRecorded) throw new HubException("RESULT_PENDING");
            opponentConnection = room.ConnectionIdFor(player == PlayerId.One ? PlayerId.Two : PlayerId.One);
            started = room.RequestRematch(player);
        }
        if (started) platform?.Track(room);
        if (opponentConnection is not null)
        {
            await Clients.Client(opponentConnection).SendAsync(started ? "RematchStarted" : "RematchRequested", new { player });
        }
        if (started)
        {
            await Clients.Caller.SendAsync("RematchStarted", new { player });
        }
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        platform?.Disconnected(Context.ConnectionId);
        if (Context.Items.TryGetValue(RoomKey, out var roomValue) && roomValue is string roomCode && rooms.TryGet(roomCode, out var room))
        {
            PlayerId? player;
            string? opponentConnection;
            lock (room.SyncRoot)
            {
                player = room.UnbindConnection(Context.ConnectionId);
                opponentConnection = player is null ? null : room.ConnectionIdFor(player == PlayerId.One ? PlayerId.Two : PlayerId.One);
            }

            if (player is not null && opponentConnection is not null)
                await Clients.Client(opponentConnection).SendAsync("OpponentLeft", new OpponentLeftMessage(player.Value));
        }

        await base.OnDisconnectedAsync(exception);
    }

    // A connection may restore its current seat, but must disconnect before
    // entering a different room. Failed joins never mutate either room.
    private bool EnsureRoomBinding(string? targetCode = null, string? token = null)
    {
        if (Context.Items.TryGetValue(RoomKey, out var value) && value is string code && rooms.TryGet(code, out var room))
        {
            lock (room.SyncRoot)
            {
                if (room.TryResolveConnection(Context.ConnectionId, out var player))
                {
                    if (string.Equals(room.Code, targetCode?.Trim(), StringComparison.OrdinalIgnoreCase) &&
                        !string.IsNullOrWhiteSpace(token) && token == room.GetPlayerToken(player)) return true;
                    throw new HubException("ALREADY_IN_ROOM");
                }
            }
        }
        return false;
    }

    private (Room Room, PlayerId Player) ResolveSession()
    {
        if (!Context.Items.TryGetValue(RoomKey, out var roomValue) || roomValue is not string roomCode ||
            !Context.Items.TryGetValue(PlayerKey, out var playerValue) || playerValue is not PlayerId player ||
            !rooms.TryGet(roomCode, out var room))
            throw new HubException("NOT_IN_ROOM");

        var accountId = platform?.CurrentId(Context.User);
        lock (room.SyncRoot)
        {
            if (!room.TryResolveConnection(Context.ConnectionId, out var resolvedPlayer) || resolvedPlayer != player)
                throw new HubException("NOT_IN_ROOM");
            if (room.AccountIdFor(player) is { } assigned && assigned != accountId) throw new HubException("ACCOUNT_REQUIRED");
        }
        return (room, player);
    }

    private static JoinRoomResponse BuildJoinResponse(Room room, PlayerId player, string token)
    {
        lock (room.SyncRoot)
        {
            var opponent = player == PlayerId.One ? PlayerId.Two : PlayerId.One;
            return new JoinRoomResponse(
                room.Code,
                token,
                player,
                room.Game.Phase,
                room.Game.CurrentPlayer,
                room.Game.CurrentPlayer == player,
                room.HasBot || room.ConnectionIdFor(opponent) is not null,
                room.Game.HasSubmittedFleet(player),
                room.Game.HasSubmittedFleet(opponent),
                room.Game.GetOwnBoard(player),
                room.Game.GetShotHistory(player),
                room.Game.GetIncomingShotHistory(player),
                room.Game.Phase == GamePhase.Finished
                    ? new GameOverMessage(room.Game.Winner!.Value, room.Game.GetOpponentFleet(player))
                    : null,
                room.HasBot,
                room.BotDifficulty,
                room.HasBot ? [] : room.Chat.History,
                room.MatchId, room.Mode, room.TurnDeadlineUtc, room.PlacementDeadlineUtc);
        }
    }

    private static FireResponse ToFireResponse(GameShotResult result) =>
        new(result.Accepted, result.Status, result.Coordinate, result.SunkShip, result.Winner, result.SunkCells);
}
