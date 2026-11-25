using Battleship.Core;
using Microsoft.AspNetCore.SignalR;

namespace Battleship.Server;

public sealed class GameHub(IRoomStore rooms, ILogger<GameHub> logger) : Hub
{
    private const string RoomKey = "battleship-room";
    private const string PlayerKey = "battleship-player";

    public Task<CreateRoomResponse> CreateRoom()
    {
        var room = rooms.Create();
        var playerToken = room.GetPlayerToken(PlayerId.One)!;
        room.BindConnection(PlayerId.One, Context.ConnectionId);
        Context.Items[RoomKey] = room.Code;
        Context.Items[PlayerKey] = PlayerId.One;
        logger.LogInformation("Room {RoomCode} created", room.Code);
        return Task.FromResult(new CreateRoomResponse(room.Code, playerToken, PlayerId.One));
    }

    public async Task<JoinRoomResponse> JoinRoom(string code, string? playerToken = null)
    {
        if (!rooms.TryGet(code, out var room)) throw new HubException("ROOM_NOT_FOUND");

        PlayerId player;
        string token;
        bool reconnect;
        string? opponentConnection;
        lock (room.SyncRoot)
        {
            if (!room.TryJoin(playerToken, Context.ConnectionId, out player, out token, out reconnect))
                throw new HubException("ROOM_FULL");

            Context.Items[RoomKey] = room.Code;
            Context.Items[PlayerKey] = player;
            opponentConnection = room.ConnectionIdFor(player == PlayerId.One ? PlayerId.Two : PlayerId.One);
        }

        if (opponentConnection is not null)
        {
            if (reconnect)
                await Clients.Client(opponentConnection).SendAsync("OpponentReconnected", new OpponentReconnectedMessage(player));
            else
                await Clients.Client(opponentConnection).SendAsync("OpponentJoined", new OpponentJoinedMessage(player));
        }

        return BuildJoinResponse(room, player, token);
    }

    public async Task<JoinRoomResponse> CreateBotRoom()
    {
        var created = await CreateRoom();
        var (room, player) = ResolveSession();
        lock (room.SyncRoot) room.AddBot();
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
            if (placements is null || placements.Count != ShipRules.Fleet.Count || placements.Any(item => item is null))
                return new SubmitFleetResponse(false, room.Game.Phase, "InvalidFleetCount");

            var corePlacements = placements.Select(item => new FleetPlacement(item!.Type, item.Start, item.Orientation)).ToArray();
            result = room.Game.SubmitFleet(player, corePlacements);
            if (result.Accepted) room.RecordFleet(player, corePlacements);
            opponentConnection = room.ConnectionIdFor(player == PlayerId.One ? PlayerId.Two : PlayerId.One);
        }

        if (!result.Accepted)
        {
            return new SubmitFleetResponse(false, result.Phase, result.Error?.ToString(), result.FleetErrors);
        }

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
                await Clients.Client(currentConnection).SendAsync("GameStarted", new GameStartedMessage(true));
            if (otherConnection is not null)
                await Clients.Client(otherConnection).SendAsync("GameStarted", new GameStartedMessage(false));
        }

        lock (room.SyncRoot)
            return new SubmitFleetResponse(true, result.Phase, OwnBoard: room.Game.GetOwnBoard(player));
    }

    public async Task<FireResponse> Fire(int x, int y)
    {
        var (room, player) = ResolveSession();
        GameShotResult result;
        string? opponentConnection;
        lock (room.SyncRoot)
        {
            room.Touch();
            result = room.Game.Fire(player, new Coordinate(x, y));
            opponentConnection = room.ConnectionIdFor(player == PlayerId.One ? PlayerId.Two : PlayerId.One);
        }

        if (!result.Accepted)
            return ToFireResponse(result);

        await Clients.Caller.SendAsync("ShotResult", new ShotResultMessage(result.Status, result.Coordinate, result.SunkShip, result.Winner));
        if (opponentConnection is not null)
        {
            await Clients.Client(opponentConnection).SendAsync("IncomingShot",
                new IncomingShotMessage(result.Coordinate,
                    result.Status == GameShotStatus.Won ? GameShotStatus.Sunk : result.Status,
                    result.SunkShip));
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
                if (room.Game.Phase != GamePhase.Playing || room.Game.CurrentPlayer != PlayerId.Two)
                    return ToFireResponse(result);
                botShot = room.Game.Fire(PlayerId.Two, RandomOpponent.ChooseTarget(room.Game.GetShotHistory(PlayerId.Two)));
                room.Touch();
                humanConnection = room.ConnectionIdFor(PlayerId.One);
                if (botShot.Status == GameShotStatus.Won)
                    revealedFleet = room.Game.GetOpponentFleet(PlayerId.One);
            }
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

    public async Task Rematch()
    {
        var (room, player) = ResolveSession();
        string? opponentConnection;
        bool started;
        PlayerId? currentPlayer;
        lock (room.SyncRoot)
        {
            opponentConnection = room.ConnectionIdFor(player == PlayerId.One ? PlayerId.Two : PlayerId.One);
            started = room.RequestRematch(player);
            currentPlayer = started ? room.Game.CurrentPlayer : null;
        }
        if (opponentConnection is not null)
        {
            await Clients.Client(opponentConnection).SendAsync(started ? "RematchStarted" : "RematchRequested", new { player });
            if (started)
                await Clients.Client(opponentConnection).SendAsync("GameStarted", new GameStartedMessage(currentPlayer != player));
        }
        if (started)
        {
            await Clients.Caller.SendAsync("RematchStarted", new { player });
            await Clients.Caller.SendAsync("GameStarted", new GameStartedMessage(currentPlayer == player));
        }
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
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

    private (Room Room, PlayerId Player) ResolveSession()
    {
        if (!Context.Items.TryGetValue(RoomKey, out var roomValue) || roomValue is not string roomCode ||
            !Context.Items.TryGetValue(PlayerKey, out var playerValue) || playerValue is not PlayerId player ||
            !rooms.TryGet(roomCode, out var room))
            throw new HubException("NOT_IN_ROOM");

        lock (room.SyncRoot)
        {
            if (!room.TryResolveConnection(Context.ConnectionId, out var resolvedPlayer) || resolvedPlayer != player)
                throw new HubException("NOT_IN_ROOM");
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
                room.HasBot);
        }
    }

    private static FireResponse ToFireResponse(GameShotResult result) =>
        new(result.Accepted, result.Status, result.Coordinate, result.SunkShip, result.Winner);
}
