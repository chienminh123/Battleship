using Battleship.Core;
using Microsoft.AspNetCore.SignalR;

namespace Battleship.Server.Tests;

public sealed class MatchExitTests
{
    private static FleetPlacementDto[] Fleet => ShipRules.Fleet.Select((ship, i) =>
        new FleetPlacementDto(ship.Key, new Coordinate(0, i * 2), Orientation.Horizontal)).ToArray();

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Leaving_before_start_closes_room_and_releases_binding(bool joined)
    {
        var store = new InMemoryRoomStore();
        var owner = HubTestSupport.Hub(store);
        var created = await owner.CreateRoom();
        if (joined) await HubTestSupport.Hub(store, "guest").JoinRoom(created.Code);
        await owner.LeaveRoom();
        Assert.False(store.TryGet(created.Code, out _));
        if (joined) Assert.Contains(((TestHubClients)owner.Clients).Messages, m => m.Connection == "guest" && m.Method == "RoomClosed");
        await owner.CreateRoom();
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Exit_during_play_records_correct_winner_and_notifies_players(bool leave)
    {
        var store = new InMemoryRoomStore();
        var owner = HubTestSupport.Hub(store);
        var created = await owner.CreateRoom();
        var guest = HubTestSupport.Hub(store, "guest");
        await guest.JoinRoom(created.Code);
        await owner.SubmitFleet(Fleet); await guest.SubmitFleet(Fleet);
        if (leave) await owner.LeaveRoom(); else await owner.Surrender();
        Assert.True(store.TryGet(created.Code, out var room));
        Assert.Equal(GamePhase.Finished, room.Game.Phase);
        Assert.Equal(PlayerId.Two, room.Game.Winner);
        Assert.Equal(leave ? "LeftMatch" : "Surrender", room.FinishReason);
        var messages = ((TestHubClients)owner.Clients).Messages;
        Assert.Contains(messages, m => m.Connection == "guest" && m.Method == "GameOver" && ((GameOverMessage)m.Arguments[0]!).Reason == room.FinishReason);
        if (leave)
        {
            Assert.Null(room.ConnectionIdFor(PlayerId.One));
            Assert.Contains(messages, m => m.Connection == "guest" && m.Method == "OpponentLeft");
            await owner.CreateRoom();
        }
        else
        {
            Assert.Contains(messages, m => m.Connection == "owner" && m.Method == "GameOver");
            await Assert.ThrowsAsync<HubException>(() => owner.Surrender());
            await owner.LeaveRoom();
            Assert.Equal(PlayerId.Two, room.Game.Winner);
        }
    }
}
