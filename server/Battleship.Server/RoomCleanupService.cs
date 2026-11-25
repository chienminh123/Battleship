namespace Battleship.Server;

public sealed class RoomCleanupService(IRoomStore rooms, ILogger<RoomCleanupService> logger) : BackgroundService
{
    private static readonly TimeSpan AbandonedAfter = TimeSpan.FromMinutes(30);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(1));
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                var cutoff = DateTime.UtcNow - AbandonedAfter;
                foreach (var room in rooms.Rooms)
                {
                    lock (room.SyncRoot)
                    {
                        if (!room.HasAnyConnection && room.LastActivityUtc < cutoff && rooms.TryRemove(room.Code, out _))
                            logger.LogInformation("Removed abandoned room {RoomCode}", room.Code);
                    }
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Cancellation is expected when the host stops, including startup failures.
        }
    }
}
