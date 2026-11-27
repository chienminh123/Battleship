using Battleship.Core;
using Xunit.Abstractions;

namespace Battleship.Core.Tests;

public sealed class BotOpponentTests(ITestOutputHelper output)
{
    private static ShotHistoryItem Hit(int x, int y) => new(new Coordinate(x, y), GameShotStatus.Hit);
    private static ShotHistoryItem Miss(int x, int y) => new(new Coordinate(x, y), GameShotStatus.Miss);

    [Fact]
    public void Easy_keeps_the_original_uniform_random_strategy()
    {
        ShotHistoryItem[] history = [Hit(4, 4), Miss(5, 4)];
        for (var seed = 0; seed < 20; seed++)
            Assert.Equal(RandomOpponent.ChooseTarget(history, new Random(seed)),
                BotOpponent.ChooseTarget(history, BotDifficulty.Easy, new Random(seed)));
    }

    [Theory]
    [InlineData(BotDifficulty.Hard)]
    [InlineData(BotDifficulty.Annihilation)]
    public void First_hit_is_followed_orthogonally_never_diagonally(BotDifficulty difficulty)
    {
        for (var seed = 0; seed < 20; seed++)
        {
            var target = BotOpponent.ChooseTarget([Hit(4, 4)], difficulty, new Random(seed));
            Assert.Equal(1, Math.Abs(target.X - 4) + Math.Abs(target.Y - 4));
        }
    }

    [Theory]
    [InlineData(BotDifficulty.Hard, false)]
    [InlineData(BotDifficulty.Hard, true)]
    [InlineData(BotDifficulty.Annihilation, false)]
    [InlineData(BotDifficulty.Annihilation, true)]
    public void Aligned_hits_extend_only_the_two_ends(BotDifficulty difficulty, bool vertical)
    {
        ShotHistoryItem[] history = vertical ? [Hit(4, 4), Hit(4, 5)] : [Hit(4, 4), Hit(5, 4)];
        Coordinate[] ends = vertical ? [new(4, 3), new(4, 6)] : [new(3, 4), new(6, 4)];
        for (var seed = 0; seed < 20; seed++)
            Assert.Contains(BotOpponent.ChooseTarget(history, difficulty, new Random(seed)), ends);
    }

    [Theory]
    [InlineData(BotDifficulty.Hard)]
    [InlineData(BotDifficulty.Annihilation)]
    public void A_miss_at_one_end_reverses_direction(BotDifficulty difficulty)
    {
        Assert.Equal(new Coordinate(4, 3), BotOpponent.ChooseTarget(
            [Hit(4, 4), Hit(4, 5), Miss(4, 6)], difficulty));
        Assert.Equal(new Coordinate(0, 2), BotOpponent.ChooseTarget(
            [Hit(0, 0), Hit(0, 1)], difficulty));
    }

    [Theory]
    [InlineData(BotDifficulty.Hard)]
    [InlineData(BotDifficulty.Annihilation)]
    public void False_alignment_between_touching_ships_can_change_axis(BotDifficulty difficulty)
    {
        ShotHistoryItem[] history = [Hit(4, 4), Hit(4, 5), Miss(4, 3), Miss(4, 6)];
        Coordinate[] alternatives = [new(3, 4), new(5, 4), new(3, 5), new(5, 5)];
        for (var seed = 0; seed < 20; seed++)
            Assert.Contains(BotOpponent.ChooseTarget(history, difficulty, new Random(seed)), alternatives);
    }

    [Theory]
    [InlineData(BotDifficulty.Hard)]
    [InlineData(BotDifficulty.Annihilation)]
    public void Sinking_a_ship_preserves_other_hits_even_when_the_ships_touch(BotDifficulty difficulty)
    {
        ShotHistoryItem[] history = [Hit(3, 4), Hit(5, 4),
            new(new Coordinate(4, 4), GameShotStatus.Sunk, ShipType.Destroyer, [new(3, 4), new(4, 4)]),
            Miss(5, 3), Miss(5, 5)];
        Assert.Equal(new Coordinate(6, 4), BotOpponent.ChooseTarget(history, difficulty));
    }

    [Fact]
    public void Hard_returns_to_random_hunt_after_the_last_pending_ship_sinks()
    {
        ShotHistoryItem[] history = [Hit(3, 4),
            new(new Coordinate(4, 4), GameShotStatus.Sunk, ShipType.Destroyer, [new(3, 4), new(4, 4)])];
        for (var seed = 0; seed < 20; seed++)
            Assert.Equal(RandomOpponent.ChooseTarget(history, new Random(seed)),
                BotOpponent.ChooseTarget(history, BotDifficulty.Hard, new Random(seed)));
    }

