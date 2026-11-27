namespace Battleship.Core;

public enum BotDifficulty { Easy, Hard, Annihilation }

/// <summary>Chooses shots from public shot history only; never receives an opponent board.</summary>
public static class BotOpponent
{
    private sealed record Placement(ShipType Type, Coordinate[] Cells);
    private static readonly Placement[] Placements = BuildPlacements();

    public static Coordinate ChooseTarget(IEnumerable<ShotHistoryItem> history, BotDifficulty difficulty,
        Random? random = null)
    {
        if (!Enum.IsDefined(difficulty)) throw new ArgumentOutOfRangeException(nameof(difficulty));
        var shots = history.ToArray();
        random ??= Random.Shared;
        if (difficulty == BotDifficulty.Easy) return RandomOpponent.ChooseTarget(shots, random);

        var fired = shots.Select(shot => shot.Coordinate).ToHashSet();
        var sunkShots = shots.Where(shot => shot.Status is GameShotStatus.Sunk or GameShotStatus.Won).ToArray();
        var sunkTypes = sunkShots.Where(shot => shot.SunkShip.HasValue).Select(shot => shot.SunkShip!.Value).ToHashSet();
        var sunkCells = sunkShots.SelectMany(shot => shot.SunkCells ?? [shot.Coordinate]).ToHashSet();
        var hits = shots.Where(shot => shot.Status == GameShotStatus.Hit)
            .Select(shot => shot.Coordinate).Where(cell => !sunkCells.Contains(cell)).ToHashSet();
        var blocked = shots.Where(shot => shot.Status == GameShotStatus.Miss).Select(shot => shot.Coordinate).ToHashSet();
        blocked.UnionWith(sunkCells);

        var huntScores = new int[Coordinate.BoardSize * Coordinate.BoardSize];
        var targetScores = new int[huntScores.Length];
        var extensionLengths = new int[huntScores.Length];
        foreach (var placement in Placements)
        {
            if (sunkTypes.Contains(placement.Type) || placement.Cells.Any(blocked.Contains) ||
                placement.Cells.All(fired.Contains)) continue;
            var hitCount = placement.Cells.Count(hits.Contains);
            for (var index = 0; index < placement.Cells.Length; index++)
            {
                var cell = placement.Cells[index];
                if (fired.Contains(cell)) continue;
                var key = cell.Y * Coordinate.BoardSize + cell.X;
                huntScores[key]++;

                // Extend a run from either end. A hit elsewhere on this line is only
                // a hypothesis: touching ships must not permanently lock an axis.
                var run = 0;
                for (var previous = index - 1; previous >= 0 && hits.Contains(placement.Cells[previous]); previous--) run++;
                var followingRun = 0;
                for (var next = index + 1; next < placement.Cells.Length && hits.Contains(placement.Cells[next]); next++) followingRun++;
                run = Math.Max(run, followingRun);
                if (run == 0) continue;
                extensionLengths[key] = Math.Max(extensionLengths[key], run);
                targetScores[key] += hitCount * hitCount;
            }
        }

        var longestExtension = extensionLengths.Max();
        if (longestExtension > 0)
        {
            var candidates = Enumerable.Range(0, extensionLengths.Length)
                .Where(key => extensionLengths[key] == longestExtension).ToArray();
            if (difficulty == BotDifficulty.Annihilation)
            {
                var best = candidates.Max(key => targetScores[key]);
                candidates = candidates.Where(key => targetScores[key] == best).ToArray();
            }
            return ToCoordinate(candidates[random.Next(candidates.Length)]);
        }

        if (difficulty == BotDifficulty.Annihilation)
        {
            var best = huntScores.Max();
            if (best > 0)
            {
                var candidates = Enumerable.Range(0, huntScores.Length).Where(key => huntScores[key] == best).ToArray();
                return ToCoordinate(candidates[random.Next(candidates.Length)]);
            }
        }
        return RandomOpponent.ChooseTarget(shots, random);
    }

    private static Coordinate ToCoordinate(int key) => new(key % Coordinate.BoardSize, key / Coordinate.BoardSize);

    private static Placement[] BuildPlacements()
    {
        var placements = new List<Placement>();
        foreach (var (type, length) in ShipRules.Fleet)
        foreach (var orientation in Enum.GetValues<Orientation>())
        for (var y = 0; y < Coordinate.BoardSize; y++)
        for (var x = 0; x < Coordinate.BoardSize; x++)
        {
            var cells = Enumerable.Range(0, length).Select(offset => new Coordinate(
                x + (orientation == Orientation.Horizontal ? offset : 0),
                y + (orientation == Orientation.Vertical ? offset : 0))).ToArray();
            if (cells.All(cell => cell.IsWithinBoard)) placements.Add(new Placement(type, cells));
        }
        return placements.ToArray();
    }
}
