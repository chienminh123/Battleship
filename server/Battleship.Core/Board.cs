namespace Battleship.Core;

public sealed class Board
{
    private readonly Dictionary<Coordinate, Ship> _shipsByCell = [];
    private readonly HashSet<Coordinate> _shots = [];
    private readonly List<Ship> _ships = [];

    public bool FleetPlaced { get; private set; }
    public int RemainingShips => _ships.Count(ship => !ship.IsSunk);
    public int ShotCount => _shots.Count;
    public IReadOnlyList<Ship> Ships => _ships.AsReadOnly();

    public BoardView GetView() => new(
        _ships.Select(ship => new ShipView(
            ship.Type,
            ship.Cells.ToArray(),
            ship.Hits.ToArray(),
            ship.IsSunk)).ToArray(),
        _shots.ToArray());

    public FleetPlacementResult PlaceFleet(IReadOnlyCollection<FleetPlacement> placements)
    {
        ArgumentNullException.ThrowIfNull(placements);
        if (FleetPlaced)
            return new FleetPlacementResult(false, [new FleetValidationError(FleetErrorCode.FleetAlreadyPlaced)]);

        var errors = new List<FleetValidationError>();
        var seenTypes = new HashSet<ShipType>();
        var occupiedCells = new HashSet<Coordinate>();
        var proposedShips = new List<Ship>();

        foreach (var placement in placements)
        {
            if (!ShipRules.IsKnown(placement.Type))
            {
                errors.Add(new FleetValidationError(FleetErrorCode.UnknownShip, placement.Type));
                continue;
            }
            if (!seenTypes.Add(placement.Type))
            {
                errors.Add(new FleetValidationError(FleetErrorCode.DuplicateShip, placement.Type));
                continue;
            }
            if (!Enum.IsDefined(placement.Orientation))
            {
                errors.Add(new FleetValidationError(FleetErrorCode.InvalidOrientation, placement.Type));
                continue;
            }

            var cells = BuildCells(placement);
            var valid = true;
            foreach (var cell in cells)
            {
                if (!cell.IsWithinBoard)
                {
                    errors.Add(new FleetValidationError(FleetErrorCode.OutOfBounds, placement.Type, cell));
                    valid = false;
                }
                else if (!occupiedCells.Add(cell))
                {
                    errors.Add(new FleetValidationError(FleetErrorCode.Overlap, placement.Type, cell));
                    valid = false;
                }
            }
            if (valid) proposedShips.Add(new Ship(placement, cells));
        }

        foreach (var required in ShipRules.Fleet.Keys)
            if (!seenTypes.Contains(required)) errors.Add(new FleetValidationError(FleetErrorCode.MissingShip, required));

        if (errors.Count > 0) return new FleetPlacementResult(false, errors.AsReadOnly());

        foreach (var ship in proposedShips)
        {
            _ships.Add(ship);
            foreach (var cell in ship.Cells) _shipsByCell.Add(cell, ship);
        }
        FleetPlaced = true;
        return FleetPlacementResult.Accepted;
    }

    public BoardShotResult Shoot(Coordinate coordinate)
    {
        if (!FleetPlaced) return new BoardShotResult(BoardShotStatus.FleetNotPlaced, coordinate);
        if (!coordinate.IsWithinBoard) return new BoardShotResult(BoardShotStatus.OutOfBounds, coordinate);
        if (!_shots.Add(coordinate)) return new BoardShotResult(BoardShotStatus.AlreadyFired, coordinate);
        if (!_shipsByCell.TryGetValue(coordinate, out var ship)) return new BoardShotResult(BoardShotStatus.Miss, coordinate);
        ship.RegisterHit(coordinate);
        return ship.IsSunk
            ? new BoardShotResult(BoardShotStatus.Sunk, coordinate, ship.Type)
            : new BoardShotResult(BoardShotStatus.Hit, coordinate);
    }

    private static Coordinate[] BuildCells(FleetPlacement placement)
    {
        var length = ShipRules.LengthOf(placement.Type);
        return Enumerable.Range(0, length)
            .Select(offset => placement.Orientation == Orientation.Horizontal
                ? new Coordinate(placement.Start.X + offset, placement.Start.Y)
                : new Coordinate(placement.Start.X, placement.Start.Y + offset))
            .ToArray();
    }
}
