namespace Battleship.Server;

public sealed class RoomCreationLimiter(TimeProvider clock)
{
    private static readonly TimeSpan Window = TimeSpan.FromMinutes(1);
    private const int Limit = 5;
    private readonly object _sync = new();
    private readonly Dictionary<string, Queue<DateTimeOffset>> _clients = [];
    private DateTimeOffset _nextCleanup = DateTimeOffset.MinValue;

    internal int TrackedClientCount { get { lock (_sync) return _clients.Count; } }

    public bool TryAcquire(string clientId)
    {
        lock (_sync)
        {
            var now = clock.GetUtcNow();
            var cutoff = now - Window;
            if (now >= _nextCleanup)
            {
                foreach (var expired in _clients.Where(pair => pair.Value.Last() <= cutoff).Select(pair => pair.Key).ToArray())
                    _clients.Remove(expired);
                _nextCleanup = now + Window;
            }
            if (!_clients.TryGetValue(clientId, out var requests)) _clients[clientId] = requests = new();
            while (requests.TryPeek(out var timestamp) && timestamp <= cutoff) requests.Dequeue();
            if (requests.Count >= Limit) return false;
            requests.Enqueue(now);
            return true;
        }
    }
}
