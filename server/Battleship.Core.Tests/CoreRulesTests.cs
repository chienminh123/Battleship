using Battleship.Core;

namespace Battleship.Core.Tests;

public class CoreRulesTests
{
    private static readonly FleetPlacement[] Fleet =
    [
        new(ShipType.Carrier, new Coordinate(0, 0), Orientation.Horizontal),
        new(ShipType.Battleship, new Coordinate(0, 1), Orientation.Horizontal),
        new(ShipType.Cruiser, new Coordinate(0, 2), Orientation.Horizontal),
        new(ShipType.Submarine, new Coordinate(0, 3), Orientation.Horizontal),
        new(ShipType.Destroyer, new Coordinate(0, 4), Orientation.Horizontal)
    ];

    [Fact]
    public void Fleet_accepts_all_ships_and_allows_adjacent_placement()
    {
        var board = new Board();

        var result = board.PlaceFleet(Fleet);

        Assert.True(result.Success);
        Assert.Empty(result.Errors);
        Assert.True(board.FleetPlaced);
        Assert.Equal(5, board.RemainingShips);
        Assert.Equal(17, board.Ships.Sum(ship => ship.Length));
    }

    [Fact]
    public void Fleet_rejects_missing_and_duplicate_ship_types_without_partial_placement()
    {
        var board = new Board();
        var placements = Fleet.Where(item => item.Type != ShipType.Carrier)
            .Append(new FleetPlacement(ShipType.Destroyer, new Coordinate(3, 4), Orientation.Horizontal))
            .ToArray();

        var result = board.PlaceFleet(placements);

        Assert.False(result.Success);
        Assert.Contains(result.Errors, error => error.Code == FleetErrorCode.MissingShip && error.ShipType == ShipType.Carrier);
        Assert.Contains(result.Errors, error => error.Code == FleetErrorCode.DuplicateShip && error.ShipType == ShipType.Destroyer);
        Assert.False(board.FleetPlaced);
        Assert.Empty(board.Ships);
    }

    [Fact]
    public void Fleet_rejects_out_of_bounds_and_overlapping_cells()
    {
        var board = new Board();
        var placements = Fleet.ToArray();
        placements[0] = new FleetPlacement(ShipType.Carrier, new Coordinate(8, 0), Orientation.Horizontal);
        placements[1] = new FleetPlacement(ShipType.Battleship, new Coordinate(9, 0), Orientation.Vertical);

        var result = board.PlaceFleet(placements);

        Assert.False(result.Success);
        Assert.Contains(result.Errors, error => error.Code == FleetErrorCode.OutOfBounds);
        Assert.Contains(result.Errors, error => error.Code == FleetErrorCode.Overlap);
    }

    [Fact]
    public void Fleet_rejects_unknown_ship_types()
    {
        var board = new Board();
        var placements = Fleet.Append(new FleetPlacement((ShipType)999, new Coordinate(0, 5), Orientation.Horizontal)).ToArray();

        var result = board.PlaceFleet(placements);

        Assert.False(result.Success);
        Assert.Contains(result.Errors, error => error.Code == FleetErrorCode.UnknownShip);
        Assert.False(board.FleetPlaced);
    }

    [Fact]
    public void Shots_report_miss_hit_and_the_ship_that_sinks()
    {
        var board = CreateBoard();

        Assert.Equal(BoardShotStatus.Miss, board.Shoot(new Coordinate(9, 9)).Status);
        Assert.Equal(BoardShotStatus.Hit, board.Shoot(new Coordinate(0, 4)).Status);
        var finalHit = board.Shoot(new Coordinate(1, 4));

        Assert.Equal(BoardShotStatus.Sunk, finalHit.Status);
        Assert.Equal(ShipType.Destroyer, finalHit.SunkShip);
        Assert.Equal(4, board.RemainingShips);
    }

    [Fact]
    public void Board_rejects_out_of_bounds_and_repeated_shots_without_recording_them()
    {
        var board = CreateBoard();

        Assert.Equal(BoardShotStatus.OutOfBounds, board.Shoot(new Coordinate(-1, 0)).Status);
        Assert.Equal(BoardShotStatus.Miss, board.Shoot(new Coordinate(9, 9)).Status);
        Assert.Equal(BoardShotStatus.AlreadyFired, board.Shoot(new Coordinate(9, 9)).Status);
        Assert.Equal(1, board.ShotCount);
    }

    [Fact]
    public void Game_enforces_phases_turns_and_keeps_turn_after_rejected_shots()
    {
        var game = new Game();

        Assert.Equal(GameShotStatus.GameNotReady, game.Fire(PlayerId.One, new Coordinate(0, 0)).Status);
        Assert.True(game.JoinOpponent());
        Assert.Equal(GamePhase.Placing, game.Phase);
        Assert.True(game.SubmitFleet(PlayerId.One, Fleet).Accepted);
        Assert.Equal(GameActionError.FleetAlreadySubmitted, game.SubmitFleet(PlayerId.One, Fleet).Error);
        Assert.Equal(GamePhase.Placing, game.Phase);
        Assert.True(game.SubmitFleet(PlayerId.Two, Fleet).Accepted);
        Assert.Equal(GamePhase.Playing, game.Phase);
        Assert.Equal(PlayerId.One, game.CurrentPlayer);

        Assert.Equal(GameShotStatus.NotYourTurn, game.Fire(PlayerId.Two, new Coordinate(0, 0)).Status);
        Assert.Equal(GameShotStatus.Hit, game.Fire(PlayerId.One, new Coordinate(0, 0)).Status);
        Assert.Equal(PlayerId.Two, game.CurrentPlayer);
        Assert.Equal(GameShotStatus.Miss, game.Fire(PlayerId.Two, new Coordinate(9, 9)).Status);
        Assert.Equal(GameShotStatus.AlreadyFired, game.Fire(PlayerId.One, new Coordinate(0, 0)).Status);
        Assert.Equal(PlayerId.One, game.CurrentPlayer);
    }

