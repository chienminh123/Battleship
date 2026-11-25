namespace Battleship.Core;

public enum PlayerId { One, Two }
public enum GamePhase { WaitingForOpponent, Placing, Playing, Finished }
public enum GameActionError { WrongPhase, FleetAlreadySubmitted }
public sealed record FleetSubmissionResult(bool Accepted, GameActionError? Error = null,
    IReadOnlyList<FleetValidationError>? FleetErrors = null, GamePhase Phase = GamePhase.WaitingForOpponent);

public enum GameShotStatus { Miss, Hit, Sunk, Won, NotYourTurn, GameNotReady, GameFinished, OutOfBounds, AlreadyFired }
public sealed record GameShotResult(GameShotStatus Status, Coordinate Coordinate, ShipType? SunkShip = null, PlayerId? Winner = null)
{
    public bool Accepted => Status is GameShotStatus.Miss or GameShotStatus.Hit or GameShotStatus.Sunk or GameShotStatus.Won;
}

public sealed record ShotHistoryItem(Coordinate Coordinate, GameShotStatus Status, ShipType? SunkShip = null);

public sealed class Game
{
    private readonly Board _playerOneBoard = new();
    private readonly Board _playerTwoBoard = new();
    private readonly HashSet<PlayerId> _submittedFleets = [];
    private readonly Dictionary<PlayerId, List<ShotHistoryItem>> _shotsByPlayer = new()
    {
        [PlayerId.One] = [],
        [PlayerId.Two] = []
    };

    public GamePhase Phase { get; private set; } = GamePhase.WaitingForOpponent;
    public PlayerId? CurrentPlayer { get; private set; }
    public PlayerId? Winner { get; private set; }

    public BoardView GetOwnBoard(PlayerId player) => GetBoard(player).GetView();

    public IReadOnlyList<Coordinate> GetOpponentShots(PlayerId player) => GetBoard(OpponentOf(player)).GetView().IncomingShots;

    public IReadOnlyList<ShotHistoryItem> GetShotHistory(PlayerId player) => _shotsByPlayer[player].ToArray();

    public IReadOnlyList<ShotHistoryItem> GetIncomingShotHistory(PlayerId player) =>
        _shotsByPlayer[OpponentOf(player)]
            .Select(shot => shot.Status == GameShotStatus.Won
                ? shot with { Status = GameShotStatus.Sunk }
                : shot)
            .ToArray();

    public bool HasSubmittedFleet(PlayerId player) => _submittedFleets.Contains(player);

    public IReadOnlyList<ShipView> GetOpponentFleet(PlayerId player)
    {
        if (Phase != GamePhase.Finished)
            throw new InvalidOperationException("The opponent fleet is available only after the game ends.");
        return GetBoard(OpponentOf(player)).GetView().Ships;
    }

    public bool JoinOpponent()
    {
        if (Phase != GamePhase.WaitingForOpponent) return false;
        Phase = GamePhase.Placing;
        return true;
    }

    public FleetSubmissionResult SubmitFleet(PlayerId player, IReadOnlyCollection<FleetPlacement> placements)
    {
        if (Phase != GamePhase.Placing) return new(false, GameActionError.WrongPhase, Phase: Phase);
        if (_submittedFleets.Contains(player)) return new(false, GameActionError.FleetAlreadySubmitted, Phase: Phase);

        var result = GetBoard(player).PlaceFleet(placements);
        if (!result.Success) return new(false, FleetErrors: result.Errors, Phase: Phase);

        _submittedFleets.Add(player);
        if (_submittedFleets.Count == 2)
        {
            Phase = GamePhase.Playing;
            CurrentPlayer = PlayerId.One;
        }
        return new(true, Phase: Phase);
    }

    public GameShotResult Fire(PlayerId player, Coordinate coordinate)
    {
        if (Phase == GamePhase.Finished) return new(GameShotStatus.GameFinished, coordinate, Winner: Winner);
        if (Phase != GamePhase.Playing) return new(GameShotStatus.GameNotReady, coordinate);
        if (CurrentPlayer != player) return new(GameShotStatus.NotYourTurn, coordinate);

        var target = GetBoard(OpponentOf(player));
        var shot = target.Shoot(coordinate);
        if (!shot.Accepted)
        {
            var status = shot.Status switch
            {
                BoardShotStatus.OutOfBounds => GameShotStatus.OutOfBounds,
                BoardShotStatus.AlreadyFired => GameShotStatus.AlreadyFired,
                _ => GameShotStatus.GameNotReady
            };
            return new GameShotResult(status, coordinate);
        }

        if (target.RemainingShips == 0)
        {
            Phase = GamePhase.Finished;
            Winner = player;
            _shotsByPlayer[player].Add(new ShotHistoryItem(coordinate, GameShotStatus.Won, shot.SunkShip));
            return new GameShotResult(GameShotStatus.Won, coordinate, shot.SunkShip, Winner);
        }

        CurrentPlayer = OpponentOf(player);
        var gameStatus = shot.Status switch
        {
            BoardShotStatus.Miss => GameShotStatus.Miss,
            BoardShotStatus.Hit => GameShotStatus.Hit,
            BoardShotStatus.Sunk => GameShotStatus.Sunk,
            _ => throw new InvalidOperationException("Unexpected accepted shot status.")
        };
        _shotsByPlayer[player].Add(new ShotHistoryItem(coordinate, gameStatus, shot.SunkShip));
        return new GameShotResult(gameStatus, coordinate, shot.SunkShip);
    }

    private Board GetBoard(PlayerId player) => player switch
    {
        PlayerId.One => _playerOneBoard,
        PlayerId.Two => _playerTwoBoard,
        _ => throw new ArgumentOutOfRangeException(nameof(player), player, "Unknown player.")
    };

    private static PlayerId OpponentOf(PlayerId player) => player switch
    {
        PlayerId.One => PlayerId.Two,
        PlayerId.Two => PlayerId.One,
        _ => throw new ArgumentOutOfRangeException(nameof(player), player, "Unknown player.")
    };
}
