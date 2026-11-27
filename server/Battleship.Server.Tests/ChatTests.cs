using Battleship.Core;
using Microsoft.AspNetCore.SignalR;

namespace Battleship.Server.Tests;

public sealed class ChatTests
{
    private sealed class Clock : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = new(2026, 11, 27, 0, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => Now;
    }

    [Fact]
    public void Retry_returns_the_same_receipt_without_consuming_the_quota()
    {
        var chat = new RoomChat();
        var first = chat.Send(PlayerId.One, "request-1", " Xin chào \r\n bạn ", 1);
        for (var index = 0; index < 10; index++) Assert.Equal(first, chat.Send(PlayerId.One, "request-1", "Xin chào \n bạn", 1));
        Assert.Single(chat.History);
        Assert.Equal("Xin chào \n bạn", first.Content);
        var error = Assert.Throws<HubException>(() => chat.Send(PlayerId.One, "request-1", "other", 1));
        Assert.Equal("CHAT_REQUEST_CONFLICT", error.Message);
    }

    [Theory]
    [InlineData("", "hello", "CHAT_INVALID_REQUEST")]
    [InlineData("has space", "hello", "CHAT_INVALID_REQUEST")]
    [InlineData("id", " \r\n ", "CHAT_EMPTY")]
    [InlineData("id", "bad\0text", "CHAT_TOO_LONG")]
    public void Invalid_messages_are_rejected(string id, string text, string expected)
    {
        var chat = new RoomChat();
        Assert.Equal(expected, Assert.Throws<HubException>(() => chat.Send(PlayerId.One, id, text, 1)).Message);
        Assert.Empty(chat.History);
    }

    [Fact]
    public void Unicode_limit_matches_client_code_points()
    {
        var chat = new RoomChat();
        var message = string.Concat(Enumerable.Repeat("🚢", 300));
        Assert.Equal(message, chat.Send(PlayerId.One, "emoji", message, 1).Content);
        Assert.Equal("CHAT_TOO_LONG", Assert.Throws<HubException>(() => chat.Send(PlayerId.One, "long", message + "a", 1)).Message);
    }

    [Fact]
    public void Rate_limit_is_per_seat_and_expires_at_five_seconds()
    {
        var clock = new Clock();
        var chat = new RoomChat(clock);
        for (var index = 0; index < 5; index++) chat.Send(PlayerId.One, $"id-{index}", "one", 1);
        Assert.Equal("CHAT_RATE_LIMITED", Assert.Throws<HubException>(() => chat.Send(PlayerId.One, "six", "one", 1)).Message);
        Assert.Equal(PlayerId.Two, chat.Send(PlayerId.Two, "other", "two", 1).Sender);
        clock.Now += TimeSpan.FromSeconds(5);
        Assert.NotNull(chat.Send(PlayerId.One, "six", "one", 1));
    }

    [Fact]
    public void History_is_bounded_and_snapshot_cannot_mutate_room_state()
    {
        var clock = new Clock();
        var chat = new RoomChat(clock);
        for (var index = 0; index < 130; index++)
        {
            clock.Now += TimeSpan.FromSeconds(1);
            chat.Send(PlayerId.One, $"id-{index}", $"message {index}", 1);
        }
        Assert.Equal(100, chat.History.Count);
        Assert.Equal(31, chat.History[0].Id);
        var snapshot = Assert.IsType<ChatMessage[]>(chat.History);
        snapshot[0] = snapshot[0] with { Content = "tampered" };
        Assert.Equal("message 30", chat.History[0].Content);
        chat.StartRound(2);
        Assert.Equal(100, chat.History.Count);
        Assert.True(chat.History[^1].IsSystem);
        Assert.Equal(2, chat.History[^1].Round);
    }

    [Fact]
    public async Task Messages_go_only_to_current_room_seats_and_restore_in_the_snapshot()
    {
        var store = new InMemoryRoomStore();
        var owner = HubTestSupport.Hub(store, "owner");
        var created = await owner.CreateRoom();
        var guest = HubTestSupport.Hub(store, "guest");
        await guest.JoinRoom(created.Code);
        var other = HubTestSupport.Hub(store, "other");
        await other.CreateRoom();
        var message = await owner.SendChat("message-1", "<script>alert('hi')</script>");
        Assert.Equal(PlayerId.One, message.Sender);
        var sent = Assert.IsType<TestHubClients>(owner.Clients).Messages.Where(item => item.Method == "ChatMessage").ToArray();
        Assert.Equal(new[] { "guest", "owner" }, sent.Select(item => item.Connection).Order().ToArray());
        Assert.Single(await guest.GetChatHistory());
        Assert.Empty(await other.GetChatHistory());
        await owner.OnDisconnectedAsync(null);
        var restored = await HubTestSupport.Hub(store, "resumed").Reconnect(created.Code, created.PlayerToken);
        Assert.Equal(message, Assert.Single(restored.ChatMessages!));
    }

    [Fact]
    public async Task Outsiders_revoked_connections_and_bot_rooms_cannot_use_chat()
    {
        var store = new InMemoryRoomStore();
        var outside = HubTestSupport.Hub(store, "outsider");
        await Assert.ThrowsAsync<HubException>(() => outside.SendChat("id", "no"));
        await Assert.ThrowsAsync<HubException>(() => outside.GetChatHistory());
        var owner = HubTestSupport.Hub(store);
        var created = await owner.CreateRoom();
        await HubTestSupport.Hub(store, "new-owner").Reconnect(created.Code, created.PlayerToken);
        await Assert.ThrowsAsync<HubException>(() => owner.SendChat("id", "revoked"));
        await Assert.ThrowsAsync<HubException>(() => owner.GetChatHistory());
        var bot = HubTestSupport.Hub(store, "bot-owner");
        var botRoom = await bot.CreateBotRoom();
        Assert.Empty(botRoom.ChatMessages!);
        Assert.Equal("CHAT_UNAVAILABLE", (await Assert.ThrowsAsync<HubException>(() => bot.SendChat("id", "no"))).Message);
    }

    [Fact]
    public void Rematch_preserves_chat_and_adds_a_round_separator()
    {
        var room = new Room("ABC234", "owner");
        room.TryJoin(null, "guest", out _, out _, out _);
        room.Chat.Send(PlayerId.One, "greeting", "again?", room.RoundNumber);
        var fleet = ShipRules.Fleet.Select((ship, row) => new FleetPlacement(ship.Key, new Coordinate(0, row), Orientation.Horizontal)).ToArray();
        room.Game.SubmitFleet(PlayerId.One, fleet);
        room.Game.SubmitFleet(PlayerId.Two, fleet);
        for (var index = 0; room.Game.Phase != GamePhase.Finished; index++)
        {
            room.Game.Fire(PlayerId.One, new Coordinate(index % 10, index / 10));
            if (room.Game.Phase != GamePhase.Finished) room.Game.Fire(PlayerId.Two, new Coordinate(index % 10, index / 10));
        }
        Assert.False(room.RequestRematch(PlayerId.One));
        Assert.True(room.RequestRematch(PlayerId.Two));
        Assert.Equal("again?", room.Chat.History[0].Content);
        Assert.Equal("Bắt đầu ván 2", room.Chat.History[1].Content);
        Assert.True(room.Chat.History[1].IsSystem);
    }
}
