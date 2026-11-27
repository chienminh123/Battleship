using Battleship.Core;
using Microsoft.AspNetCore.SignalR;

namespace Battleship.Server.Tests;

public sealed class BotRoomTests
{
    private static readonly FleetPlacement[] Fleet = ShipRules.Fleet.Select((ship, index) =>
        new FleetPlacement(ship.Key, new Coordinate(0, index * 2), Orientation.Horizontal)).ToArray();

    [Theory]
    [InlineData(BotDifficulty.Easy)]
    [InlineData(BotDifficulty.Hard)]
    [InlineData(BotDifficulty.Annihilation)]
    public async Task Selected_difficulty_survives_reconnect_and_rematch(BotDifficulty difficulty)
    {
        var store = new InMemoryRoomStore();
        var hub = HubTestSupport.Hub(store);
        var created = await hub.CreateBotRoomWithDifficulty(difficulty);
        Assert.True(created.IsBot);
        Assert.Equal(difficulty, created.BotDifficulty);
        Assert.Equal(GamePhase.Placing, created.Phase);
        Assert.Empty(created.OwnBoard.Ships);
        Assert.Null(created.Result);
        await Assert.ThrowsAsync<HubException>(() => HubTestSupport.Hub(store, "intruder").JoinRoom(created.Code));

        await hub.OnDisconnectedAsync(null);
        var resumedHub = HubTestSupport.Hub(store, "resumed");
        var restored = await resumedHub.Reconnect(created.Code, created.PlayerToken);
        Assert.Equal(difficulty, restored.BotDifficulty);
        Assert.Equal(created.PlayerToken, restored.PlayerToken);
        Assert.True(store.TryGet(created.Code, out var room));
        room.Game.SubmitFleet(PlayerId.One, Fleet);
        // Finish through legal shots so rematch exercises the real reset path.
        for (var index = 0; room.Game.Phase != GamePhase.Finished; index++)
        {
            var target = new Coordinate(index % 10, index / 10);
            room.Game.Fire(PlayerId.One, target);
            if (room.Game.Phase != GamePhase.Finished) room.Game.Fire(PlayerId.Two, target);
            Assert.True(index < 100);
        }
        await resumedHub.Rematch();
        var reset = await resumedHub.Reconnect(created.Code, created.PlayerToken);
        Assert.Equal(difficulty, reset.BotDifficulty);
        Assert.Equal(GamePhase.Placing, reset.Phase);
        Assert.False(reset.OwnFleetSubmitted);
        Assert.True(reset.OpponentFleetSubmitted);
        Assert.Empty(reset.ShotsAgainstYou);
        Assert.Empty(reset.ShotsAgainstOpponent);
        Assert.Empty(reset.OwnBoard.Ships);
    }

    [Theory]
    [InlineData(BotDifficulty.Hard)]
    [InlineData(BotDifficulty.Annihilation)]
    public async Task Real_bot_turn_extends_its_known_hits(BotDifficulty difficulty)
    {
        var store = new InMemoryRoomStore();
        var hub = HubTestSupport.Hub(store);
        var created = await hub.CreateBotRoomWithDifficulty(difficulty);
        await hub.SubmitFleet(Fleet.Select(ship => new FleetPlacementDto(ship.Type, ship.Start, ship.Orientation)).ToArray());
        Assert.True(store.TryGet(created.Code, out var room));
        room.Game.Fire(PlayerId.One, new Coordinate(0, 0));
        room.Game.Fire(PlayerId.Two, new Coordinate(3, 0));
        room.Game.Fire(PlayerId.One, new Coordinate(1, 0));
        room.Game.Fire(PlayerId.Two, new Coordinate(4, 0));
        await hub.Fire(2, 0);
        Assert.Contains(room.Game.GetShotHistory(PlayerId.Two).Last().Coordinate,
            new Coordinate[] { new(2, 0), new(5, 0) });
    }

    [Fact]
    public async Task Invalid_difficulty_does_not_create_a_room_or_bind_the_connection()
    {
        var store = new InMemoryRoomStore();
        var hub = HubTestSupport.Hub(store);
        var error = await Assert.ThrowsAsync<HubException>(() => hub.CreateBotRoomWithDifficulty((BotDifficulty)99));
        Assert.Equal("INVALID_BOT_DIFFICULTY", error.Message);
        Assert.Empty(store.Rooms);
        Assert.Equal(BotDifficulty.Easy, (await hub.CreateBotRoom()).BotDifficulty);
    }

    [Fact]
    public async Task Human_room_has_no_bot_difficulty()
    {
        var store = new InMemoryRoomStore();
        var hub = HubTestSupport.Hub(store);
        var created = await hub.CreateRoom();
        Assert.Null((await hub.Reconnect(created.Code, created.PlayerToken)).BotDifficulty);
    }
}
