namespace Battleship.Core;

/// <summary>A random opponent that chooses targets using shot history only.</summary>
public static class RandomOpponent
{
    public static IReadOnlyList<FleetPlacement> CreateFleet(Random? random = null)
    {
        random ??= Random.Shared;
        var occupied = new HashSet<Coordinate>();
        var fleet = new List<FleetPlacement>();
        foreach (var (type, length) in ShipRules.Fleet)
        {
            // Enumerate legal candidates so generation always terminates.
            var candidates = new List<(FleetPlacement Placement, Coordinate[] Cells)>();
            foreach (var orientation in Enum.GetValues<Orientation>())
            for (var y = 0; y < Coordinate.BoardSize; y++)
            for (var x = 0; x < Coordinate.BoardSize; x++)
            {
                var cells = Enumerable.Range(0, length).Select(offset => new Coordinate(
                    x + (orientation == Orientation.Horizontal ? offset : 0),
                    y + (orientation == Orientation.Vertical ? offset : 0))).ToArray();
                if (cells.All(cell => cell.IsWithinBoard && !occupied.Contains(cell)))
                    candidates.Add((new FleetPlacement(type, new Coordinate(x, y), orientation), cells));
            }
            var chosen = candidates[random.Next(candidates.Count)];
            fleet.Add(chosen.Placement);
            occupied.UnionWith(chosen.Cells);
        }
        return fleet;
    }

    public static Coordinate ChooseTarget(IEnumerable<ShotHistoryItem> history, Random? random = null)
    {
        var fired = history.Select(shot => shot.Coordinate).ToHashSet();
        var available = Enumerable.Range(0, 100)
            .Select(index => new Coordinate(index % 10, index / 10))
            .Where(cell => !fired.Contains(cell)).ToArray();
        if (available.Length == 0) throw new InvalidOperationException("No targets remain.");
        return available[(random ?? Random.Shared).Next(available.Length)];
    }
}
