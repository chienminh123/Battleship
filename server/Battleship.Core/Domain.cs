using System.Collections.ObjectModel;

namespace Battleship.Core;

public readonly record struct Coordinate(int X, int Y)
{
    public const int BoardSize = 10;
    public bool IsWithinBoard => X is >= 0 and < BoardSize && Y is >= 0 and < BoardSize;
}

public enum Orientation { Horizontal, Vertical }
public enum ShipType { Carrier, Battleship, Cruiser, Submarine, Destroyer }

public static class ShipRules
{
    private static readonly IReadOnlyDictionary<ShipType, int> FleetDefinition = new ReadOnlyDictionary<ShipType, int>(new Dictionary<ShipType, int>
    {
        [ShipType.Carrier] = 5,
        [ShipType.Battleship] = 4,
        [ShipType.Cruiser] = 3,
        [ShipType.Submarine] = 3,
        [ShipType.Destroyer] = 2
    });

    public static IReadOnlyDictionary<ShipType, int> Fleet => FleetDefinition;

    public static bool IsKnown(ShipType type) => Fleet.ContainsKey(type);

    public static int LengthOf(ShipType type) => Fleet.TryGetValue(type, out var length)
        ? length
        : throw new ArgumentOutOfRangeException(nameof(type), type, "Unknown ship type.");
}

public sealed record FleetPlacement(ShipType Type, Coordinate Start, Orientation Orientation);

public sealed class Ship
{
    private readonly HashSet<Coordinate> _hits = [];

    internal Ship(FleetPlacement placement, IReadOnlyList<Coordinate> cells)
    {
        Type = placement.Type;
        Cells = Array.AsReadOnly(cells.ToArray());
    }

    public ShipType Type { get; }
    public IReadOnlyList<Coordinate> Cells { get; }
    public int Length => Cells.Count;
    public bool IsSunk => _hits.Count == Length;
    public IReadOnlySet<Coordinate> Hits => _hits.ToHashSet();
    internal void RegisterHit(Coordinate coordinate) => _hits.Add(coordinate);
}

public enum FleetErrorCode { FleetAlreadyPlaced, MissingShip, DuplicateShip, UnknownShip, InvalidOrientation, OutOfBounds, Overlap }
public sealed record FleetValidationError(FleetErrorCode Code, ShipType? ShipType = null, Coordinate? Coordinate = null);
public sealed record FleetPlacementResult(bool Success, IReadOnlyList<FleetValidationError> Errors)
{
    internal static FleetPlacementResult Accepted { get; } = new(true, []);
}

public enum BoardShotStatus { Miss, Hit, Sunk, OutOfBounds, AlreadyFired, FleetNotPlaced }
public sealed record BoardShotResult(BoardShotStatus Status, Coordinate Coordinate, ShipType? SunkShip = null)
{
    public bool Accepted => Status is BoardShotStatus.Miss or BoardShotStatus.Hit or BoardShotStatus.Sunk;
}

public sealed record ShipView(ShipType Type, IReadOnlyList<Coordinate> Cells, IReadOnlyList<Coordinate> Hits, bool IsSunk);
public sealed record BoardView(IReadOnlyList<ShipView> Ships, IReadOnlyList<Coordinate> IncomingShots);
