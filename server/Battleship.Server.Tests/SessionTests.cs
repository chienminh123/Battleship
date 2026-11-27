using Battleship.Core;
using Microsoft.AspNetCore.SignalR;

namespace Battleship.Server.Tests;

public sealed class SessionTests
{
    [Fact]
    public async Task Duplicate_connections_may_not_claim_both_room_seats()
    {
        var store = new InMemoryRoomStore();
        var owner = HubTestSupport.Hub(store, "shared");
        var created = await owner.CreateRoom();
        var error = await Assert.ThrowsAsync<HubException>(() => HubTestSupport.Hub(store, "shared").JoinRoom(created.Code));
        Assert.Equal("ALREADY_IN_ROOM", error.Message);
        Assert.True(store.TryGet(created.Code, out var room));
        Assert.False(room.HasTwoPlayers);
    }

    [Fact]
    public async Task Creating_another_room_is_rejected_without_leaving_a_stale_binding()
    {
        var store = new InMemoryRoomStore();
        var owner = HubTestSupport.Hub(store);
        var created = await owner.CreateRoom();
        var guest = HubTestSupport.Hub(store, "guest");
        var joined = await guest.JoinRoom(created.Code);
        var error = await Assert.ThrowsAsync<HubException>(() => owner.CreateRoom());
        Assert.Equal("ALREADY_IN_ROOM", error.Message);
        Assert.Single(store.Rooms);
        await owner.OnDisconnectedAsync(null);
        Assert.False((await guest.JoinRoom(created.Code, joined.PlayerToken)).OpponentConnected);
    }

    [Fact]
    public async Task Creating_a_bot_room_while_bound_is_also_rejected()
    {
        var store = new InMemoryRoomStore();
        var owner = HubTestSupport.Hub(store);
        await owner.CreateRoom();
        var error = await Assert.ThrowsAsync<HubException>(() => owner.CreateBotRoom());
        Assert.Equal("ALREADY_IN_ROOM", error.Message);
        Assert.Single(store.Rooms);
    }

    [Fact]
    public async Task Joining_another_room_does_not_occupy_it_or_abandon_the_original_seat()
    {
        var store = new InMemoryRoomStore();
        var first = HubTestSupport.Hub(store);
        var original = await first.CreateRoom();
        var target = await HubTestSupport.Hub(store, "second").CreateRoom();
        var error = await Assert.ThrowsAsync<HubException>(() => first.JoinRoom(target.Code));
        Assert.Equal("ALREADY_IN_ROOM", error.Message);
        Assert.True(store.TryGet(target.Code, out var targetRoom));
        Assert.False(targetRoom.HasTwoPlayers);
        Assert.Equal(PlayerId.One, (await first.JoinRoom(original.Code, original.PlayerToken)).Player);
    }

    [Fact]
    public void One_connection_cannot_claim_both_seats()
    {
        var room = new Room("ABC234", "owner-token");
        room.BindConnection(PlayerId.One, "same-connection");
        Assert.False(room.TryJoin(null, "same-connection", out _, out _, out _));
        Assert.False(room.HasTwoPlayers);
    }

    [Fact]
    public async Task Token_takeover_revokes_the_old_connection_and_its_disconnect_preserves_the_new_one()
    {
        var store = new InMemoryRoomStore();
        var old = HubTestSupport.Hub(store, "old");
        var created = await old.CreateRoom();
        await HubTestSupport.Hub(store, "new").JoinRoom(created.Code, created.PlayerToken);
        var error = await Assert.ThrowsAsync<HubException>(() => old.Fire(0, 0));
        Assert.Equal("NOT_IN_ROOM", error.Message);
        await old.OnDisconnectedAsync(null);
        Assert.True(store.TryGet(created.Code, out var room));
        Assert.Equal("new", room.ConnectionIdFor(PlayerId.One));
    }

    [Fact]
    public async Task Invalid_reconnect_token_has_a_distinct_error_and_does_not_claim_a_seat()
    {
        var store = new InMemoryRoomStore();
        var created = await HubTestSupport.Hub(store).CreateRoom();
        var error = await Assert.ThrowsAsync<HubException>(() => HubTestSupport.Hub(store, "other").JoinRoom(created.Code, "wrong-token"));
        Assert.Equal("INVALID_PLAYER_TOKEN", error.Message);
        Assert.True(store.TryGet(created.Code, out var room));
        Assert.False(room.HasTwoPlayers);
    }
}