    [Fact]
    public void Game_finishes_when_every_opponent_ship_is_sunk_and_rejects_later_shots()
    {
        var game = new Game();
        game.JoinOpponent();
        game.SubmitFleet(PlayerId.One, Fleet);
        game.SubmitFleet(PlayerId.Two, Fleet);

        var targetCells = Fleet.SelectMany(placement => Enumerable.Range(0, ShipRules.LengthOf(placement.Type))
            .Select(offset => placement.Orientation == Orientation.Horizontal
                ? new Coordinate(placement.Start.X + offset, placement.Start.Y)
                : new Coordinate(placement.Start.X, placement.Start.Y + offset)))
            .ToArray();
        var safeMisses = Enumerable.Range(0, targetCells.Length)
            .Select(index => index < Coordinate.BoardSize
                ? new Coordinate(index, 9)
                : new Coordinate(index - Coordinate.BoardSize, 8))
            .ToArray();

        GameShotResult? finalShot = null;
        for (var index = 0; index < targetCells.Length; index++)
        {
            finalShot = game.Fire(PlayerId.One, targetCells[index]);
            if (finalShot.Status != GameShotStatus.Won)
                game.Fire(PlayerId.Two, safeMisses[index]);
        }

        Assert.Equal(GameShotStatus.Won, finalShot!.Status);
        Assert.Equal(ShipType.Destroyer, finalShot.SunkShip);
        Assert.Equal(PlayerId.One, finalShot.Winner);
        Assert.Equal(GamePhase.Finished, game.Phase);
        Assert.Equal(PlayerId.One, game.Winner);
        Assert.Equal(GameShotStatus.GameFinished, game.Fire(PlayerId.Two, new Coordinate(9, 9)).Status);
    }

    [Fact]
    public void Game_exposes_only_own_board_until_finished()
    {
        var game = new Game();
        game.JoinOpponent();
        game.SubmitFleet(PlayerId.One, Fleet);
        game.SubmitFleet(PlayerId.Two, Fleet);

        Assert.Equal(5, game.GetOwnBoard(PlayerId.One).Ships.Count);
        Assert.Throws<InvalidOperationException>(() => game.GetOpponentFleet(PlayerId.One));

        var ownBoardBeforeShot = game.GetOwnBoard(PlayerId.One);
        game.Fire(PlayerId.One, new Coordinate(9, 9));

        Assert.Empty(ownBoardBeforeShot.IncomingShots);
        Assert.Equal(new Coordinate(9, 9), Assert.Single(game.GetOpponentShots(PlayerId.One)));
        Assert.Empty(game.GetOwnBoard(PlayerId.One).IncomingShots);
    }

    [Fact]
    public void Game_restores_incoming_shot_history_for_reconnecting_player()
    {
        var game = new Game();
        game.JoinOpponent();
        game.SubmitFleet(PlayerId.One, Fleet);
        game.SubmitFleet(PlayerId.Two, Fleet);

        game.Fire(PlayerId.One, new Coordinate(9, 9));
        game.Fire(PlayerId.Two, new Coordinate(9, 8));

        Assert.Equal(new ShotHistoryItem(new Coordinate(9, 9), GameShotStatus.Miss),
            Assert.Single(game.GetIncomingShotHistory(PlayerId.Two)));
        Assert.Equal(new ShotHistoryItem(new Coordinate(9, 8), GameShotStatus.Miss),
            Assert.Single(game.GetIncomingShotHistory(PlayerId.One)));
    }

    [Fact]
    public void Sunk_cells_identify_only_the_destroyed_ship_and_survive_reconnect()
    {
        var game = new Game();
        game.JoinOpponent();
        game.SubmitFleet(PlayerId.One, Fleet);
        game.SubmitFleet(PlayerId.Two, Fleet);

        // Cruiser and destroyer touch the submarine. Partial hits on either
        // neighbour must not be included when the submarine sinks.
        Coordinate[] targets = [new(0, 2), new(0, 4), new(2, 3), new(0, 3), new(1, 3)];
        GameShotResult? result = null;
        for (var index = 0; index < targets.Length; index++)
        {
            result = game.Fire(PlayerId.One, targets[index]);
            if (index < targets.Length - 1)
            {
                Assert.Equal(GameShotStatus.Hit, result.Status);
                Assert.Null(result.SunkCells);
            }
            game.Fire(PlayerId.Two, new Coordinate(index, 9));
        }

        Coordinate[] submarine = [new(0, 3), new(1, 3), new(2, 3)];
        Assert.Equal(GameShotStatus.Sunk, result!.Status);
        Assert.Equal(ShipType.Submarine, result.SunkShip);
        Assert.Equal(submarine, result.SunkCells);
        Assert.Equal(submarine, game.GetShotHistory(PlayerId.One).Last().SunkCells);
        Assert.Equal(submarine, game.GetIncomingShotHistory(PlayerId.Two).Last().SunkCells);
        Assert.All(game.GetShotHistory(PlayerId.One).SkipLast(1), shot => Assert.Null(shot.SunkCells));
        Assert.Throws<InvalidOperationException>(() => game.GetOpponentFleet(PlayerId.One));
    }

    private static Board CreateBoard()
    {
        var board = new Board();
        Assert.True(board.PlaceFleet(Fleet).Success);
        return board;
    }
}
