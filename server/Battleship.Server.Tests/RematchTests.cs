using Battleship.Core;

namespace Battleship.Server.Tests;

public sealed class RematchTests
{
    private static readonly FleetPlacement[] Fleet = ShipRules.Fleet.Select((ship, row) =>
        new FleetPlacement(ship.Key, new Coordinate(0, row), Orientation.Horizontal)).ToArray();

    private static Room FinishedRoom(bool bot)
    {
        var room = new Room("ABC234", "owner-token");
        room.BindConnection(PlayerId.One, "owner");
        if (bot) room.AddBot();
        else
        {
            room.TryJoin(null, "guest", out _, out _, out _);
            room.Game.SubmitFleet(PlayerId.One, Fleet);
            room.Game.SubmitFleet(PlayerId.Two, Fleet);
        }
        if (bot) room.Game.SubmitFleet(PlayerId.One, Fleet);
        var cells = room.Game.GetOwnBoard(PlayerId.Two).Ships.SelectMany(ship => ship.Cells).ToArray();
        for (var i = 0; i < cells.Length; i++)
        {
            var result = room.Game.Fire(PlayerId.One, cells[i]);
            if (result.Status != GameShotStatus.Won) room.Game.Fire(PlayerId.Two, new Coordinate(i % 10, 9 - i / 10));
        }
        Assert.Equal(GamePhase.Finished, room.Game.Phase);
        return room;
    }

    [Fact]
    public void Human_rematch_requires_both_votes_then_returns_to_placement_with_empty_histories()
    {
        var room = FinishedRoom(false);
        var oldGame = room.Game;
        Assert.False(room.RequestRematch(PlayerId.One));
        Assert.False(room.RequestRematch(PlayerId.One));
        Assert.Same(oldGame, room.Game);
        Assert.True(room.RequestRematch(PlayerId.Two));
        Assert.Equal(GamePhase.Placing, room.Game.Phase);
        Assert.Null(room.Game.CurrentPlayer);
        Assert.Null(room.Game.Winner);
        foreach (var player in Enum.GetValues<PlayerId>())
        {
            Assert.False(room.Game.HasSubmittedFleet(player));
            Assert.Empty(room.Game.GetOwnBoard(player).Ships);
            Assert.Empty(room.Game.GetShotHistory(player));
        }
        Assert.Equal(GameShotStatus.GameNotReady, room.Game.Fire(PlayerId.One, new Coordinate(0, 0)).Status);
        Assert.True(room.Game.SubmitFleet(PlayerId.One, Fleet).Accepted);
        Assert.Equal(GamePhase.Placing, room.Game.Phase);
        var moved = Fleet.Select(ship => ship with { Start = ship.Start with { X = 4 } }).ToArray();
        Assert.True(room.Game.SubmitFleet(PlayerId.Two, moved).Accepted);
        Assert.Equal(GamePhase.Playing, room.Game.Phase);
    }

    [Fact]
    public void Bot_rematch_readies_only_the_bot_and_waits_for_human_placement()
    {
        var room = FinishedRoom(true);
        Assert.True(room.RequestRematch(PlayerId.One));
        Assert.Equal(GamePhase.Placing, room.Game.Phase);
        Assert.False(room.Game.HasSubmittedFleet(PlayerId.One));
        Assert.True(room.Game.HasSubmittedFleet(PlayerId.Two));
        Assert.Empty(room.Game.GetOwnBoard(PlayerId.One).Ships);
        Assert.Equal(5, room.Game.GetOwnBoard(PlayerId.Two).Ships.Count);
        Assert.Empty(room.Game.GetShotHistory(PlayerId.Two));
        Assert.Equal(GameShotStatus.GameNotReady, room.Game.Fire(PlayerId.One, new Coordinate(0, 0)).Status);
        var humanFleet = Fleet.Select(ship => ship with { Start = ship.Start with { Y = ship.Start.Y + 5 } }).ToArray();
        Assert.True(room.Game.SubmitFleet(PlayerId.One, humanFleet).Accepted);
        Assert.Equal(GamePhase.Playing, room.Game.Phase);
    }
}
