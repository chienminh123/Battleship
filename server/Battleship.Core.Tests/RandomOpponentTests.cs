using Battleship.Core;

namespace Battleship.Core.Tests;

public sealed class RandomOpponentTests
{
    [Fact]
    public void RandomFleetsRespectRulesAcrossManySeeds()
    {
        var layouts = new HashSet<string>();
        for (var seed = 0; seed < 200; seed++)
        {
            var fleet = RandomOpponent.CreateFleet(new Random(seed));
            var board = new Board();
            Assert.True(board.PlaceFleet(fleet.ToArray()).Success);
            var view = board.GetView();
            Assert.Equal(5, view.Ships.Count);
            Assert.Equal(17, view.Ships.SelectMany(ship => ship.Cells).Distinct().Count());
            layouts.Add(string.Join(";", fleet));
        }
        Assert.True(layouts.Count > 190);
    }

    [Fact]
    public void RandomTargetsCoverBoardWithoutRepeating()
    {
        var history = new List<ShotHistoryItem>();
        var random = new Random(42);
        for (var turn = 0; turn < 100; turn++)
        {
            var target = RandomOpponent.ChooseTarget(history, random);
            Assert.True(target.IsWithinBoard);
            Assert.DoesNotContain(history, shot => shot.Coordinate == target);
            history.Add(new ShotHistoryItem(target, GameShotStatus.Miss));
        }
        Assert.Throws<InvalidOperationException>(() => RandomOpponent.ChooseTarget(history, random));
    }
}