    [Fact]
    public void Annihilation_opens_on_a_highest_density_central_cell()
    {
        Coordinate[] centers = [new(4, 4), new(4, 5), new(5, 4), new(5, 5)];
        for (var seed = 0; seed < 20; seed++)
            Assert.Contains(BotOpponent.ChooseTarget([], BotDifficulty.Annihilation, new Random(seed)), centers);
    }

    [Fact]
    public void Density_uses_remaining_ship_lengths_and_does_not_avoid_cells_next_to_wrecks()
    {
        // All large ships are sunk. The destroyer can fit at A2-B2 or B2-C2;
        // the isolated I9 is impossible even though it has never been fired on.
        var unknown = new HashSet<Coordinate> { new(0, 1), new(1, 1), new(2, 1), new(8, 8) };
        var history = new List<ShotHistoryItem>();
        var row = 0;
        foreach (var (type, length) in ShipRules.Fleet.Where(ship => ship.Key != ShipType.Destroyer))
        {
            var cells = Enumerable.Range(0, length).Select(x => new Coordinate(x, row)).ToArray();
            history.AddRange(cells.Take(length - 1).Select(cell => Hit(cell.X, cell.Y)));
            history.Add(new(cells[^1], GameShotStatus.Sunk, type, cells));
            row += 2;
        }
        var fired = history.Select(shot => shot.Coordinate).ToHashSet();
        for (var y = 0; y < 10; y++)
        for (var x = 0; x < 10; x++)
        {
            var cell = new Coordinate(x, y);
            if (!unknown.Contains(cell) && !fired.Contains(cell)) history.Add(Miss(x, y));
        }
        Assert.Equal(new Coordinate(1, 1), BotOpponent.ChooseTarget(history, BotDifficulty.Annihilation));
    }

    [Theory]
    [InlineData(BotDifficulty.Easy)]
    [InlineData(BotDifficulty.Hard)]
    [InlineData(BotDifficulty.Annihilation)]
    public void Endgame_never_repeats_or_leaves_the_board(BotDifficulty difficulty)
    {
        var history = Enumerable.Range(0, 99).Select(index => Miss(index % 10, index / 10)).ToList();
        Assert.Equal(new Coordinate(9, 9), BotOpponent.ChooseTarget(history, difficulty));
        history.Add(Miss(9, 9));
        Assert.Throws<InvalidOperationException>(() => BotOpponent.ChooseTarget(history, difficulty));
    }

    [Fact]
    public void Invalid_difficulty_is_rejected() =>
        Assert.Throws<ArgumentOutOfRangeException>(() => BotOpponent.ChooseTarget([], (BotDifficulty)99));

    [Fact]
    public void Same_history_and_seed_reconstruct_the_same_decision_without_private_memory()
    {
        ShotHistoryItem[] history = [Miss(1, 1), Hit(4, 4), Hit(5, 4)];
        Assert.Equal(BotOpponent.ChooseTarget(history, BotDifficulty.Annihilation, new Random(17)),
            BotOpponent.ChooseTarget(history.ToArray(), BotDifficulty.Annihilation, new Random(17)));
    }

    [Fact]
    public void Strategies_finish_legal_fleets_and_improve_on_the_same_seeded_layouts()
    {
        const int samples = 80;
        var totals = new int[3];
        for (var seed = 0; seed < samples; seed++)
        {
            var fleet = RandomOpponent.CreateFleet(new Random(seed)).ToArray();
            foreach (var difficulty in Enum.GetValues<BotDifficulty>())
            {
                var board = new Board();
                Assert.True(board.PlaceFleet(fleet).Success);
                var history = new List<ShotHistoryItem>();
                var random = new Random(seed + 1000);
                while (board.RemainingShips > 0)
                {
                    var target = BotOpponent.ChooseTarget(history, difficulty, random);
                    Assert.True(target.IsWithinBoard);
                    Assert.DoesNotContain(history, shot => shot.Coordinate == target);
                    var shot = board.Shoot(target);
                    Assert.True(shot.Accepted);
                    var cells = shot.SunkShip is { } type ? board.Ships.Single(ship => ship.Type == type).Cells : null;
                    history.Add(new(target, shot.Status switch
                    {
                        BoardShotStatus.Hit => GameShotStatus.Hit,
                        BoardShotStatus.Sunk => GameShotStatus.Sunk,
                        _ => GameShotStatus.Miss,
                    }, shot.SunkShip, cells));
                    Assert.True(history.Count <= 100);
                }
                totals[(int)difficulty] += history.Count;
            }
        }
        output.WriteLine($"Same {samples} layouts, mean shots: Easy {totals[0] / (double)samples:F2}, Hard {totals[1] / (double)samples:F2}, Annihilation {totals[2] / (double)samples:F2}.");
        Assert.True(totals[1] < totals[0], "Hard should beat uniform random across the shared sample.");
        Assert.True(totals[2] < totals[1], "Density hunt should improve on Hard across the shared sample.");
    }
}
